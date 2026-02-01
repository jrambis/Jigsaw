<?php
/**
 * Jigsaw Puzzle API - Multiuser shared puzzle system
 * @version 2.1.0
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
 * - POST /api.php?action=uploadImage - Upload a new image (multipart/form-data)
 * - GET /api.php?action=listImages - List all available images
 * - POST /api.php?action=reportBug - Submit a bug report
 * - GET /api.php?action=listBugs - List all bug reports
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

    // Prepare state data - preserve existing selections (managed via updateSelection endpoint)
    $stateData = [
        'id' => 'puzzle_' . $imageName,
        'image' => $data['image'],
        'pieceCount' => $data['state']['pieceCount'] ?? 0,
        'pieces' => $data['state']['pieces'] ?? [],
        'groups' => $data['state']['groups'] ?? [],
        'camera' => $data['state']['camera'] ?? ['x' => 0, 'y' => 0, 'scale' => 1],
        'selections' => $existingState['selections'] ?? [],
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
        $selectionData = [
            'pieceIds' => $data['pieceIds'],
            'color' => $data['color'] ?? '#667eea',
            'displayName' => $data['displayName'] ?? 'Player',
            'timestamp' => time()
        ];

        // Include positions if provided (for real-time drag sync)
        if (isset($data['positions']) && is_array($data['positions'])) {
            $selectionData['positions'] = $data['positions'];
        }

        if (isset($data['referenceSelected'])) {
            $selectionData['referenceSelected'] = $data['referenceSelected'];
        }

        $state['selections'][$userId] = $selectionData;
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

    // Release session lock so other requests aren't blocked during SSE polling
    session_write_close();

    // Send initial connection event
    echo "event: connected\n";
    echo "data: {\"userId\": \"$userId\", \"image\": \"$imageName\"}\n\n";
    flush();

    // Track last cleanup time
    $lastCleanup = 0;
    $cleanupInterval = 5; // Clean up stale selections every 5 seconds

    // Poll for changes until timeout
    while (time() - $startTime < SSE_TIMEOUT) {
        if (connection_aborted()) break;

        clearstatcache(true, $statePath);
        $currentMtime = file_exists($statePath) ? filemtime($statePath) : 0;

        // Periodically clean up stale selections
        $now = time();
        if ($now - $lastCleanup >= $cleanupInterval) {
            $lastCleanup = $now;

            $state = safeReadJson($statePath);
            if ($state && isset($state['selections'])) {
                $cleaned = false;
                foreach ($state['selections'] as $uid => $selection) {
                    if (isset($selection['timestamp']) && ($now - $selection['timestamp']) > SELECTION_TIMEOUT) {
                        unset($state['selections'][$uid]);
                        $cleaned = true;
                    }
                }
                // Save if we cleaned anything
                if ($cleaned) {
                    safeWriteJson($statePath, $state);
                    // Force mtime update detection
                    clearstatcache(true, $statePath);
                    $currentMtime = filemtime($statePath);
                }
            }
        }

        if ($currentMtime > $lastMtime) {
            $lastMtime = $currentMtime;

            // Read and send updated state
            $state = safeReadJson($statePath);
            if ($state) {
                // Clean stale selections from the response (even if not persisted yet)
                if (isset($state['selections'])) {
                    foreach ($state['selections'] as $uid => $selection) {
                        if (isset($selection['timestamp']) && ($now - $selection['timestamp']) > SELECTION_TIMEOUT) {
                            unset($state['selections'][$uid]);
                        }
                    }
                }

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

/**
 * Upload an image
 */
