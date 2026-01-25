/**
 * Main application file - Multiuser Jigsaw Puzzle
 * Handles puzzle lifecycle, auto-save, SSE sync, and user management
 * @version 2.1.0
 */

const VERSION = '2.1.0';

let puzzleCutter;
let puzzleEngine;
let puzzleAPI;

// Current puzzle state
let currentImagePath = null;
let currentShapeSeed = null;  // Seed for deterministic piece shapes
let puzzleLoaded = false;
let saveTimeout = null;
let selectionTimeout = null;
let isApplyingRemoteUpdate = false;

// User preferences (stored in localStorage + server)
let userPrefs = {
    userId: null,
    displayName: 'Player',
    color: '#667eea',
    canvasColor: '#f0f0f0'
};

// UI elements
let canvas;
let pieceCountSelect;
let pieceCountGroup;
let imageSelect;
let uploadBtn;
let imageUpload;
let startBtn;
let resetViewBtn;
let referenceBtn;
let progressText;
let settingsBtn;
let settingsModal;

/**
 * Initialize the application
 */
async function init() {
    console.log(`Multiplayer Jigsaw Puzzle v${VERSION}`);
    console.log('Multiuser Mode: Shared puzzles, real-time sync');

    // Show loading immediately
    document.body.insertAdjacentHTML('beforeend', `
        <div id="loadingOverlay" class="loading-overlay active">
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <p class="loading-text">Initializing...</p>
            </div>
        </div>
    `);

    // Get UI elements
    canvas = document.getElementById('puzzleCanvas');
    pieceCountSelect = document.getElementById('pieceCount');
    pieceCountGroup = document.getElementById('pieceCountGroup');
    imageSelect = document.getElementById('imageSelect');
    uploadBtn = document.getElementById('uploadBtn');
    imageUpload = document.getElementById('imageUpload');
    startBtn = document.getElementById('startBtn');
    resetViewBtn = document.getElementById('resetViewBtn');
    referenceBtn = document.getElementById('referenceBtn');
    progressText = document.getElementById('progressText');
    settingsBtn = document.getElementById('settingsBtn');
    settingsModal = document.getElementById('settingsModal');

    // Initialize puzzle components
    puzzleCutter = new PuzzleCutter();
    puzzleEngine = new PuzzleEngine(canvas);
    puzzleAPI = new PuzzleAPI();

    // Setup UI event listeners (doesn't need API data)
    setupEventListeners();

    // Wire up piece move callback for auto-save
    puzzleEngine.onPieceMoveEnd = handlePieceMoveEnd;
    puzzleEngine.onSelectionChange = handleSelectionChange;

    // Start render loop
    puzzleEngine.start();

    // Update stats regularly
    setInterval(updateStats, 100);

    // Load user prefs and image list in parallel (independent requests)
    await Promise.all([
        loadUserPrefs(),
        populateImageDropdown()
    ]);

    // Set initial image path (needs dropdown populated)
    currentImagePath = imageSelect.value;

    // Auto-load existing puzzle for this image
    await autoLoadPuzzle();

    // Subscribe to real-time updates
    subscribeToUpdates();
}

/**
 * Setup UI event listeners
 */
