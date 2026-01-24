<?php
/**
 * Configuration file for Jigsaw Puzzle application
 * @version 2.0.0 - Multiuser support
 */

// Data directories
define('DATA_DIR', __DIR__ . '/../data');
define('SHARED_DIR', DATA_DIR . '/shared');
define('USERS_DIR', DATA_DIR . '/users');

// Ensure directories exist
foreach ([DATA_DIR, SHARED_DIR, USERS_DIR] as $dir) {
    if (!file_exists($dir)) {
        mkdir($dir, 0755, true);
    }
}

// Maximum number of saved puzzles per session
define('MAX_PUZZLES', 50);

// Backup settings
define('MAX_BACKUPS', 30);
define('BACKUP_INTERVAL', 180); // 3 minutes in seconds

// SSE settings
define('SSE_POLL_INTERVAL', 500000); // microseconds (500ms)
define('SSE_TIMEOUT', 30); // seconds

// Selection timeout for remote users
define('SELECTION_TIMEOUT', 30); // seconds

// Session settings
ini_set('session.gc_maxlifetime', 86400); // 24 hours
session_set_cookie_params(86400); // 24 hours

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Generate or retrieve session ID
if (!isset($_SESSION['puzzle_user_id'])) {
    $_SESSION['puzzle_user_id'] = uniqid('user_', true);
}

// CORS headers for development
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/**
 * Safe write JSON with file locking
 * @param string $path File path
 * @param array $data Data to write
 * @return bool Success
 */
function safeWriteJson($path, $data) {
    $dir = dirname($path);
    if (!file_exists($dir)) {
        mkdir($dir, 0755, true);
    }

    $fp = fopen($path, 'c+');
    if (!$fp) return false;

    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    }

    fclose($fp);
    return false;
}

/**
 * Safe read JSON with file locking
 * @param string $path File path
 * @return array|null Data or null if not found
 */
function safeReadJson($path) {
    if (!file_exists($path)) return null;

    $fp = fopen($path, 'r');
    if (!$fp) return null;

    if (flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return json_decode($content, true);
    }

    fclose($fp);
    return null;
}

/**
 * Get shared puzzle directory path
 * @param string $imageName Image name (without path/extension)
 * @return string Directory path
 */
function getSharedPuzzleDir($imageName) {
    $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $imageName);
    return SHARED_DIR . '/puzzle_' . $safeId;
}

/**
 * Get shared puzzle state file path
 * @param string $imageName Image name (without path/extension)
 * @return string File path
 */
function getSharedPuzzlePath($imageName) {
    return getSharedPuzzleDir($imageName) . '/state.json';
}

/**
 * Get user preferences file path
 * @param string $userId User session ID
 * @return string File path
 */
function getUserPrefsPath($userId) {
    $safeId = preg_replace('/[^a-zA-Z0-9_.-]/', '', $userId);
    return USERS_DIR . '/' . $safeId . '.json';
}

/**
 * Extract image name from path
 * @param string $imagePath Full image path (e.g., "images/DisneyHoliday.jpg")
 * @return string Image name without path/extension
 */
function imagePathToName($imagePath) {
    $basename = basename($imagePath);
    return pathinfo($basename, PATHINFO_FILENAME);
}