function uploadImage() {
    // Check if file was uploaded
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        $errorMessage = 'No file uploaded';
        if (isset($_FILES['image']['error'])) {
            $maxUpload = ini_get('upload_max_filesize');
            $maxPost = ini_get('post_max_size');
            switch ($_FILES['image']['error']) {
                case UPLOAD_ERR_INI_SIZE:
                    $errorMessage = "File exceeds PHP limit (upload_max_filesize={$maxUpload}). Increase in php.ini.";
                    break;
                case UPLOAD_ERR_FORM_SIZE:
                    $errorMessage = "File exceeds form limit (post_max_size={$maxPost}). Increase in php.ini.";
                    break;
                case UPLOAD_ERR_PARTIAL:
                    $errorMessage = 'Upload incomplete';
                    break;
                case UPLOAD_ERR_NO_FILE:
                    $errorMessage = 'No file selected';
                    break;
            }
        }
        sendResponse(false, null, $errorMessage, 400);
    }

    $file = $_FILES['image'];
    $displayName = isset($_POST['name']) ? trim($_POST['name']) : '';

    // Validate file size
    if ($file['size'] > MAX_UPLOAD_SIZE) {
        sendResponse(false, null, 'File too large. Maximum size is 10MB.', 400);
    }

    // Validate MIME type using finfo (server-side validation)
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);

    if (!in_array($mimeType, ALLOWED_IMAGE_TYPES)) {
        sendResponse(false, null, 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP.', 400);
    }

    // Validate image dimensions
    $imageInfo = getimagesize($file['tmp_name']);
    if (!$imageInfo) {
        sendResponse(false, null, 'Invalid image file.', 400);
    }

    $width = $imageInfo[0];
    $height = $imageInfo[1];

    if ($width > MAX_IMAGE_DIMENSION || $height > MAX_IMAGE_DIMENSION) {
        sendResponse(false, null, "Image too large. Maximum dimension is " . MAX_IMAGE_DIMENSION . "px.", 400);
    }

    // Generate unique filename
    $timestamp = time();
    $hash = substr(md5($file['tmp_name'] . $timestamp . rand()), 0, 8);
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'][$mimeType];
    $filename = "upload_{$timestamp}_{$hash}.{$ext}";
    $filepath = UPLOADS_DIR . '/' . $filename;

    // Move uploaded file
    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        sendResponse(false, null, 'Failed to save uploaded file.', 500);
    }

    // Generate display name if not provided
    if (empty($displayName)) {
        // Use original filename without extension
        $displayName = pathinfo($file['name'], PATHINFO_FILENAME);
        // Clean up common patterns
        $displayName = preg_replace('/[_-]+/', ' ', $displayName);
        $displayName = ucwords(trim($displayName));
    }

    // Store metadata
    $metadataPath = UPLOADS_DIR . '/metadata.json';
    $metadata = safeReadJson($metadataPath) ?: [];
    $metadata[$filename] = [
        'name' => $displayName,
        'uploadedAt' => $timestamp,
        'originalName' => $file['name'],
        'size' => $file['size'],
        'dimensions' => ['width' => $width, 'height' => $height]
    ];

    if (!safeWriteJson($metadataPath, $metadata)) {
        // Clean up the uploaded file if metadata save fails
        unlink($filepath);
        sendResponse(false, null, 'Failed to save image metadata.', 500);
    }

    sendResponse(true, [
        'imagePath' => 'data/uploads/' . $filename,
        'name' => $displayName,
        'filename' => $filename
    ], 'Image uploaded successfully');
}

/**
 * Delete an uploaded image and its puzzle data
 */
