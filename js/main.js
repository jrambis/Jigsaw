/**
 * Main application file
 * Initializes puzzle cutter, engine, and UI
 * @version 1.0.0
 */

const VERSION = '1.0.0';

let puzzleCutter;
let puzzleEngine;

// UI elements
let canvas;
let pieceCountSelect;
let imageSelect;
let startBtn;
let resetViewBtn;
let progressText;
let touchInfo;

/**
 * Initialize the application
 */
function init() {
    console.log(`🧩 Multiplayer Jigsaw Puzzle v${VERSION}`);
    console.log('Phase 1: Core Engine ✓');
    console.log('Phase 2: Touch Controls ✓');

    // Get UI elements
    canvas = document.getElementById('puzzleCanvas');
    pieceCountSelect = document.getElementById('pieceCount');
    imageSelect = document.getElementById('imageSelect');
    startBtn = document.getElementById('startBtn');
    resetViewBtn = document.getElementById('resetViewBtn');
    progressText = document.getElementById('progressText');
    touchInfo = document.getElementById('touchInfo');

    // Initialize puzzle components
    puzzleCutter = new PuzzleCutter();
    puzzleEngine = new PuzzleEngine(canvas);

    // Setup UI event listeners
    startBtn.addEventListener('click', startNewPuzzle);
    resetViewBtn.addEventListener('click', () => puzzleEngine.resetView());

    // Start render loop
    puzzleEngine.start();

    // Update stats regularly
    setInterval(updateStats, 100);

    // Show initial message
    showMessage('Click "Start New Puzzle" to begin!');
}

/**
 * Start a new puzzle
 */
async function startNewPuzzle() {
    const pieceCount = parseInt(pieceCountSelect.value);
    const imagePath = getImagePath();

    showMessage('Loading puzzle...');
    startBtn.disabled = true;

    try {
        // Cut the image into pieces
        const pieces = await puzzleCutter.cutImage(imagePath, pieceCount);

        // Set pieces in engine
        puzzleEngine.setPieces(pieces);

        showMessage('Puzzle ready! Start solving!');

    } catch (error) {
        console.error('Error creating puzzle:', error);
        showMessage('Error loading puzzle. Please try again.');
    } finally {
        startBtn.disabled = false;
    }
}

/**
 * Get image path based on selection
 * @returns {string} Image path
 */
function getImagePath() {
    const selected = imageSelect.value;

    // For now, use placeholder service
    // In Phase 5, this will load from uploaded images
    const imageMap = {
        'sample1.jpg': 'https://picsum.photos/1200/800?random=1',
        'sample2.jpg': 'https://picsum.photos/1200/800?random=2',
        'sample3.jpg': 'https://picsum.photos/1200/800?random=3'
    };

    return imageMap[selected] || imageMap['sample1.jpg'];
}

/**
 * Update stats display
 */
function updateStats() {
    if (!puzzleEngine) return;

    const progress = puzzleEngine.getProgress();
    progressText.textContent = `${progress}% Complete`;

    // Update touch info
    if (puzzleEngine.input.isDragging) {
        touchInfo.textContent = 'Moving piece';
    } else if (puzzleEngine.input.isPanning) {
        touchInfo.textContent = 'Panning';
    } else if (puzzleEngine.input.isSelecting) {
        touchInfo.textContent = 'Selecting';
    } else if (puzzleEngine.edgePanning.active) {
        touchInfo.textContent = 'Edge panning';
    } else {
        touchInfo.textContent = '';
    }

    // Check for completion
    if (progress === 100 && puzzleEngine.stats.totalPieces > 0) {
        showCompletionMessage();
    }
}

/**
 * Show a message to the user
 * @param {string} message - Message to display
 */
function showMessage(message) {
    console.log(message);
    // Could add a toast notification here in the future
}

/**
 * Show completion message
 */
function showCompletionMessage() {
    // Only show once
    if (puzzleEngine.completionShown) return;
    puzzleEngine.completionShown = true;

    alert('Congratulations! Puzzle completed!');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