function setupEventListeners() {
    startBtn.addEventListener('click', startNewPuzzle);
    resetViewBtn.addEventListener('click', () => puzzleEngine.resetView());

    // Reference image toggle
    if (referenceBtn) {
        referenceBtn.addEventListener('click', toggleReferenceImage);
    }

    // Image dropdown change - switch puzzles
    imageSelect.addEventListener('change', handleImageChange);

    // Upload button - trigger file picker
    if (uploadBtn && imageUpload) {
        uploadBtn.addEventListener('click', () => imageUpload.click());
        imageUpload.addEventListener('change', handleImageUpload);
    }

    // Settings button
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettingsModal);
    }

    // Settings modal close
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', closeSettingsModal);
    }

    // Save settings button
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    // Reset puzzle button
    const resetPuzzleBtn = document.getElementById('resetPuzzleBtn');
    if (resetPuzzleBtn) {
        resetPuzzleBtn.addEventListener('click', handleResetPuzzle);
    }

    // Backup list button
    const showBackupsBtn = document.getElementById('showBackupsBtn');
    if (showBackupsBtn) {
        showBackupsBtn.addEventListener('click', showBackupsList);
    }

    // Close backup modal
    const closeBackupModalBtn = document.getElementById('closeBackupModalBtn');
    if (closeBackupModalBtn) {
        closeBackupModalBtn.addEventListener('click', closeBackupModal);
    }

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Instructions toggle
    const instructionsToggle = document.getElementById('instructionsToggle');
    const instructions = document.getElementById('instructions');
    if (instructionsToggle && instructions) {
        instructionsToggle.addEventListener('click', () => {
            instructions.classList.toggle('collapsed');
        });
    }
}

/**
 * Load user preferences from localStorage and server
 */
async function loadUserPrefs() {
    // First check localStorage
    const stored = localStorage.getItem('puzzleUserPrefs');
    if (stored) {
        try {
            userPrefs = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse stored prefs:', e);
        }
    }

    // Then fetch from server (gets userId)
    try {
        const serverPrefs = await puzzleAPI.getUserPrefs();
        if (serverPrefs) {
            userPrefs.userId = serverPrefs.userId;
            // If no local prefs, use server defaults
            if (!stored) {
                userPrefs.displayName = serverPrefs.displayName;
                userPrefs.color = serverPrefs.color;
            }
        }
    } catch (e) {
        console.error('Failed to load server prefs:', e);
    }

    // Update settings form if present
    const nameInput = document.getElementById('userNameInput');
    const colorInput = document.getElementById('userColorInput');
    const canvasColorInput = document.getElementById('canvasColorInput');
    if (nameInput) nameInput.value = userPrefs.displayName;
    if (colorInput) colorInput.value = userPrefs.color;
    if (canvasColorInput) canvasColorInput.value = userPrefs.canvasColor;

    // Apply canvas color to engine
    if (puzzleEngine && userPrefs.canvasColor) {
        puzzleEngine.setBackgroundColor(userPrefs.canvasColor);
    }
}

/**
 * Save user preferences to localStorage and server
 */
async function saveUserPrefs() {
    // Save to localStorage
    localStorage.setItem('puzzleUserPrefs', JSON.stringify(userPrefs));

    // Save to server
    try {
        await puzzleAPI.saveUserPrefs(userPrefs.displayName, userPrefs.color);
    } catch (e) {
        console.error('Failed to save prefs to server:', e);
    }
}

/**
 * Toggle reference image visibility
 */
function toggleReferenceImage() {
    if (!puzzleLoaded || !puzzleEngine) {
        showMessage('Load a puzzle first');
        return;
    }

    const isVisible = puzzleEngine.toggleReferenceImage();
    referenceBtn.classList.toggle('active', isVisible);

    // Save state after toggle
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveSharedPuzzle(), 500);
}

/**
 * Handle image dropdown change
 */
async function handleImageChange() {
    // Unsubscribe from current image
    puzzleAPI.unsubscribe();

    // Update current image path
    currentImagePath = imageSelect.value;

    // Load puzzle for new image
    await autoLoadPuzzle();

    // Subscribe to updates for new image
    subscribeToUpdates();
}

/**
 * Populate image dropdown from server
 */
async function populateImageDropdown() {
    try {
        const images = await puzzleAPI.listImages();

        // Remember current selection
        const previousValue = imageSelect.value;

        // Clear existing options
        imageSelect.innerHTML = '';

        // Add options for each image
        images.forEach(image => {
            const option = document.createElement('option');
            option.value = image.path;
            option.textContent = image.name;
            imageSelect.appendChild(option);
        });

        // Restore previous selection if still available
        if (previousValue) {
            const exists = Array.from(imageSelect.options).some(opt => opt.value === previousValue);
            if (exists) {
                imageSelect.value = previousValue;
            }
        }

        // Fallback if no images
        if (images.length === 0) {
            const option = document.createElement('option');
            option.value = 'images/DisneyHoliday.jpg';
            option.textContent = 'Disney Holiday';
            imageSelect.appendChild(option);
        }
    } catch (error) {
        console.error('Failed to load image list:', error);
        // Keep default option as fallback
    }
}

