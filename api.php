<?php
/**
 * Jigsaw Puzzle API - Multiuser shared puzzle system
 * @version 2.0.0
 *
 * Endpoints:
 * - POST /api.php?action=saveShared - Save shared puzzle state
 * - GET /api.php?action=loadShared&image={imageName} - Load shared puzzle
 * - POST /api.php?action=resetPuzzle&image={imageName} - Reset puzzle (scatter pieces)
 * - GET /api.php?action=listBackups&image={imageName} - List backups
 * - POST /api.php?action=restoreBackup&image={imageName}&backup={filename} - Restore backup
 * - POST /api.php?action=updateSelection - Broadcast user's selection
 * - GET /api.php?action=subscribe&image={imageName} - SSE subscription
 * - POST /api.php?action=saveUserPrefs - Save user preferences (name, color)
 * - GET /api.php?action=getUserPrefs - Get user preferences
 */

require_once __DIR__ . '/php/config.php';

/**
 * Send JSON response
 */
function sendResponse($success, $data = null, $message = '', $httpCode = 200) {
    http_response_code($httpCode);
    echo json_encode([
        'success' => $success,
        'data' => $data,
        'message' => $message,
        'timestamp' => time()
    ]);
    exit();
}

/**
 * Create backup of current puzzle state
 * @param string $imageName Image name
 * @return string|null Backup filename or null on failure
 */
function createBackup($imageName) {
    $puzzleDir = getSharedPuzzleDir($imageName);
    $statePath = getSharedPuzzlePath($imageName);

    if (!file_exists($statePath)) return null;

    $backupDir = $puzzleDir . '/backups';
    if (!file_exists($backupDir)) {
        mkdir($backupDir, 0755, true);
    }

    $timestamp = date('Ymd_His');
    $backupFile = "backup_{$timestamp}.json";
    $backupPath = $backupDir . '/' . $backupFile;

    // Copy current state to backup
    copy($statePath, $backupPath);

    // Clean up old backups (keep MAX_BACKUPS)
    cleanupBackups($backupDir);

    return $backupFile;
}

/**
 * Clean up old backups, keeping only MAX_BACKUPS most recent
 * @param string $backupDir Backup directory path
 */
function cleanupBackups($backupDir) {
    $files = glob($backupDir . '/backup_*.json');
    if (count($files) <= MAX_BACKUPS) return;

    // Sort by filename (which includes timestamp)
    sort($files);

    // Remove oldest files
    $toDelete = count($files) - MAX_BACKUPS;
    for ($i = 0; $i < $toDelete; $i++) {
        unlink($files[$i]);
    }
}

/**
 * Save shared puzzle state
 */
function saveSharedPuzzle() {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!$data || !isset($data['image']) || !isset($data['state'])) {
        sendResponse(false, null, 'Missing required fields: image, state', 400);
    }

    $imageName = imagePathToName($data['image']);
    $puzzleDir = getSharedPuzzleDir($imageName);
    $statePath = getSharedPuzzlePath($imageName);

    // Create puzzle directory if needed
    if (!file_exists($puzzleDir)) {
        mkdir($puzzleDir, 0755, true);
    }

    // Check if we need to create a periodic backup
    $existingState = safeReadJson($statePath);
    $shouldBackup = false;
    if ($existingState && isset($existingState['metadata']['lastBackup'])) {
        $lastBackup = $existingState['metadata']['lastBackup'];
        if (time() - $lastBackup >= BACKUP_INTERVAL) {
            $shouldBackup = true;
        }
    } else if ($existingState) {
        // No lastBackup recorded, create one
        $shouldBackup = true;
    }

    if ($shouldBackup) {
        createBackup($imageName);
    }

    // Prepare state data
    $stateData = [
        'id' => 'puzzle_' . $imageName,
        'image' => $data['image'],
        'pieceCount' => $data['state']['pieceCount'] ?? 0,
        'pieces' => $data['state']['pieces'] ?? [],
        'groups' => $data['state']['groups'] ?? [],
        'camera' => $data['state']['camera'] ?? ['x' => 0, 'y' => 0, 'scale' => 1],
        'selections' => $data['state']['selections'] ?? [],
        'metadata' => [
            'createdAt' => $existingState['metadata']['createdAt'] ?? time(),
            'updatedAt' => time(),
            'lastUser' => $_SESSION['puzzle_user_id'],
            'lastBackup' => $shouldBackup ? time() : ($existingState['metadata']['lastBackup'] ?? time()),
            'progress' => $data['state']['progress'] ?? 0
        ]
    ];

    if (safeWriteJson($statePath, $stateData)) {
        sendResponse(true, [
            'imageName' => $imageName,
            'savedAt' => time(),
            'backupCreated' => $shouldBackup
        ], 'Puzzle saved successfully');
    } else {
        sendResponse(false, null, 'Failed to save puzzle', 500);
    }
}

/**
 * Load shared puzzle state
 */
