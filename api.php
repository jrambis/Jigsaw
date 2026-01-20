<?php
/**
 * Jigsaw Puzzle API - Handles puzzle state persistence
 * @version 1.0.0
 *
 * Endpoints:
 * - POST /api.php?action=save - Save puzzle state
 * - GET /api.php?action=load&id={id} - Load puzzle state
 * - GET /api.php?action=list - List all saved puzzles
 * - DELETE /api.php?action=delete&id={id} - Delete puzzle
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
 * Get puzzle file path
 */
function getPuzzleFilePath($puzzleId) {
    $userId = $_SESSION['puzzle_user_id'];
    $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $puzzleId);
    return DATA_DIR . "/puzzle_{$userId}_{$safeId}.json";
}

/**
 * Get all puzzle files for current user
 */
function getUserPuzzleFiles() {
    $userId = $_SESSION['puzzle_user_id'];
    $pattern = DATA_DIR . "/puzzle_{$userId}_*.json";
    return glob($pattern);
}

/**
 * Save puzzle state
 */
function savePuzzle() {
    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!$data) {
        sendResponse(false, null, 'Invalid JSON data', 400);
    }

    // Validate required fields
    if (!isset($data['puzzleId']) || !isset($data['state'])) {
        sendResponse(false, null, 'Missing required fields: puzzleId, state', 400);
    }

    // Check puzzle count limit
    $existingPuzzles = getUserPuzzleFiles();
    $filePath = getPuzzleFilePath($data['puzzleId']);

    if (count($existingPuzzles) >= MAX_PUZZLES && !file_exists($filePath)) {
        sendResponse(false, null, 'Maximum puzzle limit reached', 400);
    }

    // Prepare puzzle data
    $puzzleData = [
        'id' => $data['puzzleId'],
        'name' => $data['name'] ?? 'Untitled Puzzle',
        'state' => $data['state'],
        'metadata' => [
            'pieceCount' => $data['state']['pieceCount'] ?? 0,
            'progress' => $data['state']['progress'] ?? 0,
            'image' => $data['state']['image'] ?? '',
            'createdAt' => $data['createdAt'] ?? time(),
            'updatedAt' => time()
        ]
    ];

    // Save to file
    if (file_put_contents($filePath, json_encode($puzzleData, JSON_PRETTY_PRINT))) {
        sendResponse(true, [
            'puzzleId' => $data['puzzleId'],
            'savedAt' => time()
        ], 'Puzzle saved successfully');
    } else {
        sendResponse(false, null, 'Failed to save puzzle', 500);
    }
}

/**
 * Load puzzle state
 */
function loadPuzzle() {
    $puzzleId = $_GET['id'] ?? '';

    if (empty($puzzleId)) {
        sendResponse(false, null, 'Puzzle ID required', 400);
    }

    $filePath = getPuzzleFilePath($puzzleId);

    if (!file_exists($filePath)) {
        sendResponse(false, null, 'Puzzle not found', 404);
    }

    $data = file_get_contents($filePath);
    $puzzleData = json_decode($data, true);

    if (!$puzzleData) {
        sendResponse(false, null, 'Invalid puzzle data', 500);
    }

    sendResponse(true, $puzzleData, 'Puzzle loaded successfully');
}

/**
 * List all saved puzzles
 */
function listPuzzles() {
    $files = getUserPuzzleFiles();
    $puzzles = [];

    foreach ($files as $file) {
        $data = file_get_contents($file);
        $puzzleData = json_decode($data, true);

        if ($puzzleData) {
            $puzzles[] = [
                'id' => $puzzleData['id'],
                'name' => $puzzleData['name'],
                'metadata' => $puzzleData['metadata']
            ];
        }
    }

    // Sort by updatedAt (most recent first)
    usort($puzzles, function($a, $b) {
        return $b['metadata']['updatedAt'] - $a['metadata']['updatedAt'];
    });

    sendResponse(true, $puzzles, 'Puzzles retrieved successfully');
}

/**
 * Delete puzzle
 */
function deletePuzzle() {
    $puzzleId = $_GET['id'] ?? '';

    if (empty($puzzleId)) {
        sendResponse(false, null, 'Puzzle ID required', 400);
    }

    $filePath = getPuzzleFilePath($puzzleId);

    if (!file_exists($filePath)) {
        sendResponse(false, null, 'Puzzle not found', 404);
    }

    if (unlink($filePath)) {
        sendResponse(true, ['puzzleId' => $puzzleId], 'Puzzle deleted successfully');
    } else {
        sendResponse(false, null, 'Failed to delete puzzle', 500);
    }
}

// Route request based on action
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'save':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            savePuzzle();
            break;

        case 'load':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            loadPuzzle();
            break;

        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            listPuzzles();
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
                sendResponse(false, null, 'Method not allowed', 405);
            }
            deletePuzzle();
            break;

        default:
            sendResponse(false, null, 'Invalid action. Available: save, load, list, delete', 400);
    }
} catch (Exception $e) {
    sendResponse(false, null, 'Server error: ' . $e->getMessage(), 500);
}