/**
 * Handle image upload from file input
 */
async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Reset the input so the same file can be selected again
    e.target.value = '';

    // Client-side validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
        showMessage('Invalid file type. Please use JPEG, PNG, GIF, or WebP.');
        return;
    }

    // Prompt user for a display name
    const defaultName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    const displayName = prompt('Enter a name for this puzzle:', defaultName);

    if (displayName === null) {
        // User cancelled
        return;
    }

    // Show loading overlay
    showLoadingOverlay('Processing image...');

    try {
        // Process image (resize/compress if needed)
        const processedFile = await processImageForUpload(file);

        showLoadingOverlay('Uploading image... 0%');

        const result = await puzzleAPI.uploadImage(processedFile, displayName.trim(), (percent) => {
            showLoadingOverlay(`Uploading image... ${percent}%`);
        });

        // Refresh the dropdown
        await populateImageDropdown();

        // Select the newly uploaded image
        imageSelect.value = result.data.imagePath;
        currentImagePath = result.data.imagePath;

        // Clear existing puzzle state and show start button
        puzzleEngine.setPieces([]);
        puzzleLoaded = false;
        startBtn.style.display = '';
        pieceCountGroup.style.display = '';

        hideLoadingOverlay();
        showMessage(`"${result.data.name}" uploaded! Click "Start New Puzzle" to begin.`);

    } catch (error) {
        hideLoadingOverlay();
        console.error('Upload failed:', error);

        // Provide helpful message for PHP config issues
        let message = error.message;
        if (message.includes('php.ini') || message.includes('PHP limit')) {
            message += ' Run server with: php -S localhost:8000 -c php.ini';
        }
        showMessage('Upload failed: ' + message);
    }
}

/**
 * Process image for upload - resize and compress if needed
 * @param {File} file - Original image file
 * @returns {Promise<File|Blob>} Processed image
 */
