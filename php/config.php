<?php
/**
 * Configuration file for Jigsaw Puzzle application
 * @version 1.0.0
 */

// Data directory for storing puzzle states
define('DATA_DIR', __DIR__ . '/../data');

// Ensure data directory exists
if (!file_exists(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

// Maximum number of saved puzzles per session
define('MAX_PUZZLES', 50);

// Auto-save interval (seconds)
define('AUTO_SAVE_INTERVAL', 30);

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
