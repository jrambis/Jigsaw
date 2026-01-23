/**
 * Main application file
 * Initializes puzzle cutter, engine, and UI
 * @version 1.0.0
 */

const VERSION = '1.2.1';

let puzzleCutter;
let puzzleEngine;
let puzzleAPI;

// Current puzzle state
let currentPuzzleId = null;
let currentPuzzleName = 'Untitled Puzzle';
let autoSaveTimer = null;
let puzzleCreatedAt = null;

// UI elements
let canvas;
let pieceCountSelect;
let imageSelect;
let startBtn;
let resetViewBtn;
let progressText;
let touchInfo;
let saveBtn;
let loadBtn;
let savedPuzzlesModal;

/**
 * Initialize the application
 */
function init() {
    console.log(`🧩 Multiplayer Jigsaw Puzzle v${VERSION}`);
    console.log('Phase 1: Core Engine ✓');
    console.log('Phase 2: Touch Controls ✓');
    console.log('Phase 3: PHP Persistence ✓');

    // Get UI elements
    canvas = document.getElementById('puzzleCanvas');
    pieceCountSelect = document.getElementById('pieceCount');
    imageSelect = document.getElementById('imageSelect');
    startBtn = document.getElementById('startBtn');
    resetViewBtn = document.getElementById('resetViewBtn');
    saveBtn = document.getElementById('saveBtn');
    loadBtn = document.getElementById('loadBtn');
    progressText = document.getElementById('progressText');
    touchInfo = document.getElementById('touchInfo');
    savedPuzzlesModal = document.getElementById('savedPuzzlesModal');

    // Initialize puzzle components
    puzzleCutter = new PuzzleCutter();
    puzzleEngine = new PuzzleEngine(canvas);
    puzzleAPI = new PuzzleAPI();

    // Setup UI event listeners
    startBtn.addEventListener('click', startNewPuzzle);
    resetViewBtn.addEventListener('click', () => puzzleEngine.resetView());
    saveBtn.addEventListener('click', manualSave);
    loadBtn.addEventListener('click', showLoadPuzzleDialog);

    // Start render loop
    puzzleEngine.start();

    // Update stats regularly
    setInterval(updateStats, 100);

    // Start auto-save timer (every 30 seconds)
    autoSaveTimer = setInterval(autoSavePuzzle, 30000);

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
        // Generate new puzzle ID
        currentPuzzleId = 'puzzle_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        currentPuzzleName = `Puzzle ${pieceCount} pieces`;
        puzzleCreatedAt = Date.now();

        // Cut the image into pieces
        const pieces = await puzzleCutter.cutImage(imagePath, pieceCount);

        // Set pieces in engine
        puzzleEngine.setPieces(pieces);

        showMessage('Puzzle ready! Start solving!');

        // Enable save button
        if (saveBtn) saveBtn.disabled = false;

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
    } else if (puzzleEngine.input.isPinching) {
        touchInfo.textContent = 'Zooming';
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

/**
 * Get current puzzle state for saving
 * @returns {Object} Puzzle state
 */
function getPuzzleState() {
    if (!puzzleEngine || !puzzleEngine.pieces || puzzleEngine.pieces.length === 0) {
        return null;
    }

    // Serialize piece positions
    const pieces = puzzleEngine.pieces.map(piece => ({
        id: piece.id,
        currentX: piece.currentX,
        currentY: piece.currentY,
        isPlaced: piece.isPlaced,
        zIndex: piece.zIndex
    }));

    return {
        pieceCount: puzzleEngine.pieces.length,
        progress: puzzleEngine.getProgress(),
        image: imageSelect.value,
        pieces: pieces,
        camera: {
            x: puzzleEngine.camera.x,
            y: puzzleEngine.camera.y,
            scale: puzzleEngine.camera.scale
        },
        createdAt: puzzleCreatedAt
    };
}

/**
 * Restore puzzle state from saved data
 * @param {Object} puzzleData - Saved puzzle data
 */
async function restorePuzzleState(puzzleData) {
    try {
        // Set UI values
        pieceCountSelect.value = puzzleData.state.pieceCount;
        imageSelect.value = puzzleData.state.image;

        // Set puzzle metadata
        currentPuzzleId = puzzleData.id;
        currentPuzzleName = puzzleData.name;
        puzzleCreatedAt = puzzleData.state.createdAt;

        // Create fresh puzzle pieces
        const imagePath = getImagePath();
        const pieces = await puzzleCutter.cutImage(imagePath, puzzleData.state.pieceCount);

        // Restore piece positions
        pieces.forEach(piece => {
            const savedPiece = puzzleData.state.pieces.find(p => p.id === piece.id);
            if (savedPiece) {
                piece.currentX = savedPiece.currentX;
                piece.currentY = savedPiece.currentY;
                piece.isPlaced = savedPiece.isPlaced;
                piece.zIndex = savedPiece.zIndex;
            }
        });

        // Set pieces in engine
        puzzleEngine.setPieces(pieces);

        // Restore camera
        if (puzzleData.state.camera) {
            puzzleEngine.camera.x = puzzleData.state.camera.x;
            puzzleEngine.camera.y = puzzleData.state.camera.y;
            puzzleEngine.camera.scale = puzzleData.state.camera.scale;
        }

        // Update stats
        puzzleEngine.stats.placedPieces = puzzleData.state.pieces.filter(p => p.isPlaced).length;

        showMessage(`Loaded: ${puzzleData.name}`);

        // Enable save button
        if (saveBtn) saveBtn.disabled = false;

    } catch (error) {
        console.error('Error restoring puzzle:', error);
        showMessage('Error loading puzzle state');
    }
}

/**
 * Auto-save current puzzle
 */
async function autoSavePuzzle() {
    if (!currentPuzzleId || !puzzleEngine || puzzleEngine.pieces.length === 0) {
        return;
    }

    const state = getPuzzleState();
    if (!state) return;

    try {
        await puzzleAPI.savePuzzle(currentPuzzleId, currentPuzzleName, state);
        console.log('Auto-saved puzzle');
    } catch (error) {
        console.error('Auto-save failed:', error);
    }
}

/**
 * Manual save with name prompt
 */
async function manualSave() {
    if (!currentPuzzleId) {
        showMessage('No puzzle to save');
        return;
    }

    const state = getPuzzleState();
    if (!state) {
        showMessage('No puzzle data to save');
        return;
    }

    // Prompt for puzzle name
    const name = prompt('Enter puzzle name:', currentPuzzleName);
    if (!name) return;

    currentPuzzleName = name;

    try {
        await puzzleAPI.savePuzzle(currentPuzzleId, currentPuzzleName, state);
        showMessage('Puzzle saved!');
    } catch (error) {
        console.error('Save failed:', error);
        showMessage('Failed to save puzzle');
    }
}

/**
 * Show load puzzle dialog
 */
async function showLoadPuzzleDialog() {
    try {
        const puzzles = await puzzleAPI.listPuzzles();

        if (puzzles.length === 0) {
            alert('No saved puzzles found');
            return;
        }

        // Create simple dialog
        let message = 'Saved Puzzles:\n\n';
        puzzles.forEach((puzzle, index) => {
            const date = new Date(puzzle.metadata.updatedAt * 1000).toLocaleString();
            message += `${index + 1}. ${puzzle.name} (${puzzle.metadata.progress}% complete) - ${date}\n`;
        });
        message += '\nEnter number to load:';

        const choice = prompt(message);
        if (!choice) return;

        const index = parseInt(choice) - 1;
        if (index < 0 || index >= puzzles.length) {
            alert('Invalid selection');
            return;
        }

        // Load selected puzzle
        const selectedPuzzle = puzzles[index];
        const puzzleData = await puzzleAPI.loadPuzzle(selectedPuzzle.id);

        await restorePuzzleState(puzzleData.data);

    } catch (error) {
        console.error('Failed to load puzzles:', error);
        showMessage('Failed to load puzzle list');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