async function processImageForUpload(file) {
    const maxDimension = 4096;
    // Target 1.8MB to work with PHP's common 2M default limit
    const targetFileSize = 1.8 * 1024 * 1024;

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
            URL.revokeObjectURL(img.src);

            const needsResize = img.width > maxDimension || img.height > maxDimension;
            const needsCompress = file.size > targetFileSize;

            // If image is fine as-is, return original
            if (!needsResize && !needsCompress) {
                console.log(`Image OK (${(file.size / 1024 / 1024).toFixed(2)}MB), no processing needed`);
                resolve(file);
                return;
            }

            console.log(`Processing image: ${(file.size / 1024 / 1024).toFixed(2)}MB, ${img.width}x${img.height}`);

            // Calculate new dimensions
            let newWidth = img.width;
            let newHeight = img.height;

            if (needsResize) {
                const scale = maxDimension / Math.max(img.width, img.height);
                newWidth = Math.round(img.width * scale);
                newHeight = Math.round(img.height * scale);
                console.log(`Resizing image from ${img.width}x${img.height} to ${newWidth}x${newHeight}`);
            }

            // Draw to canvas
            const canvas = document.createElement('canvas');
            canvas.width = newWidth;
            canvas.height = newHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            // Compress with decreasing quality until size is acceptable
            let quality = 0.92;
            let blob = null;

            // Try JPEG first (better compression for photos)
            const outputType = 'image/jpeg';

            while (quality > 0.1) {
                blob = await new Promise(res => canvas.toBlob(res, outputType, quality));

                if (blob.size <= targetFileSize) {
                    console.log(`Compressed to ${(blob.size / 1024 / 1024).toFixed(2)}MB at quality ${quality.toFixed(2)}`);
                    break;
                }

                quality -= 0.1;
            }

            if (!blob || blob.size > targetFileSize) {
                // Last resort: reduce dimensions further
                const furtherScale = Math.sqrt(targetFileSize / blob.size);
                newWidth = Math.round(newWidth * furtherScale);
                newHeight = Math.round(newHeight * furtherScale);

                console.log(`Further resizing to ${newWidth}x${newHeight}`);

                canvas.width = newWidth;
                canvas.height = newHeight;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                blob = await new Promise(res => canvas.toBlob(res, outputType, 0.80));
                console.log(`Final size: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
            }

            // Convert blob to File to preserve filename
            const processedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: outputType,
                lastModified: Date.now()
            });

            resolve(processedFile);
        };

        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };

        img.src = URL.createObjectURL(file);
    });
}

/**
 * Auto-load existing puzzle for current image
 */
async function autoLoadPuzzle() {
    // Show spinner immediately at start
    showLoadingOverlay('Loading puzzle...');
    await new Promise(r => setTimeout(r, 50));  // Yield to render spinner

    try {
        const result = await puzzleAPI.loadSharedPuzzle(currentImagePath);

        if (result.data.exists) {
            showLoadingOverlay('Generating puzzle pieces...');

            // Load existing puzzle state
            await restoreSharedPuzzle(result.data.puzzle);
            puzzleLoaded = true;
            startBtn.style.display = 'none';
            pieceCountGroup.style.display = 'none';

            hideLoadingOverlay();
            showMessage('Puzzle loaded!');
        } else {
            // No saved puzzle - show start button
            puzzleEngine.setPieces([]);
            puzzleLoaded = false;
            startBtn.style.display = '';
            pieceCountGroup.style.display = '';
            hideLoadingOverlay();
            showMessage('Click "Start New Puzzle" to begin!');
        }
    } catch (error) {
        console.error('Auto-load failed:', error);
        hideLoadingOverlay();
        puzzleLoaded = false;
        startBtn.style.display = '';
        pieceCountGroup.style.display = '';
        showMessage('Ready to start a new puzzle');
    }
}

/**
 * Start a new puzzle
 */
async function startNewPuzzle() {
    const pieceCount = parseInt(pieceCountSelect.value);

    showMessage('Creating puzzle...');
    startBtn.disabled = true;
    showLoadingOverlay(`Creating ${pieceCount} puzzle pieces...`);

    // Yield to browser to render the spinner
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
        // Generate a random seed for piece shapes
        currentShapeSeed = Math.floor(Math.random() * 2147483647);

        // Cut the image into pieces with the seed
        const pieces = await puzzleCutter.cutImage(currentImagePath, pieceCount, currentShapeSeed);

        // Set pieces in engine
        puzzleEngine.setPieces(pieces);

        // Set the source image for reference image feature
        puzzleEngine.setSourceImage(puzzleCutter.image);

        puzzleLoaded = true;

        // Hide start button and piece selector since puzzle is active
        startBtn.style.display = 'none';
        pieceCountGroup.style.display = 'none';

        // Save initial state
        await saveSharedPuzzle();

        hideLoadingOverlay();
        showMessage('Puzzle ready! Start solving!');
    } catch (error) {
        console.error('Error creating puzzle:', error);
        hideLoadingOverlay();
        showMessage('Error loading puzzle. Please try again.');
    } finally {
        startBtn.disabled = false;
    }
}

/**
 * Restore puzzle from shared state
 * @param {Object} puzzleData - Saved puzzle state
 */
async function restoreSharedPuzzle(puzzleData) {
    try {
        // Set UI values
        pieceCountSelect.value = puzzleData.pieceCount;

        // Get the shape seed from saved state
        currentShapeSeed = puzzleData.shapeSeed || null;

        // Yield to ensure spinner is visible before heavy work
        await new Promise(r => setTimeout(r, 50));

        // Create fresh puzzle pieces with the same seed (this is the slow part)
        const pieces = await puzzleCutter.cutImage(puzzleData.image, puzzleData.pieceCount, currentShapeSeed);

        // Restore piece positions and state
        pieces.forEach(piece => {
            const savedPiece = puzzleData.pieces.find(p => p.id === piece.id);
            if (savedPiece) {
                piece.currentX = savedPiece.currentX;
                piece.currentY = savedPiece.currentY;
                piece.isPlaced = savedPiece.isPlaced;
                piece.isLocked = savedPiece.isLocked || false;
                piece.zIndex = savedPiece.zIndex;
                piece._savedGroupId = savedPiece.groupId;
            }
        });

        // Set pieces in engine
        puzzleEngine.setPieces(pieces);

        // Set the source image for reference image feature
        puzzleEngine.setSourceImage(puzzleCutter.image);

        // Rebuild groups
        rebuildGroups(puzzleData.pieces);

        // Restore camera
        if (puzzleData.camera) {
            puzzleEngine.camera.x = puzzleData.camera.x;
            puzzleEngine.camera.y = puzzleData.camera.y;
            puzzleEngine.camera.scale = puzzleData.camera.scale;
        }

        // Update stats
        puzzleEngine.stats.placedPieces = puzzleData.pieces.filter(p => p.isPlaced || p.isLocked).length;

        // Apply remote selections
        if (puzzleData.selections) {
            puzzleEngine.setRemoteSelections(puzzleData.selections);
        }

        // Restore reference image state
        if (puzzleData.referenceImage) {
            puzzleEngine.referenceImage.visible = puzzleData.referenceImage.visible;
            puzzleEngine.referenceImage.x = puzzleData.referenceImage.x;
            puzzleEngine.referenceImage.y = puzzleData.referenceImage.y;

            // Update button state
            if (referenceBtn) {
                referenceBtn.classList.toggle('active', puzzleEngine.referenceImage.visible);
            }
        }
    } catch (error) {
        console.error('Error restoring puzzle:', error);
        showMessage('Error loading puzzle state');
    }
}

/**
 * Rebuild piece groups from saved state
 */
function rebuildGroups(savedPieces) {
    if (!puzzleEngine || !savedPieces) return;

    puzzleEngine.groups = new Map();
    const groupMap = new Map();
    let maxGroupId = 0;

    savedPieces.forEach(savedPiece => {
        const groupId = savedPiece.groupId;
        if (groupId === undefined || groupId === null) return;

        maxGroupId = Math.max(maxGroupId, groupId);

        if (!groupMap.has(groupId)) {
            groupMap.set(groupId, new Set());
        }
        groupMap.get(groupId).add(savedPiece.id);
    });

    groupMap.forEach((pieceIds, groupId) => {
        puzzleEngine.groups.set(groupId, pieceIds);
        pieceIds.forEach(pieceId => {
            const piece = puzzleEngine.pieces.find(p => p.id === pieceId);
            if (piece) {
                piece.groupId = groupId;
            }
        });
    });

    puzzleEngine.nextGroupId = maxGroupId + 1;
}

/**
 * Handle piece move end - trigger auto-save with debounce
 */
function handlePieceMoveEnd(movedPieces) {
    if (!puzzleLoaded) return;

    // Debounce save
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveSharedPuzzle();
    }, 500);
}

/**
 * Handle selection change - broadcast to other users
 * @param {Array} selectedPieces - Array of selected pieces
 * @param {boolean} referenceSelected - Whether reference image is selected
 */
function handleSelectionChange(selectedPieces, referenceSelected = false) {
    if (!puzzleLoaded || !currentImagePath) return;

    // Debounce selection broadcast
    if (selectionTimeout) clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
        const pieceIds = selectedPieces.map(p => p.id);
        puzzleAPI.updateSelection(
            currentImagePath,
            pieceIds,
            userPrefs.color,
            userPrefs.displayName,
            referenceSelected
        ).catch(e => console.error('Selection broadcast failed:', e));
    }, 100);
}

/**
 * Save shared puzzle state
 */
async function saveSharedPuzzle() {
    if (!puzzleEngine || !puzzleEngine.pieces || puzzleEngine.pieces.length === 0) {
        return;
    }

    const state = getPuzzleState();
    if (!state) return;

    try {
        await puzzleAPI.saveSharedPuzzle(currentImagePath, state);
        console.log('Puzzle saved');
    } catch (error) {
        console.error('Save failed:', error);
    }
}

/**
 * Get current puzzle state for saving
 */
function getPuzzleState() {
    if (!puzzleEngine || !puzzleEngine.pieces || puzzleEngine.pieces.length === 0) {
        return null;
    }

    // Serialize pieces
    const pieces = puzzleEngine.pieces.map(piece => ({
        id: piece.id,
        currentX: piece.currentX,
        currentY: piece.currentY,
        isPlaced: piece.isPlaced,
        isLocked: piece.isLocked,
        groupId: piece.groupId,
        zIndex: piece.zIndex
    }));

    // Serialize groups
    const groups = {};
    puzzleEngine.groups.forEach((pieceIds, groupId) => {
        groups[groupId] = Array.from(pieceIds);
    });

    return {
        pieceCount: puzzleEngine.pieces.length,
        progress: puzzleEngine.getProgress(),
        image: currentImagePath,
        shapeSeed: currentShapeSeed,
        pieces: pieces,
        groups: groups,
        camera: {
            x: puzzleEngine.camera.x,
            y: puzzleEngine.camera.y,
            scale: puzzleEngine.camera.scale
        },
        referenceImage: {
            visible: puzzleEngine.referenceImage.visible,
            x: puzzleEngine.referenceImage.x,
            y: puzzleEngine.referenceImage.y
        }
    };
}

/**
 * Subscribe to real-time puzzle updates
 */
function subscribeToUpdates() {
    if (!currentImagePath) return;

    puzzleAPI.subscribe(
        currentImagePath,
        handleRemotePuzzleUpdate,
        (data) => console.log('Connected to live updates'),
        (error) => console.error('SSE connection error')
    );
}

/**
 * Handle puzzle update from another user
 */
function handleRemotePuzzleUpdate(data) {
    if (!puzzleEngine || !puzzleLoaded) return;

    const remotePuzzle = data.puzzle;
    if (!remotePuzzle || !remotePuzzle.pieces) return;

    isApplyingRemoteUpdate = true;

    try {
        // Get locally selected piece IDs (don't update these)
        const localSelectedIds = new Set(puzzleEngine.selectedPieces.map(p => p.id));

        // Update piece positions for non-selected pieces
        remotePuzzle.pieces.forEach(remotePiece => {
            if (localSelectedIds.has(remotePiece.id)) return;  // Skip locally selected

            const localPiece = puzzleEngine.pieces.find(p => p.id === remotePiece.id);
            if (localPiece) {
                localPiece.currentX = remotePiece.currentX;
                localPiece.currentY = remotePiece.currentY;
                localPiece.isPlaced = remotePiece.isPlaced;
                localPiece.isLocked = remotePiece.isLocked || false;
                localPiece.zIndex = remotePiece.zIndex;
            }
        });

        // Rebuild groups from remote data
        if (remotePuzzle.pieces) {
            rebuildGroups(remotePuzzle.pieces);
        }

        // Update remote selections (for highlighting)
        if (remotePuzzle.selections) {
            puzzleEngine.setRemoteSelections(remotePuzzle.selections);
        }

        // Update stats
        puzzleEngine.stats.placedPieces = remotePuzzle.pieces.filter(p => p.isPlaced || p.isLocked).length;

        // Sync reference image position (unless locally selected)
        if (remotePuzzle.referenceImage && !puzzleEngine.referenceImage.isSelected) {
            puzzleEngine.referenceImage.visible = remotePuzzle.referenceImage.visible;
            puzzleEngine.referenceImage.x = remotePuzzle.referenceImage.x;
            puzzleEngine.referenceImage.y = remotePuzzle.referenceImage.y;

            // Update button state
            if (referenceBtn) {
                referenceBtn.classList.toggle('active', puzzleEngine.referenceImage.visible);
            }
        }

    } finally {
        isApplyingRemoteUpdate = false;
    }
}

/**
 * Open settings modal
 */
function openSettingsModal() {
    if (!settingsModal) return;

    // Update form values
    const nameInput = document.getElementById('userNameInput');
    const colorInput = document.getElementById('userColorInput');
    if (nameInput) nameInput.value = userPrefs.displayName;
    if (colorInput) colorInput.value = userPrefs.color;

    settingsModal.classList.add('active');

    // Load uploaded images list
    loadUploadedImagesList();
}

/**
 * Load and display uploaded images in settings
 */
async function loadUploadedImagesList() {
    const listContainer = document.getElementById('uploadedImagesList');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="settings-note">Loading...</p>';

    try {
        const images = await puzzleAPI.listImages();
        const uploadedImages = images.filter(img => img.isUploaded);

        if (uploadedImages.length === 0) {
            listContainer.innerHTML = '<p class="settings-note">No uploaded images yet.</p>';
            return;
        }

        let html = '';
        uploadedImages.forEach(image => {
            const date = new Date(image.timestamp * 1000);
            const dateStr = date.toLocaleDateString();
            html += `
                <div class="uploaded-image-item">
                    <div class="uploaded-image-info">
                        <span class="uploaded-image-name">${escapeHtml(image.name)}</span>
                        <span class="uploaded-image-date">Uploaded ${dateStr}</span>
                    </div>
                    <button class="delete-image-btn" data-path="${escapeHtml(image.path)}">Delete</button>
                </div>
            `;
        });

        listContainer.innerHTML = html;

        // Add delete handlers
        listContainer.querySelectorAll('.delete-image-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteUploadedImage(btn.dataset.path));
        });
    } catch (error) {
        console.error('Failed to load uploaded images:', error);
        listContainer.innerHTML = '<p class="settings-note">Failed to load images.</p>';
    }
}

/**
 * Delete an uploaded image
 */
async function deleteUploadedImage(imagePath) {
    const imageName = imagePath.split('/').pop().replace(/\.[^/.]+$/, '');

    if (!confirm(`Delete this image and its puzzle data?\n\nThis cannot be undone.`)) {
        return;
    }

    try {
        await puzzleAPI.deleteImage(imagePath);

        // Refresh the list
        await loadUploadedImagesList();

        // Refresh the dropdown
        await populateImageDropdown();

        // If we deleted the current image, switch to first available
        if (currentImagePath === imagePath) {
            if (imageSelect.options.length > 0) {
                imageSelect.selectedIndex = 0;
                await handleImageChange();
            }
        }

        showMessage('Image deleted');
    } catch (error) {
        console.error('Delete failed:', error);
        showMessage('Failed to delete image: ' + error.message);
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Close settings modal
 */
function closeSettingsModal() {
    if (settingsModal) {
        settingsModal.classList.remove('active');
    }
}

/**
 * Save settings from modal
 */
async function saveSettings() {
    const nameInput = document.getElementById('userNameInput');
    const colorInput = document.getElementById('userColorInput');
    const canvasColorInput = document.getElementById('canvasColorInput');

    if (nameInput) userPrefs.displayName = nameInput.value || 'Player';
    if (colorInput) userPrefs.color = colorInput.value || '#667eea';
    if (canvasColorInput) userPrefs.canvasColor = canvasColorInput.value || '#f0f0f0';

    // Apply canvas color immediately
    if (puzzleEngine && userPrefs.canvasColor) {
        puzzleEngine.setBackgroundColor(userPrefs.canvasColor);
    }

    await saveUserPrefs();
    closeSettingsModal();
    showMessage('Settings saved!');
}

/**
 * Handle reset puzzle request
 */
async function handleResetPuzzle() {
    // First confirmation
    if (!confirm('Are you sure you want to reset this puzzle? All progress will be lost!')) {
        return;
    }

    // Second confirmation - type RESET
    const typed = prompt('Type "RESET" to confirm:');
    if (typed !== 'RESET') {
        showMessage('Reset cancelled');
        return;
    }

    try {
        showMessage('Resetting puzzle...');

        // Reset on server (creates backup)
        await puzzleAPI.resetPuzzle(currentImagePath);

        // Clear local state
        puzzleEngine.setPieces([]);
        puzzleLoaded = false;

        // Show start button and piece selector
        startBtn.style.display = '';
        pieceCountGroup.style.display = '';

        closeSettingsModal();
        showMessage('Puzzle reset! Click Start to begin again.');
    } catch (error) {
        console.error('Reset failed:', error);
        showMessage('Failed to reset puzzle');
    }
}

/**
 * Show backups list modal
 */
async function showBackupsList() {
    const backupModal = document.getElementById('backupModal');
    const backupList = document.getElementById('backupList');
    if (!backupModal || !backupList) return;

    backupList.innerHTML = '<p>Loading backups...</p>';
    backupModal.classList.add('active');

    try {
        const backups = await puzzleAPI.listBackups(currentImagePath);

        if (backups.length === 0) {
            backupList.innerHTML = '<p>No backups available yet.</p>';
            return;
        }

        let html = '<ul class="backup-list">';
        backups.forEach(backup => {
            const date = new Date(backup.timestamp * 1000);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            html += `
                <li class="backup-item">
                    <div class="backup-info">
                        <span class="backup-date">${dateStr}</span>
                        <span class="backup-progress">${backup.progress}% complete</span>
                    </div>
                    <button class="restore-btn" data-backup="${backup.filename}">Restore</button>
                </li>
            `;
        });
        html += '</ul>';

        backupList.innerHTML = html;

        // Add restore handlers
        backupList.querySelectorAll('.restore-btn').forEach(btn => {
            btn.addEventListener('click', () => restoreFromBackup(btn.dataset.backup));
        });
    } catch (error) {
        console.error('Failed to load backups:', error);
        backupList.innerHTML = '<p>Failed to load backups.</p>';
    }
}

/**
 * Restore puzzle from backup
 */
async function restoreFromBackup(backupFilename) {
    if (!confirm('Restore from this backup? Current progress will be saved as a backup first.')) {
        return;
    }

    try {
        showMessage('Restoring backup...');

        await puzzleAPI.restoreBackup(currentImagePath, backupFilename);

        // Reload the puzzle
        await autoLoadPuzzle();

        closeBackupModal();
        showMessage('Backup restored!');
    } catch (error) {
        console.error('Restore failed:', error);
        showMessage('Failed to restore backup');
    }
}

/**
 * Close backup modal
 */
function closeBackupModal() {
    const backupModal = document.getElementById('backupModal');
    if (backupModal) {
        backupModal.classList.remove('active');
    }
}

/**
 * Update stats display
 */
function updateStats() {
    if (!puzzleEngine) return;

    const progress = puzzleEngine.getProgress();
    progressText.textContent = `${progress}% Complete`;

    // Check for completion
    if (progress === 100 && puzzleEngine.stats.totalPieces > 0) {
        showCompletionMessage();
    }
}

/**
 * Show a message to the user
 */
function showMessage(message) {
    console.log(message);
    // Could add a toast notification here
}

/**
 * Show loading overlay
 */
function showLoadingOverlay(message = 'Loading...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay active';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <p class="loading-text">${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        const textEl = overlay.querySelector('.loading-text');
        if (textEl) textEl.textContent = message;
        overlay.classList.add('active');
    }
}

/**
 * Hide loading overlay
 */
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

/**
 * Show completion message
 */
function showCompletionMessage() {
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