function loadSharedPuzzle() {
    $image = $_GET['image'] ?? '';

    if (empty($image)) {
        sendResponse(false, null, 'Image name required', 400);
    }

    $imageName = imagePathToName($image);
    $statePath = getSharedPuzzlePath($imageName);

    if (!file_exists($statePath)) {
        sendResponse(true, ['exists' => false], 'No saved puzzle for this image');
    }

    $data = safeReadJson($statePath);
    if (!$data) {
        sendResponse(false, null, 'Failed to read puzzle data', 500);
    }

    // Clean up stale selections (older than SELECTION_TIMEOUT)
    if (isset($data['selections'])) {
        $now = time();
        foreach ($data['selections'] as $userId => $selection) {
            if (isset($selection['timestamp']) && ($now - $selection['timestamp']) > SELECTION_TIMEOUT) {
                unset($data['selections'][$userId]);
            }
        }
    }

    sendResponse(true, [
        'exists' => true,
        'puzzle' => $data
    ], 'Puzzle loaded successfully');
}

/**
 * Reset puzzle - creates backup and clears state
 */
function resetPuzzle() {
    $image = $_GET['image'] ?? '';

    if (empty($image)) {
        sendResponse(false, null, 'Image name required', 400);
    }

    $imageName = imagePathToName($image);
    $statePath = getSharedPuzzlePath($imageName);

    // Create backup before reset
    if (file_exists($statePath)) {
        createBackup($imageName);
    }

    // Delete the state file (will be recreated when puzzle starts fresh)
    if (file_exists($statePath)) {
        unlink($statePath);
    }

    sendResponse(true, [
        'imageName' => $imageName,
        'reset' => true
    ], 'Puzzle reset successfully');
}

/**
 * List available backups
 */
function listBackups() {
    $image = $_GET['image'] ?? '';

    if (empty($image)) {
        sendResponse(false, null, 'Image name required', 400);
    }

    $imageName = imagePathToName($image);
    $backupDir = getSharedPuzzleDir($imageName) . '/backups';

    if (!file_exists($backupDir)) {
        sendResponse(true, ['backups' => []], 'No backups found');
    }

    $files = glob($backupDir . '/backup_*.json');
    $backups = [];

    foreach ($files as $file) {
        $filename = basename($file);
        // Extract timestamp from filename: backup_YYYYMMDD_HHMMSS.json
        preg_match('/backup_(\d{8})_(\d{6})\.json/', $filename, $matches);

        if (count($matches) === 3) {
            $dateStr = $matches[1];
            $timeStr = $matches[2];
            $timestamp = strtotime(substr($dateStr, 0, 4) . '-' . substr($dateStr, 4, 2) . '-' . substr($dateStr, 6, 2) .
                ' ' . substr($timeStr, 0, 2) . ':' . substr($timeStr, 2, 2) . ':' . substr($timeStr, 4, 2));

            // Read backup to get progress
            $backupData = safeReadJson($file);
            $progress = $backupData['metadata']['progress'] ?? 0;

            $backups[] = [
                'filename' => $filename,
                'timestamp' => $timestamp,
                'progress' => $progress,
                'size' => filesize($file)
            ];
        }
    }

    // Sort by timestamp descending (most recent first)
    usort($backups, function($a, $b) {
        return $b['timestamp'] - $a['timestamp'];
    });

    sendResponse(true, ['backups' => $backups], 'Backups retrieved successfully');
}

/**
 * Restore from backup
 */
function restoreBackup() {
    $image = $_GET['image'] ?? '';
    $backupFile = $_GET['backup'] ?? '';

    if (empty($image) || empty($backupFile)) {
        sendResponse(false, null, 'Image name and backup filename required', 400);
    }

    $imageName = imagePathToName($image);
    $backupDir = getSharedPuzzleDir($imageName) . '/backups';
    $backupPath = $backupDir . '/' . basename($backupFile); // Sanitize filename
    $statePath = getSharedPuzzlePath($imageName);

    if (!file_exists($backupPath)) {
        sendResponse(false, null, 'Backup file not found', 404);
    }

    // Create backup of current state before restoring
    if (file_exists($statePath)) {
        createBackup($imageName);
    }

    // Copy backup to state
    if (copy($backupPath, $statePath)) {
        sendResponse(true, [
            'imageName' => $imageName,
            'restored' => $backupFile
        ], 'Backup restored successfully');
    } else {
        sendResponse(false, null, 'Failed to restore backup', 500);
    }
}

/**
 * Update user's piece selection (for remote user visibility)
 */