function deleteImage() {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!$data || !isset($data['imagePath'])) {
        sendResponse(false, null, 'Image path required', 400);
    }

    $imagePath = $data['imagePath'];

    // Security: Only allow deleting uploaded images (not built-in)
    if (strpos($imagePath, 'data/uploads/') !== 0) {
        sendResponse(false, null, 'Can only delete uploaded images', 403);
    }

    // Extract filename from path
    $filename = basename($imagePath);

    // Validate filename format (must match upload pattern)
    if (!preg_match('/^upload_\d+_[a-f0-9]+\.(jpg|jpeg|png|gif|webp)$/', $filename)) {
        sendResponse(false, null, 'Invalid image filename', 400);
    }

    $filepath = UPLOADS_DIR . '/' . $filename;

    // Check if file exists
    if (!file_exists($filepath)) {
        sendResponse(false, null, 'Image not found', 404);
    }

    // Delete the image file
    if (!unlink($filepath)) {
        sendResponse(false, null, 'Failed to delete image file', 500);
    }

    // Remove from metadata
    $metadataPath = UPLOADS_DIR . '/metadata.json';
    $metadata = safeReadJson($metadataPath) ?: [];
    if (isset($metadata[$filename])) {
        unset($metadata[$filename]);
        safeWriteJson($metadataPath, $metadata);
    }

    // Delete associated puzzle data
    $imageName = imagePathToName($imagePath);
    $puzzleDir = getSharedPuzzleDir($imageName);
    if (is_dir($puzzleDir)) {
        // Delete all files in puzzle directory
        $files = glob($puzzleDir . '/*');
        foreach ($files as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        // Delete backups subdirectory
        $backupDir = $puzzleDir . '/backups';
        if (is_dir($backupDir)) {
            $backupFiles = glob($backupDir . '/*');
            foreach ($backupFiles as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            rmdir($backupDir);
        }
        rmdir($puzzleDir);
    }

    sendResponse(true, ['deleted' => $imagePath], 'Image and puzzle data deleted');
}

/**
 * List all available images (built-in + uploaded)
 */
function listImages() {
    $images = [];

    // Scan built-in images from /images/ directory
    $imagesDir = __DIR__ . '/images';
    if (is_dir($imagesDir)) {
        $files = glob($imagesDir . '/*.{jpg,jpeg,png,gif,webp}', GLOB_BRACE);
        foreach ($files as $file) {
            $filename = basename($file);
            $name = pathinfo($filename, PATHINFO_FILENAME);
            // Convert camelCase/PascalCase to readable name
            $displayName = preg_replace('/([a-z])([A-Z])/', '$1 $2', $name);

            $images[] = [
                'path' => 'images/' . $filename,
                'name' => $displayName,
                'isUploaded' => false,
                'timestamp' => filemtime($file)
            ];
        }
    }

    // Scan uploaded images
    if (is_dir(UPLOADS_DIR)) {
        $metadataPath = UPLOADS_DIR . '/metadata.json';
        $metadata = safeReadJson($metadataPath) ?: [];

        $uploadedFiles = glob(UPLOADS_DIR . '/*.{jpg,jpeg,png,gif,webp}', GLOB_BRACE);
        foreach ($uploadedFiles as $file) {
            $filename = basename($file);
            $meta = $metadata[$filename] ?? null;

            $displayName = $meta['name'] ?? pathinfo($filename, PATHINFO_FILENAME);
            $timestamp = $meta['uploadedAt'] ?? filemtime($file);

            $images[] = [
                'path' => 'data/uploads/' . $filename,
                'name' => $displayName,
                'isUploaded' => true,
                'timestamp' => $timestamp
            ];
        }
    }

    // Sort: built-in first (alphabetically), then uploads by date descending
    usort($images, function($a, $b) {
        // Built-in images come first
        if ($a['isUploaded'] !== $b['isUploaded']) {
            return $a['isUploaded'] ? 1 : -1;
        }
        // Within same category
        if ($a['isUploaded']) {
            // Uploads: newest first
            return $b['timestamp'] - $a['timestamp'];
        } else {
            // Built-in: alphabetical
            return strcasecmp($a['name'], $b['name']);
        }
    });

    sendResponse(true, ['images' => $images], 'Images listed successfully');
}

/**
 * Submit a bug report
 */
function reportBug() {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!$data || !isset($data['description'])) {
        sendResponse(false, null, 'Missing required field: description', 400);
    }

    $description = trim($data['description']);
    if (empty($description)) {
        sendResponse(false, null, 'Description cannot be empty', 400);
    }

    // Sanitize description
    $description = htmlspecialchars($description, ENT_QUOTES, 'UTF-8');
    $description = substr($description, 0, 2000);

    // Anonymize IP (zero last octet)
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $parts = explode('.', $ip);
    if (count($parts) === 4) {
        $parts[3] = '0';
        $ip = implode('.', $parts);
    }

    $report = [
        'description' => $description,
        'timestamp' => $data['timestamp'] ?? null,
        'consoleLog' => $data['consoleLog'] ?? [],
        'userAgent' => $data['userAgent'] ?? null,
        'viewport' => $data['viewport'] ?? null,
        'puzzleState' => $data['puzzleState'] ?? null,
        'url' => $data['url'] ?? null,
        'receivedAt' => date('c'),
        'ip' => $ip
    ];

    $filename = 'bug_' . date('Ymd_His') . '_' . uniqid() . '.json';
    $filepath = BUGS_DIR . '/' . $filename;

    if (safeWriteJson($filepath, $report)) {
        sendResponse(true, ['filename' => $filename], 'Bug report submitted successfully');
    } else {
        sendResponse(false, null, 'Failed to save bug report', 500);
    }
}

/**
 * List all bug reports (newest first)
 */
function listBugs() {
    if (!is_dir(BUGS_DIR)) {
        sendResponse(true, ['bugs' => []], 'No bug reports found');
    }

    $files = glob(BUGS_DIR . '/bug_*.json');
    $bugs = [];

    foreach ($files as $file) {
        $data = safeReadJson($file);
        if ($data) {
            $data['_filename'] = basename($file);
            $bugs[] = $data;
        }
    }

    // Sort by receivedAt descending (newest first)
    usort($bugs, function($a, $b) {
        return strcmp($b['receivedAt'] ?? '', $a['receivedAt'] ?? '');
    });

    sendResponse(true, ['bugs' => $bugs], 'Bug reports retrieved successfully');
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

        case 'uploadImage':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            uploadImage();
            break;

        case 'listImages':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            listImages();
            break;

        case 'deleteImage':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            deleteImage();
            break;

        case 'reportBug':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            reportBug();
            break;

        case 'listBugs':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            listBugs();
            break;

        default:
            sendResponse(false, null, 'Invalid action. Available: saveShared, loadShared, resetPuzzle, listBackups, restoreBackup, updateSelection, subscribe, saveUserPrefs, getUserPrefs, uploadImage, listImages, reportBug, listBugs', 400);
    }
} catch (Exception $e) {
    sendResponse(false, null, 'Server error: ' . $e->getMessage(), 500);
}
