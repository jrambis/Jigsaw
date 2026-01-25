/**
 * PuzzleEngine - Manages puzzle rendering, interaction, and game logic
 * Includes touch controls: tap=pan, hold-drag=move piece, edge panning, pinch-to-zoom
 */
class PuzzleEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.pieces = [];
        this.selectedPieces = [];

        // Camera/viewport
        this.camera = {
            x: 0,
            y: 0,
            scale: 1
        };

        // Input state
        this.input = {
            isDragging: false,
            isPanning: false,
            isSelecting: false,
            isPinching: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            // Screen coordinates for panning (separate from world coords)
            panStartScreenX: 0,
            panStartScreenY: 0,
            // Pinch-to-zoom state (world coords captured at start - no drift!)
            pinchStartScale: 1,
            pinchWorldX: 0,  // World X under pinch center at start
            pinchWorldY: 0,  // World Y under pinch center at start
            pinchStartCamX: 0,
            pinchStartCamY: 0,
            pinchStartScreenX: 0,
            pinchStartScreenY: 0,
            // Piece being held for drag
            heldPiece: null,
            touchCount: 0,
            // Lasso selection state
            isLassoMode: false,      // Toggle: lasso tool active
            isDrawingLasso: false,   // Currently drawing lasso path
            lassoPath: []            // Array of {x, y} world coordinates
        };

        // Hammer.js manager
        this.hammer = null;

        // Debug logging - stores messages for main.js to display
        this.debugMessages = [];
        this.debugEnabled = false;

        // Canvas background color
        this.backgroundColor = '#f0f0f0';

        // Touch-specific settings
        this.touchSettings = {
            holdDelay: 100, // ms to wait before activating piece drag
            edgePanThreshold: 60, // pixels from edge to trigger panning
            edgePanSpeed: 5,
            snapDistance: 40 // Distance for auto-snapping pieces
        };

        // Edge panning
        this.edgePanning = {
            active: false,
            velocityX: 0,
            velocityY: 0
        };

        // Animation
        this.animationFrame = null;
        this.isRunning = false;

        // Stats
        this.stats = {
            placedPieces: 0,
            totalPieces: 0
        };

        // Callbacks for multiuser sync
        this.onPieceMoveEnd = null;      // Called after piece drag ends
        this.onSelectionChange = null;   // Called when selection changes

        // Remote user selections (from other users)
        this.remoteSelections = {};  // userId -> { pieceIds: [], color: '#...', displayName: '...' }

        // Reference image (completed puzzle preview)
        this.referenceImage = {
            visible: false,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            isSelected: false
        };
        this.sourceImage = null;  // Holds the loaded Image object

        // Piece groups - connected pieces move together
        // Map of groupId -> Set of piece IDs
        this.groups = new Map();
        this.nextGroupId = 0;

        this.setupEventListeners();
        this.resizeCanvas();
    }

    /**
     * Initialize the puzzle with pieces
     * @param {Array} pieces - Array of puzzle pieces
     */
    setPieces(pieces) {
        this.pieces = pieces;
        this.stats.totalPieces = pieces.length;
        this.stats.placedPieces = 0;
        this.selectedPieces = [];

        // Initialize each piece in its own group
        this.groups = new Map();
        this.nextGroupId = 0;
        pieces.forEach(piece => {
            const groupId = this.nextGroupId++;
            piece.groupId = groupId;
            this.groups.set(groupId, new Set([piece.id]));
        });

        // Center camera on puzzle
        if (pieces.length > 0) {
            const bounds = this.calculatePuzzleBounds();
            this.camera.x = -bounds.centerX + this.canvas.width / 2;
            this.camera.y = -bounds.centerY + this.canvas.height / 2;
        }
    }

    /**
     * Calculate bounds of all pieces
     * @returns {Object} Bounds object
     */
    calculatePuzzleBounds() {
        if (this.pieces.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.pieces.forEach(piece => {
            minX = Math.min(minX, piece.correctX);
            minY = Math.min(minY, piece.correctY);
            maxX = Math.max(maxX, piece.correctX + piece.width);
            maxY = Math.max(maxY, piece.correctY + piece.height);
        });

        return {
            minX, minY, maxX, maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    /**
     * Setup event listeners for mouse, touch, and Hammer.js gestures
     */
    setupEventListeners() {
        // Mouse wheel zoom (Hammer doesn't handle wheel)
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));

        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Setup Hammer.js for gesture recognition
        this.setupHammer();

        // Setup lasso button
        const lassoBtn = document.getElementById('lassoBtn');
        if (lassoBtn) {
            lassoBtn.addEventListener('click', () => {
                this.input.isLassoMode = !this.input.isLassoMode;
                lassoBtn.classList.toggle('active', this.input.isLassoMode);
                if (!this.input.isLassoMode) {
                    this.input.lassoPath = [];
                }
            });
        }

        // Setup grid button
        const gridBtn = document.getElementById('gridBtn');
        if (gridBtn) {
            gridBtn.addEventListener('click', () => {
                this.gridSpaceSelectedPieces();
            });
        }
    }

    /**
     * Initialize Hammer.js manager
     */
    setupHammer() {
        this.hammer = new Hammer.Manager(this.canvas);
        this.setupHammerRecognizers();
        this.setupHammerEvents();
    }

    /**
     * Configure Hammer.js gesture recognizers
     */
    setupHammerRecognizers() {
        // Press: 300ms hold for piece drag activation
        const press = new Hammer.Press({
            time: this.touchSettings.holdDelay,
            threshold: 9
        });

        // Pan: camera panning or piece dragging
        const pan = new Hammer.Pan({
            threshold: 10,
            direction: Hammer.DIRECTION_ALL,
            pointers: 1
        });

        // Pinch: two-finger zoom
        const pinch = new Hammer.Pinch({
            threshold: 0
        });

        // Tap: deselect on background
        const tap = new Hammer.Tap({
            taps: 1
        });

        // Add recognizers
        this.hammer.add([pinch, pan, press, tap]);

        // Configure relationships
        tap.requireFailure(press);  // Tap only fires if press fails (quick tap, not hold)
        pan.requireFailure(press);  // Pan waits for press to fail (movement cancels hold)
        pan.requireFailure(tap);    // Pan waits for tap to fail (allows quick taps)
        pinch.recognizeWith(pan);   // Allow pan while pinching
    }

    /**
     * Setup Hammer.js event handlers
     */
    setupHammerEvents() {
        // Press (hold) - activates piece drag
        this.hammer.on('press', (e) => this.onHammerPress(e));
        this.hammer.on('pressup', (e) => this.onHammerPressUp(e));

        // Pan - camera or piece movement
        this.hammer.on('panstart', (e) => this.onHammerPanStart(e));
        this.hammer.on('panmove', (e) => this.onHammerPanMove(e));
        this.hammer.on('panend pancancel', (e) => this.onHammerPanEnd(e));

        // Pinch - zoom
        this.hammer.on('pinchstart', (e) => this.onHammerPinchStart(e));
        this.hammer.on('pinchmove', (e) => this.onHammerPinchMove(e));
        this.hammer.on('pinchend pinchcancel', (e) => this.onHammerPinchEnd(e));

        // Tap - deselect
        this.hammer.on('tap', (e) => this.onHammerTap(e));
    }

    /**
     * Handle Hammer press (hold) event - activates piece drag
     */
    onHammerPress(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.center.x - rect.left;
        const screenY = e.center.y - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        // Check pieces first (they're above reference image)
        const piece = this.getPieceAt(worldPos.x, worldPos.y);
        if (piece) {
            this.input.heldPiece = piece;
            this.deselectReferenceImage();
            this.activatePieceDrag(piece, worldPos.x, worldPos.y);
            this.input.startX = worldPos.x;
            this.input.startY = worldPos.y;
            return;
        }

        // Check reference image (behind pieces)
        if (this.isPointInReferenceImage(worldPos.x, worldPos.y)) {
            this.clearSelection();
            this.selectReferenceImage();
            this.input.isDragging = true;
            this.input.startX = worldPos.x;
            this.input.startY = worldPos.y;
            return;
        }

        // Pressed on empty space - clear selection
        this.clearSelection();
    }

    /**
     * Handle Hammer press release
     */
    onHammerPressUp(e) {
        this.input.heldPiece = null;
        // If we held to select but didn't actually pan/drag, clear isDragging
        // so future pans don't move the selected pieces
        this.input.isDragging = false;
    }

    /**
     * Handle Hammer pan start
     */
    onHammerPanStart(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.center.x - rect.left;
        const screenY = e.center.y - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        const oldPanX = this.input.panStartScreenX;
        const oldPanY = this.input.panStartScreenY;

        this.input.panStartScreenX = screenX;
        this.input.panStartScreenY = screenY;
        this.input.startX = worldPos.x;
        this.input.startY = worldPos.y;
        this.input.touchCount = e.pointers.length;

        this.log(`PAN START ptrs=${e.pointers.length} screen=(${screenX.toFixed(0)},${screenY.toFixed(0)}) oldPan=(${oldPanX.toFixed(0)},${oldPanY.toFixed(0)}) isPinching=${this.input.isPinching}`);

        // If we're dragging a piece (from press/hold), continue that
        if (this.input.isDragging) {
            return;
        }

        // Lasso mode: start collecting path
        if (this.input.isLassoMode) {
            this.input.isDrawingLasso = true;
            this.input.lassoPath = [{ x: worldPos.x, y: worldPos.y }];
            return;
        }

        // Check for mouse modifier keys (srcEvent gives access to original event)
        const srcEvent = e.srcEvent;
        if (srcEvent && srcEvent.shiftKey) {
            // Shift + drag = selection box
            this.input.isSelecting = true;
            return;
        }

        if (srcEvent && srcEvent.altKey) {
            // Alt + drag = move piece (mouse only)
            const piece = this.getPieceAt(worldPos.x, worldPos.y);
            if (piece) {
                this.activatePieceDrag(piece, worldPos.x, worldPos.y);
                return;
            }
        }

        // Otherwise, start camera panning
        this.input.isPanning = true;
    }

    /**
     * Handle Hammer pan move
     */
    onHammerPanMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.center.x - rect.left;
        const screenY = e.center.y - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        this.input.currentX = worldPos.x;
        this.input.currentY = worldPos.y;
        this.input.touchCount = e.pointers.length;

        // Drawing lasso: add points to path
        if (this.input.isDrawingLasso) {
            this.input.lassoPath.push({ x: worldPos.x, y: worldPos.y });
            return;
        }

        if (this.input.isDragging) {
            // Move selected pieces in world coordinates
            this.moveSelectedPieces(
                worldPos.x - this.input.startX,
                worldPos.y - this.input.startY
            );
            this.input.startX = worldPos.x;
            this.input.startY = worldPos.y;

            // Edge panning
            this.updateEdgePanning(screenX, screenY);

        } else if (this.input.isSelecting) {
            // Selection box just updates currentX/currentY (already done above)
            // The selection box is drawn in render loop using startX/Y and currentX/Y

        } else if (this.input.isPanning && !this.input.isPinching) {
            // Pan camera using screen coordinates
            const dx = screenX - this.input.panStartScreenX;
            const dy = screenY - this.input.panStartScreenY;
            this.camera.x += dx;
            this.camera.y += dy;
            this.input.panStartScreenX = screenX;
            this.input.panStartScreenY = screenY;
        }
    }

    /**
     * Handle Hammer pan end
     */
    onHammerPanEnd(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.center ? e.center.x - rect.left : 0;
        const screenY = e.center ? e.center.y - rect.top : 0;

        this.log(`PAN END ptrs=${e.pointers?.length} screen=(${screenX.toFixed(0)},${screenY.toFixed(0)}) wasPanning=${this.input.isPanning}`);

        // Finish lasso selection
        if (this.input.isDrawingLasso) {
            this.selectPiecesInLasso();
            this.input.isDrawingLasso = false;
            this.input.lassoPath = [];

            // Auto turn off lasso mode after use
            this.input.isLassoMode = false;
            const lassoBtn = document.getElementById('lassoBtn');
            if (lassoBtn) lassoBtn.classList.remove('active');
        }

        if (this.input.isDragging) {
            // Only check snapping for pieces, not reference image
            if (this.selectedPieces.length > 0) {
                this.checkSnapping();
            }
            this.input.isDragging = false;
            this.edgePanning.active = false;

            // Trigger callback for auto-save
            if (this.onPieceMoveEnd) {
                this.onPieceMoveEnd(this.selectedPieces, this.referenceImage.isSelected);
            }
        } else if (this.input.isSelecting) {
            this.selectPiecesInBox();
            this.input.isSelecting = false;
        }

        this.input.isPanning = false;
        this.input.heldPiece = null;
        this.input.touchCount = 0;
    }

    /**
     * Handle Hammer pinch start - capture world position ONCE to prevent drift
     */
    onHammerPinchStart(e) {
        this.input.isPinching = true;
        this.input.isPanning = false;

        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.center.x - rect.left;
        const screenY = e.center.y - rect.top;

        // Capture world position under pinch center ONCE at start
        const worldPos = this.screenToWorld(screenX, screenY);
        this.input.pinchWorldX = worldPos.x;
        this.input.pinchWorldY = worldPos.y;
        this.input.pinchStartScale = this.camera.scale;
        this.input.pinchStartCamX = this.camera.x;
        this.input.pinchStartCamY = this.camera.y;
        this.input.pinchStartScreenX = screenX;
        this.input.pinchStartScreenY = screenY;
        this.input.touchCount = e.pointers.length;

        this.log(`PINCH START ptrs=${e.pointers.length} screen=(${screenX.toFixed(0)},${screenY.toFixed(0)}) scale=${this.camera.scale.toFixed(2)}`);
    }

    /**
     * Handle Hammer pinch move - recalculate from scratch to prevent drift
     */
    onHammerPinchMove(e) {
        if (!this.input.isPinching) return;

        const rect = this.canvas.getBoundingClientRect();
        const currentScreenX = e.center.x - rect.left;
        const currentScreenY = e.center.y - rect.top;

        // Calculate new scale from Hammer's cumulative scale value
        const newScale = Math.max(0.1, Math.min(5, this.input.pinchStartScale * e.scale));

        // Calculate how much the pinch center has moved (for pan-while-pinching)
        const panDeltaX = currentScreenX - this.input.pinchStartScreenX;
        const panDeltaY = currentScreenY - this.input.pinchStartScreenY;

        // Recalculate camera position from scratch (no accumulation = no drift!)
        // The world point that was under the original pinch center should now be under the current pinch center
        this.camera.scale = newScale;
        this.camera.x = currentScreenX - this.input.pinchWorldX * newScale;
        this.camera.y = currentScreenY - this.input.pinchWorldY * newScale;

        this.input.touchCount = e.pointers.length;
    }

    /**
     * Handle Hammer pinch end
     */
    onHammerPinchEnd(e) {
        this.input.isPinching = false;
        this.input.touchCount = e.pointers ? e.pointers.length : 0;

        const hasCenter = !!e.center;
        let newPanX = 'N/A', newPanY = 'N/A';

        // Reset pan start coordinates to current position
        // This prevents jump when transitioning from pinch to pan with remaining finger
        if (e.center) {
            const rect = this.canvas.getBoundingClientRect();
            this.input.panStartScreenX = e.center.x - rect.left;
            this.input.panStartScreenY = e.center.y - rect.top;
            newPanX = this.input.panStartScreenX.toFixed(0);
            newPanY = this.input.panStartScreenY.toFixed(0);
        }

        this.log(`PINCH END ptrs=${e.pointers?.length} hasCenter=${hasCenter} newPanStart=(${newPanX},${newPanY})`);
    }

    /**
     * Handle Hammer tap - deselect pieces when tapping background
     */
    onHammerTap(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.center.x - rect.left;
        const screenY = e.center.y - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        const piece = this.getPieceAt(worldPos.x, worldPos.y);
        if (!piece) {
            this.clearSelection();
        }
    }

    /**
     * Resize canvas to fill container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    /**
     * Log debug message - stores in array for main.js to display
     */
    log(msg) {
        if (!this.debugEnabled) return;
        const time = new Date().toISOString().substr(11, 12);
        this.debugMessages.push(`${time} ${msg}`);
        // Keep last 30 messages
        while (this.debugMessages.length > 30) {
            this.debugMessages.shift();
        }
    }

    /**
     * Handle mouse wheel for zooming
     * @param {WheelEvent} e - Wheel event
     */
    handleWheel(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom towards mouse position
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const oldScale = this.camera.scale;
        this.camera.scale = Math.max(0.1, Math.min(5, this.camera.scale * zoomFactor));

        // Adjust camera position to zoom towards mouse
        const worldBefore = this.screenToWorld(mouseX, mouseY);
        const scaleRatio = this.camera.scale / oldScale;
        const worldAfter = this.screenToWorld(mouseX, mouseY);

        this.camera.x += (worldAfter.x - worldBefore.x);
        this.camera.y += (worldAfter.y - worldBefore.y);
    }

    /**
     * Activate piece dragging mode
     * @param {Object} piece - Piece to drag
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     */
    activatePieceDrag(piece, x, y) {
        this.input.isDragging = true;
        this.input.isPanning = false;

        // If piece is already selected, drag the entire current selection
        if (piece.isSelected) {
            this.bringSelectedToFront();
            return;
        }

        // Otherwise, select all pieces in the same group
        this.clearSelection();
        const groupPieceIds = this.groups.get(piece.groupId);
        if (groupPieceIds) {
            groupPieceIds.forEach(pieceId => {
                const p = this.pieces.find(pp => pp.id === pieceId);
                if (p) {
                    p.isSelected = true;
                    this.selectedPieces.push(p);
                }
            });
        } else {
            // Fallback if no group found
            piece.isSelected = true;
            this.selectedPieces = [piece];
        }

        // Bring selected pieces to front
        this.bringSelectedToFront();

        // Notify selection change for remote user visibility
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedPieces, false);
        }
    }

    /**
     * Get piece at world coordinates
     * @param {number} x - World X
     * @param {number} y - World Y
     * @returns {Object|null} Piece or null
     */
    getPieceAt(x, y) {
        // Check from top to bottom (reverse z-order)
        const sorted = [...this.pieces].sort((a, b) => b.zIndex - a.zIndex);

        for (const piece of sorted) {
            // Skip locked pieces - they can't be selected
            if (piece.isLocked) continue;

            if (this.isPointInPiece(x, y, piece)) {
                return piece;
            }
        }

        return null;
    }

    /**
     * Check if point is inside piece
     * @param {number} x - World X
     * @param {number} y - World Y
     * @param {Object} piece - Piece object
     * @returns {boolean}
     */
    isPointInPiece(x, y, piece) {
        const relX = x - piece.currentX;
        const relY = y - piece.currentY;

        if (relX < 0 || relY < 0 || relX > piece.width || relY > piece.height) {
            return false;
        }

        // Check alpha channel
        const ctx = piece.canvas.getContext('2d');
        const imageData = ctx.getImageData(Math.floor(relX), Math.floor(relY), 1, 1);
        return imageData.data[3] > 128; // Alpha > 50%
    }

    /**
     * Move selected pieces
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     */
    moveSelectedPieces(dx, dy) {
        this.selectedPieces.forEach(piece => {
            piece.currentX += dx;
            piece.currentY += dy;
        });

        // Also move reference image if selected
        if (this.referenceImage.isSelected) {
            this.moveReferenceImage(dx, dy);
        }
    }

    /**
     * Update edge panning based on cursor/touch position
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     */
    updateEdgePanning(screenX, screenY) {
        const threshold = this.touchSettings.edgePanThreshold;
        const speed = this.touchSettings.edgePanSpeed;

        this.edgePanning.velocityX = 0;
        this.edgePanning.velocityY = 0;
        this.edgePanning.active = false;

        if (screenX < threshold) {
            this.edgePanning.velocityX = speed;
            this.edgePanning.active = true;
        } else if (screenX > this.canvas.width - threshold) {
            this.edgePanning.velocityX = -speed;
            this.edgePanning.active = true;
        }

        if (screenY < threshold) {
            this.edgePanning.velocityY = speed;
            this.edgePanning.active = true;
        } else if (screenY > this.canvas.height - threshold) {
            this.edgePanning.velocityY = -speed;
            this.edgePanning.active = true;
        }
    }

    /**
     * Apply edge panning
     */
    applyEdgePanning() {
        if (this.edgePanning.active) {
            this.camera.x += this.edgePanning.velocityX;
            this.camera.y += this.edgePanning.velocityY;
        }
    }

    /**
     * Select pieces in selection box
     */
    selectPiecesInBox() {
        const minX = Math.min(this.input.startX, this.input.currentX);
        const maxX = Math.max(this.input.startX, this.input.currentX);
        const minY = Math.min(this.input.startY, this.input.currentY);
        const maxY = Math.max(this.input.startY, this.input.currentY);

        this.clearSelection();

        this.pieces.forEach(piece => {
            const centerX = piece.currentX + piece.width / 2;
            const centerY = piece.currentY + piece.height / 2;

            if (centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY) {
                piece.isSelected = true;
                this.selectedPieces.push(piece);
            }
        });
    }

    /**
     * Clear piece selection
     */
    clearSelection() {
        const hadSelection = this.selectedPieces.length > 0 || this.referenceImage.isSelected;
        this.selectedPieces.forEach(piece => piece.isSelected = false);
        this.selectedPieces = [];
        this.referenceImage.isSelected = false;

        // Notify selection change (clearing)
        if (hadSelection && this.onSelectionChange) {
            this.onSelectionChange([], false);
        }
    }

    /**
     * Select pieces whose center falls within the lasso path
     */
    selectPiecesInLasso() {
        if (this.input.lassoPath.length < 3) return;

        this.clearSelection();

        this.pieces.forEach(piece => {
            if (piece.isLocked) return;

            const centerX = piece.currentX + piece.width / 2;
            const centerY = piece.currentY + piece.height / 2;

            if (this.pointInPolygon(centerX, centerY, this.input.lassoPath)) {
                piece.isSelected = true;
                this.selectedPieces.push(piece);
            }
        });
    }

    /**
     * Ray-casting algorithm to test if point is inside polygon
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Array} polygon - Array of {x, y} points
     * @returns {boolean} True if point is inside polygon
     */
    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Bring selected pieces to front
     */
    bringSelectedToFront() {
        const maxZ = Math.max(...this.pieces.map(p => p.zIndex));
        this.selectedPieces.forEach((piece, index) => {
            piece.zIndex = maxZ + index + 1;
        });
    }

    /**
     * Check for piece snapping (to correct position and to adjacent pieces)
     */
    checkSnapping() {
        const snapDist = this.touchSettings.snapDistance;

        // First check if any selected piece can snap to its correct final position
        // If so, snap and lock the entire group
        for (const piece of this.selectedPieces) {
            const dx = piece.correctX - piece.currentX;
            const dy = piece.correctY - piece.currentY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < snapDist) {
                // Snap the entire group to correct positions and lock them
                this.snapGroupToFinalPosition(piece.groupId, dx, dy);
                return; // Group is locked, done snapping
            }
        }

        // If no final position snap, check for adjacent piece snapping
        this.selectedPieces.forEach(piece => {
            this.checkAdjacentSnapping(piece, snapDist);
        });
    }

    /**
     * Snap entire group to final correct positions and lock
     * @param {number} groupId - Group to snap
     * @param {number} offsetX - X offset to apply
     * @param {number} offsetY - Y offset to apply
     */
    snapGroupToFinalPosition(groupId, offsetX, offsetY) {
        const pieceIds = this.groups.get(groupId);
        if (!pieceIds) return;

        pieceIds.forEach(pieceId => {
            const piece = this.pieces.find(p => p.id === pieceId);
            if (piece) {
                // Snap to exact correct position
                piece.currentX = piece.correctX;
                piece.currentY = piece.correctY;
                piece.isLocked = true;

                if (!piece.isPlaced) {
                    piece.isPlaced = true;
                    this.stats.placedPieces++;
                }
            }
        });

        // Clear isSelected on ALL selected pieces before clearing the array
        this.selectedPieces.forEach(piece => {
            piece.isSelected = false;
        });
        this.selectedPieces = [];
    }

    /**
     * Check if piece can snap to any adjacent pieces
     * @param {Object} piece - The piece to check
     * @param {number} snapDist - Snap distance threshold
     */
    checkAdjacentSnapping(piece, snapDist) {
        // Find adjacent pieces (up, down, left, right) that are NOT in same group
        const neighbors = this.pieces.filter(p => {
            if (p.id === piece.id) return false;
            if (p.groupId === piece.groupId) return false; // Skip same group
            const rowDiff = Math.abs(p.row - piece.row);
            const colDiff = Math.abs(p.col - piece.col);
            // Adjacent = exactly 1 step in row OR col, not both
            return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
        });

        neighbors.forEach(neighbor => {
            // Calculate where this piece SHOULD be relative to neighbor
            const expectedX = neighbor.currentX + (piece.col - neighbor.col) * (piece.width - piece.tabPadding * 2);
            const expectedY = neighbor.currentY + (piece.row - neighbor.row) * (piece.height - piece.tabPadding * 2);

            const dx = expectedX - piece.currentX;
            const dy = expectedY - piece.currentY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < snapDist) {
                // Snap this piece's entire group to align with neighbor
                const offsetX = expectedX - piece.currentX;
                const offsetY = expectedY - piece.currentY;

                this.moveGroup(piece.groupId, offsetX, offsetY);

                // Merge the groups
                this.mergeGroups(piece.groupId, neighbor.groupId);
            }
        });
    }

    /**
     * Move all pieces in a group by offset
     * @param {number} groupId - Group to move
     * @param {number} dx - X offset
     * @param {number} dy - Y offset
     */
    moveGroup(groupId, dx, dy) {
        const pieceIds = this.groups.get(groupId);
        if (!pieceIds) return;

        pieceIds.forEach(pieceId => {
            const piece = this.pieces.find(p => p.id === pieceId);
            if (piece) {
                piece.currentX += dx;
                piece.currentY += dy;
            }
        });
    }

    /**
     * Merge two groups into one
     * @param {number} groupA - First group ID
     * @param {number} groupB - Second group ID
     */
    mergeGroups(groupA, groupB) {
        if (groupA === groupB) return;

        const piecesA = this.groups.get(groupA);
        const piecesB = this.groups.get(groupB);

        if (!piecesA || !piecesB) return;

        // Merge B into A
        piecesB.forEach(pieceId => {
            piecesA.add(pieceId);
            const piece = this.pieces.find(p => p.id === pieceId);
            if (piece) {
                piece.groupId = groupA;

                // Also add to selectedPieces if not already selected
                // This ensures the entire merged group moves together on next drag
                if (!piece.isSelected) {
                    piece.isSelected = true;
                    this.selectedPieces.push(piece);
                }
            }
        });

        // Remove group B
        this.groups.delete(groupB);
    }

    /**
     * Convert screen coordinates to world coordinates
     * @param {number} screenX - Screen X
     * @param {number} screenY - Screen Y
     * @returns {Object} World coordinates
     */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.camera.x) / this.camera.scale,
            y: (screenY - this.camera.y) / this.camera.scale
        };
    }

    /**
     * Convert world coordinates to screen coordinates
     * @param {number} worldX - World X
     * @param {number} worldY - World Y
     * @returns {Object} Screen coordinates
     */
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.camera.scale + this.camera.x,
            y: worldY * this.camera.scale + this.camera.y
        };
    }

    /**
     * Start render loop
     */
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.render();
        }
    }

    /**
     * Stop render loop
     */
    stop() {
        this.isRunning = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    /**
     * Main render loop
     */
    render() {
        if (!this.isRunning) return;

        // Apply edge panning
        this.applyEdgePanning();

        // Clear canvas
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context
        this.ctx.save();

        // Apply camera transform
        this.ctx.translate(this.camera.x, this.camera.y);
        this.ctx.scale(this.camera.scale, this.camera.scale);

        // Draw puzzle border first (behind pieces)
        this.drawPuzzleBorder();

        // Draw reference image (behind pieces)
        this.drawReferenceImage();

        // Sort pieces by z-index, with locked pieces drawn first (at bottom)
        const sortedPieces = [...this.pieces].sort((a, b) => {
            // Locked pieces go first (lower z-index effectively)
            if (a.isLocked && !b.isLocked) return -1;
            if (!a.isLocked && b.isLocked) return 1;
            return a.zIndex - b.zIndex;
        });

        // Draw pieces
        sortedPieces.forEach(piece => {
            this.drawPiece(piece);
        });

        // Draw remote user selections
        this.drawRemoteSelections();

        // Draw selection box
        if (this.input.isSelecting) {
            this.drawSelectionBox();
        }

        // Draw lasso path
        if (this.input.isDrawingLasso) {
            this.drawLassoPath();
        }

        // Restore context
        this.ctx.restore();

        // Draw UI overlay
        this.drawUIOverlay();

        this.animationFrame = requestAnimationFrame(() => this.render());
    }

    /**
     * Get outline color that contrasts with the background
     * @returns {string} CSS color for outline
     */
    getContrastingOutlineColor() {
        // Parse background color to RGB
        const hex = this.backgroundColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Calculate luminance (perceived brightness)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return dark color on light background, light on dark
        return luminance > 0.5 ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)';
    }

    /**
     * Draw a puzzle piece
     * @param {Object} piece - Piece to draw
     */
    drawPiece(piece) {
        this.ctx.save();

        // Draw piece canvas
        this.ctx.drawImage(
            piece.canvas,
            piece.currentX,
            piece.currentY
        );

        // Draw outline - selection color if selected, subtle contrast color otherwise
        if (piece.isSelected) {
            this.ctx.strokeStyle = '#667eea';
            this.ctx.lineWidth = 3 / this.camera.scale;
        } else if (!piece.isLocked) {
            // Thin outline for unselected, unlocked pieces
            this.ctx.strokeStyle = this.getContrastingOutlineColor();
            this.ctx.lineWidth = 1 / this.camera.scale;
        }

        // Draw outline for selected or unlocked pieces
        if (piece.isSelected || !piece.isLocked) {
            this.drawPieceOutline(piece);
        }

        this.ctx.restore();
    }

    /**
     * Draw remote user selections with their colors
     */
    drawRemoteSelections() {
        for (const [userId, selection] of Object.entries(this.remoteSelections)) {
            const color = selection.color || '#ff6b6b';
            const displayName = selection.displayName || 'Player';

            // Check if remote user has reference image selected
            if (selection.referenceSelected && !this.referenceImage.isSelected) {
                this.drawRemoteReferenceSelection(color, displayName);
            }

            // Check for piece selections
            if (!selection.pieceIds || selection.pieceIds.length === 0) continue;

            // Find the pieces and draw highlights
            let minX = Infinity, minY = Infinity;

            selection.pieceIds.forEach(pieceId => {
                const piece = this.pieces.find(p => p.id === pieceId);
                if (piece && !piece.isSelected) {  // Don't highlight if locally selected
                    // Draw dashed outline
                    this.ctx.save();
                    this.ctx.strokeStyle = color;
                    this.ctx.lineWidth = 3 / this.camera.scale;
                    this.ctx.setLineDash([8 / this.camera.scale, 4 / this.camera.scale]);
                    this.drawPieceOutline(piece);
                    this.ctx.setLineDash([]);
                    this.ctx.restore();

                    // Track bounds for label
                    minX = Math.min(minX, piece.currentX);
                    minY = Math.min(minY, piece.currentY);
                }
            });

            // Draw username label above pieces
            if (minX !== Infinity) {
                this.ctx.save();
                const fontSize = 14 / this.camera.scale;
                this.ctx.font = `bold ${fontSize}px sans-serif`;

                // Background
                const textWidth = this.ctx.measureText(displayName).width;
                const padding = 4 / this.camera.scale;
                const labelX = minX;
                const labelY = minY - fontSize - padding * 2;

                this.ctx.fillStyle = color;
                this.ctx.fillRect(labelX - padding, labelY - padding, textWidth + padding * 2, fontSize + padding * 2);

                // Text
                this.ctx.fillStyle = 'white';
                this.ctx.fillText(displayName, labelX, labelY + fontSize - padding / 2);

                this.ctx.restore();
            }
        }
    }

    /**
     * Set remote user selections (from SSE updates)
     * @param {Object} selections - Map of userId -> selection data
     */
    setRemoteSelections(selections) {
        this.remoteSelections = selections || {};
    }

    /**
     * Draw piece outline following the actual piece shape
     * @param {Object} piece - Piece to outline
     */
    drawPieceOutline(piece) {
        const padding = piece.tabPadding;
        const w = piece.width - padding * 2;
        const h = piece.height - padding * 2;
        const tabSize = piece.tabSize;

        // Translate to piece position
        const baseX = piece.currentX + padding;
        const baseY = piece.currentY + padding;

        this.ctx.beginPath();
        this.ctx.moveTo(baseX, baseY);

        // Top edge
        if (piece.tabs.top.direction !== 0) {
            this.drawOutlineTab(baseX, baseY, baseX + w, baseY,
                piece.tabs.top.direction, tabSize, 'horizontal', 'top', piece.tabs.top.variation);
        } else {
            this.ctx.lineTo(baseX + w, baseY);
        }

        // Right edge
        if (piece.tabs.right.direction !== 0) {
            this.drawOutlineTab(baseX + w, baseY, baseX + w, baseY + h,
                piece.tabs.right.direction, tabSize, 'vertical', 'right', piece.tabs.right.variation);
        } else {
            this.ctx.lineTo(baseX + w, baseY + h);
        }

        // Bottom edge
        if (piece.tabs.bottom.direction !== 0) {
            this.drawOutlineTab(baseX + w, baseY + h, baseX, baseY + h,
                piece.tabs.bottom.direction, tabSize, 'horizontal', 'bottom', piece.tabs.bottom.variation);
        } else {
            this.ctx.lineTo(baseX, baseY + h);
        }

        // Left edge
        if (piece.tabs.left.direction !== 0) {
            this.drawOutlineTab(baseX, baseY + h, baseX, baseY,
                piece.tabs.left.direction, tabSize, 'vertical', 'left', piece.tabs.left.variation);
        } else {
            this.ctx.lineTo(baseX, baseY);
        }

        this.ctx.closePath();
        this.ctx.stroke();
    }

    /**
     * Draw a tab shape for the outline (mirrors PuzzleCutter.drawTab)
     */
    drawOutlineTab(x1, y1, x2, y2, direction, size, orientation, side, variation) {
        const length = orientation === 'horizontal' ? Math.abs(x2 - x1) : Math.abs(y2 - y1);

        const neckWidth = size * variation.neckWidth;
        const headWidth = size * variation.headWidth;
        const headHeight = size * variation.headHeight;
        const neckHeight = size * variation.neckHeight;

        let tabDir;
        if (side === 'top') {
            tabDir = -direction;
        } else if (side === 'bottom') {
            tabDir = direction;
        } else if (side === 'right') {
            tabDir = direction;
        } else {
            tabDir = -direction;
        }

        if (orientation === 'horizontal') {
            const dir = x2 > x1 ? 1 : -1;
            const midX = x1 + dir * length / 2;

            this.ctx.lineTo(midX - dir * neckWidth, y1);
            this.ctx.bezierCurveTo(
                midX - dir * neckWidth, y1 + tabDir * neckHeight,
                midX - dir * headWidth, y1 + tabDir * neckHeight,
                midX - dir * headWidth, y1 + tabDir * (neckHeight + headHeight * 0.5)
            );
            this.ctx.bezierCurveTo(
                midX - dir * headWidth, y1 + tabDir * (neckHeight + headHeight),
                midX + dir * headWidth, y1 + tabDir * (neckHeight + headHeight),
                midX + dir * headWidth, y1 + tabDir * (neckHeight + headHeight * 0.5)
            );
            this.ctx.bezierCurveTo(
                midX + dir * headWidth, y1 + tabDir * neckHeight,
                midX + dir * neckWidth, y1 + tabDir * neckHeight,
                midX + dir * neckWidth, y1
            );
            this.ctx.lineTo(x2, y2);
        } else {
            const dir = y2 > y1 ? 1 : -1;
            const midY = y1 + dir * length / 2;

            this.ctx.lineTo(x1, midY - dir * neckWidth);
            this.ctx.bezierCurveTo(
                x1 + tabDir * neckHeight, midY - dir * neckWidth,
                x1 + tabDir * neckHeight, midY - dir * headWidth,
                x1 + tabDir * (neckHeight + headHeight * 0.5), midY - dir * headWidth
            );
            this.ctx.bezierCurveTo(
                x1 + tabDir * (neckHeight + headHeight), midY - dir * headWidth,
                x1 + tabDir * (neckHeight + headHeight), midY + dir * headWidth,
                x1 + tabDir * (neckHeight + headHeight * 0.5), midY + dir * headWidth
            );
            this.ctx.bezierCurveTo(
                x1 + tabDir * neckHeight, midY + dir * headWidth,
                x1 + tabDir * neckHeight, midY + dir * neckWidth,
                x1, midY + dir * neckWidth
            );
            this.ctx.lineTo(x2, y2);
        }
    }

    /**
     * Draw puzzle border showing the target area
     */
    drawPuzzleBorder() {
        if (this.pieces.length === 0) return;

        // Get the first piece to determine tabPadding
        const firstPiece = this.pieces[0];
        const tabPadding = firstPiece.tabPadding;

        // Calculate actual image bounds (without tab padding)
        // correctX/Y already account for the image position, but we need the pure image area
        const bounds = this.calculatePuzzleBounds();

        // The bounds include piece dimensions which have tabPadding built in
        // We need to find the actual image rectangle
        const imageX = bounds.minX + tabPadding;
        const imageY = bounds.minY + tabPadding;
        const imageWidth = (bounds.maxX - bounds.minX) - tabPadding * 2;
        const imageHeight = (bounds.maxY - bounds.minY) - tabPadding * 2;

        // Draw dashed border
        this.ctx.save();
        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = 2 / this.camera.scale;
        this.ctx.setLineDash([10 / this.camera.scale, 5 / this.camera.scale]);

        this.ctx.strokeRect(imageX, imageY, imageWidth, imageHeight);

        this.ctx.setLineDash([]);
        this.ctx.restore();
    }

    /**
     * Draw selection box
     */
    drawSelectionBox() {
        this.ctx.strokeStyle = '#667eea';
        this.ctx.lineWidth = 2 / this.camera.scale;
        this.ctx.setLineDash([10 / this.camera.scale, 5 / this.camera.scale]);
        this.ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';

        const x = Math.min(this.input.startX, this.input.currentX);
        const y = Math.min(this.input.startY, this.input.currentY);
        const w = Math.abs(this.input.currentX - this.input.startX);
        const h = Math.abs(this.input.currentY - this.input.startY);

        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeRect(x, y, w, h);
        this.ctx.setLineDash([]);
    }

    /**
     * Draw lasso selection path
     */
    drawLassoPath() {
        if (this.input.lassoPath.length < 2) return;

        this.ctx.strokeStyle = '#667eea';
        this.ctx.lineWidth = 2 / this.camera.scale;
        this.ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
        this.ctx.setLineDash([]);

        this.ctx.beginPath();
        this.ctx.moveTo(this.input.lassoPath[0].x, this.input.lassoPath[0].y);

        for (const point of this.input.lassoPath) {
            this.ctx.lineTo(point.x, point.y);
        }

        // Close path back to start
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * Draw UI overlay (screen space)
     */
    drawUIOverlay() {
        // Debug log on canvas (disabled by default)
        if (this.debugEnabled && this.debugMessages.length > 0) {
            const lineHeight = 14;
            const padding = 8;
            const maxLines = 15;
            const msgs = this.debugMessages.slice(-maxLines);
            const boxHeight = msgs.length * lineHeight + padding * 2;
            const boxY = this.canvas.height - boxHeight - 10;

            // Background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            this.ctx.fillRect(10, boxY, this.canvas.width - 20, boxHeight);

            // Text
            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = '11px monospace';
            msgs.forEach((msg, i) => {
                this.ctx.fillText(msg, padding + 10, boxY + padding + (i + 1) * lineHeight - 2);
            });
        }
    }

    /**
     * Get completion percentage
     * @returns {number} Percentage (0-100)
     */
    getProgress() {
        return this.stats.totalPieces > 0
            ? Math.round((this.stats.placedPieces / this.stats.totalPieces) * 100)
            : 0;
    }

    /**
     * Reset camera view
     */
    resetView() {
        if (this.pieces.length > 0) {
            const bounds = this.calculatePuzzleBounds();
            this.camera.x = -bounds.centerX + this.canvas.width / 2;
            this.camera.y = -bounds.centerY + this.canvas.height / 2;
            this.camera.scale = 1;
        }
    }

    /**
     * Set canvas background color
     * @param {string} color - CSS color value
     */
    setBackgroundColor(color) {
        this.backgroundColor = color;
    }

    /**
     * Set the source image for reference image display
     * @param {HTMLImageElement} img - The loaded image
     */
    setSourceImage(img) {
        this.sourceImage = img;
        if (img) {
            this.referenceImage.width = img.width;
            this.referenceImage.height = img.height;
        }
    }

    /**
     * Draw the reference image (completed puzzle preview)
     */
    drawReferenceImage() {
        if (!this.referenceImage.visible || !this.sourceImage) return;

        const ref = this.referenceImage;

        this.ctx.save();

        // Draw image at 50% opacity
        this.ctx.globalAlpha = 0.5;
        this.ctx.drawImage(this.sourceImage, ref.x, ref.y, ref.width, ref.height);
        this.ctx.globalAlpha = 1.0;

        // Draw selection highlight if selected
        if (ref.isSelected) {
            // Local selection - solid rectangle in user's color
            this.ctx.strokeStyle = '#667eea';
            this.ctx.lineWidth = 3 / this.camera.scale;
            this.ctx.strokeRect(ref.x, ref.y, ref.width, ref.height);
        }

        this.ctx.restore();
    }

    /**
     * Draw remote reference image selection (when another user has it selected)
     * @param {string} color - User's color
     * @param {string} displayName - User's display name
     */
    drawRemoteReferenceSelection(color, displayName) {
        if (!this.referenceImage.visible || !this.sourceImage) return;

        const ref = this.referenceImage;

        this.ctx.save();

        // Dashed outline in remote user's color
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3 / this.camera.scale;
        this.ctx.setLineDash([8 / this.camera.scale, 4 / this.camera.scale]);
        this.ctx.strokeRect(ref.x, ref.y, ref.width, ref.height);
        this.ctx.setLineDash([]);

        // Draw username label
        const fontSize = 14 / this.camera.scale;
        this.ctx.font = `bold ${fontSize}px sans-serif`;

        const textWidth = this.ctx.measureText(displayName).width;
        const padding = 4 / this.camera.scale;
        const labelX = ref.x;
        const labelY = ref.y - fontSize - padding * 2;

        // Background
        this.ctx.fillStyle = color;
        this.ctx.fillRect(labelX - padding, labelY - padding, textWidth + padding * 2, fontSize + padding * 2);

        // Text
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(displayName, labelX, labelY + fontSize - padding / 2);

        this.ctx.restore();
    }

    /**
     * Check if a point is inside the reference image
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @returns {boolean}
     */
    isPointInReferenceImage(x, y) {
        if (!this.referenceImage.visible) return false;

        const ref = this.referenceImage;
        return x >= ref.x && x <= ref.x + ref.width &&
               y >= ref.y && y <= ref.y + ref.height;
    }

    /**
     * Select the reference image
     */
    selectReferenceImage() {
        this.referenceImage.isSelected = true;

        // Notify selection change
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedPieces, true);  // true = reference selected
        }
    }

    /**
     * Deselect the reference image
     */
    deselectReferenceImage() {
        const wasSelected = this.referenceImage.isSelected;
        this.referenceImage.isSelected = false;

        if (wasSelected && this.onSelectionChange) {
            this.onSelectionChange(this.selectedPieces, false);
        }
    }

    /**
     * Move the reference image
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     */
    moveReferenceImage(dx, dy) {
        this.referenceImage.x += dx;
        this.referenceImage.y += dy;
    }

    /**
     * Arrange selected pieces in a grid layout
     * Groups (connected pieces) stay together and are placed in top rows
     * Single pieces are placed in bottom rows
     */
    gridSpaceSelectedPieces() {
        if (this.selectedPieces.length < 2) return;

        // Find top-left corner of current selection
        let minX = Infinity, minY = Infinity;
        let maxPieceWidth = 0, maxPieceHeight = 0;

        this.selectedPieces.forEach(piece => {
            minX = Math.min(minX, piece.currentX);
            minY = Math.min(minY, piece.currentY);
            maxPieceWidth = Math.max(maxPieceWidth, piece.width);
            maxPieceHeight = Math.max(maxPieceHeight, piece.height);
        });

        // Group selected pieces by their groupId
        const groupMap = new Map(); // groupId -> pieces in that group (that are selected)
        this.selectedPieces.forEach(piece => {
            if (!groupMap.has(piece.groupId)) {
                groupMap.set(piece.groupId, []);
            }
            groupMap.get(piece.groupId).push(piece);
        });

        // Separate multi-piece groups from singles
        const multiGroups = []; // { pieces: [], bounds: { width, height, minX, minY } }
        const singles = [];

        groupMap.forEach((pieces, groupId) => {
            // Get ALL pieces in this group (not just selected ones)
            const allGroupPieceIds = this.groups.get(groupId);
            if (allGroupPieceIds && allGroupPieceIds.size > 1) {
                // This is a connected group - include ALL pieces from the group
                const allPieces = [];
                let gMinX = Infinity, gMinY = Infinity;
                let gMaxX = -Infinity, gMaxY = -Infinity;

                allGroupPieceIds.forEach(pieceId => {
                    const p = this.pieces.find(pp => pp.id === pieceId);
                    if (p) {
                        allPieces.push(p);
                        gMinX = Math.min(gMinX, p.currentX);
                        gMinY = Math.min(gMinY, p.currentY);
                        gMaxX = Math.max(gMaxX, p.currentX + p.width);
                        gMaxY = Math.max(gMaxY, p.currentY + p.height);
                    }
                });

                multiGroups.push({
                    pieces: allPieces,
                    bounds: {
                        minX: gMinX,
                        minY: gMinY,
                        width: gMaxX - gMinX,
                        height: gMaxY - gMinY
                    }
                });
            } else {
                // Single piece
                singles.push(...pieces);
            }
        });

        // Shuffle both arrays for randomized placement
        this.shuffleArray(multiGroups);
        this.shuffleArray(singles);

        // Calculate spacing for singles grid
        const singleSpacingX = maxPieceWidth + 10;
        const singleSpacingY = maxPieceHeight + 10;

        let currentY = minY;
        const gap = 20; // Gap between rows

        // Place multi-piece groups first (top layer)
        if (multiGroups.length > 0) {
            // Arrange groups in rows, fitting as many as possible per row
            let rowX = minX;
            let rowMaxHeight = 0;
            const canvasWidth = this.canvas.width / this.camera.scale;

            multiGroups.forEach(group => {
                // Check if group fits in current row
                if (rowX + group.bounds.width > minX + canvasWidth * 0.8 && rowX > minX) {
                    // Start new row
                    currentY += rowMaxHeight + gap;
                    rowX = minX;
                    rowMaxHeight = 0;
                }

                // Move all pieces in group, maintaining relative positions
                const offsetX = rowX - group.bounds.minX;
                const offsetY = currentY - group.bounds.minY;

                group.pieces.forEach(piece => {
                    piece.currentX += offsetX;
                    piece.currentY += offsetY;

                    // Add to selected pieces if not already
                    if (!piece.isSelected) {
                        piece.isSelected = true;
                        this.selectedPieces.push(piece);
                    }
                });

                rowX += group.bounds.width + gap;
                rowMaxHeight = Math.max(rowMaxHeight, group.bounds.height);
            });

            // Move to next row for singles
            currentY += rowMaxHeight + gap * 2;
        }

        // Place singles in grid (bottom layer)
        if (singles.length > 0) {
            const singlesCols = Math.ceil(Math.sqrt(singles.length));

            singles.forEach((piece, index) => {
                const col = index % singlesCols;
                const row = Math.floor(index / singlesCols);
                piece.currentX = minX + col * singleSpacingX;
                piece.currentY = currentY + row * singleSpacingY;
            });
        }

        // Trigger auto-save callback
        if (this.onPieceMoveEnd) {
            this.onPieceMoveEnd(this.selectedPieces, false);
        }
    }

    /**
     * Shuffle array in place (Fisher-Yates)
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Toggle reference image visibility
     * @returns {boolean} New visibility state
     */
    toggleReferenceImage() {
        this.referenceImage.visible = !this.referenceImage.visible;

        // If showing for first time, position at puzzle center
        if (this.referenceImage.visible && this.referenceImage.x === 0 && this.referenceImage.y === 0) {
            const bounds = this.calculatePuzzleBounds();
            // Get the first piece to determine tabPadding
            if (this.pieces.length > 0) {
                const tabPadding = this.pieces[0].tabPadding;
                this.referenceImage.x = bounds.minX + tabPadding;
                this.referenceImage.y = bounds.minY + tabPadding;
            }
        }

        return this.referenceImage.visible;
    }
}