function updateSelection() {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!$data || !isset($data['image'])) {
        sendResponse(false, null, 'Missing required fields: image', 400);
    }

    $imageName = imagePathToName($data['image']);
    $statePath = getSharedPuzzlePath($imageName);

    if (!file_exists($statePath)) {
        sendResponse(false, null, 'Puzzle not found', 404);
    }

    $state = safeReadJson($statePath);
    if (!$state) {
        sendResponse(false, null, 'Failed to read puzzle state', 500);
    }

    $userId = $_SESSION['puzzle_user_id'];

    // Initialize selections if not present
    if (!isset($state['selections'])) {
        $state['selections'] = [];
    }

    // Update or clear user's selection
    if (isset($data['pieceIds']) && is_array($data['pieceIds']) && count($data['pieceIds']) > 0) {
        $state['selections'][$userId] = [
            'pieceIds' => $data['pieceIds'],
            'color' => $data['color'] ?? '#667eea',
            'displayName' => $data['displayName'] ?? 'Player',
            'timestamp' => time()
        ];
    } else {
        // Clear selection
        unset($state['selections'][$userId]);
    }

    // Clean up stale selections
    $now = time();
    foreach ($state['selections'] as $uid => $selection) {
        if (isset($selection['timestamp']) && ($now - $selection['timestamp']) > SELECTION_TIMEOUT) {
            unset($state['selections'][$uid]);
        }
    }

    if (safeWriteJson($statePath, $state)) {
        sendResponse(true, ['userId' => $userId], 'Selection updated');
    } else {
        sendResponse(false, null, 'Failed to update selection', 500);
    }
}

/**
 * SSE subscription for real-time updates
 */
function subscribeToUpdates() {
    $image = $_GET['image'] ?? '';

    if (empty($image)) {
        http_response_code(400);
        echo "data: {\"error\": \"Image name required\"}\n\n";
        exit();
    }

    $imageName = imagePathToName($image);
    $statePath = getSharedPuzzlePath($imageName);

    // Set SSE headers
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no'); // Disable nginx buffering

    // Disable output buffering
    while (ob_get_level()) {
        ob_end_flush();
    }

    $lastMtime = file_exists($statePath) ? filemtime($statePath) : 0;
    $startTime = time();
    $userId = $_SESSION['puzzle_user_id'];

    // Send initial connection event
    echo "event: connected\n";
    echo "data: {\"userId\": \"$userId\", \"image\": \"$imageName\"}\n\n";
    flush();

    // Poll for changes until timeout
    while (time() - $startTime < SSE_TIMEOUT) {
        if (connection_aborted()) break;

        clearstatcache(true, $statePath);
        $currentMtime = file_exists($statePath) ? filemtime($statePath) : 0;

        if ($currentMtime > $lastMtime) {
            $lastMtime = $currentMtime;

            // Read and send updated state
            $state = safeReadJson($statePath);
            if ($state) {
                // Don't send the requesting user's own selection back
                if (isset($state['selections'][$userId])) {
                    unset($state['selections'][$userId]);
                }

                echo "event: puzzleUpdate\n";
                echo "data: " . json_encode([
                    'timestamp' => $currentMtime,
                    'puzzle' => $state
                ]) . "\n\n";
                flush();
            }
        }

        // Send heartbeat every 10 seconds
        static $lastHeartbeat = 0;
        if (time() - $lastHeartbeat >= 10) {
            echo ": heartbeat\n\n";
            flush();
            $lastHeartbeat = time();
        }

        usleep(SSE_POLL_INTERVAL);
    }

    // Send reconnect hint
    echo "event: timeout\n";
    echo "data: {\"reconnect\": true}\n\n";
    flush();
}

/**
 * Save user preferences
 */
function saveUserPrefs() {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!$data) {
        sendResponse(false, null, 'Invalid JSON data', 400);
    }

    $userId = $_SESSION['puzzle_user_id'];
    $prefsPath = getUserPrefsPath($userId);

    $prefs = [
        'userId' => $userId,
        'displayName' => $data['displayName'] ?? 'Player',
        'color' => $data['color'] ?? '#667eea',
        'updatedAt' => time()
    ];

    if (safeWriteJson($prefsPath, $prefs)) {
        sendResponse(true, $prefs, 'Preferences saved');
    } else {
        sendResponse(false, null, 'Failed to save preferences', 500);
    }
}

/**
 * Get user preferences
 */
function getUserPrefs() {
    $userId = $_SESSION['puzzle_user_id'];
    $prefsPath = getUserPrefsPath($userId);

    $prefs = safeReadJson($prefsPath);

    if (!$prefs) {
        // Return defaults
        $prefs = [
            'userId' => $userId,
            'displayName' => 'Player ' . substr($userId, -4),
            'color' => '#' . substr(md5($userId), 0, 6),
            'updatedAt' => time()
        ];
    }

    sendResponse(true, $prefs, 'Preferences retrieved');
}

// Route request based on action
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'saveShared':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            saveSharedPuzzle();
            break;

        case 'loadShared':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            loadSharedPuzzle();
            break;

        case 'resetPuzzle':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            resetPuzzle();
            break;

        case 'listBackups':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            listBackups();
            break;

        case 'restoreBackup':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            restoreBackup();
            break;

        case 'updateSelection':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            updateSelection();
            break;

        case 'subscribe':
            subscribeToUpdates();
            break;

        case 'saveUserPrefs':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            saveUserPrefs();
            break;

        case 'getUserPrefs':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            getUserPrefs();
            break;

        default:
            sendResponse(false, null, 'Invalid action. Available: saveShared, loadShared, resetPuzzle, listBackups, restoreBackup, updateSelection, subscribe, saveUserPrefs, getUserPrefs', 400);
    }
} catch (Exception $e) {
    sendResponse(false, null, 'Server error: ' . $e->getMessage(), 500);
}
