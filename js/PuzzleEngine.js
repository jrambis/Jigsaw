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
            // Pinch-to-zoom state
            pinchStartDistance: 0,
            pinchStartScale: 1,
            pinchCenterX: 0,
            pinchCenterY: 0,
            dragStartTime: 0,
            holdTimer: null,
            touchCount: 0
        };

        // Touch-specific settings
        this.touchSettings = {
            holdDelay: 300, // ms to wait before activating piece drag
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
     * Setup event listeners for mouse and touch
     */
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
     * Handle touch start event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchStart(e) {
        e.preventDefault();

        const touches = e.touches;
        this.input.touchCount = touches.length;

        if (touches.length === 1) {
            // Single touch - could be pan or piece drag
            const touch = touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const screenX = touch.clientX - rect.left;
            const screenY = touch.clientY - rect.top;
            const worldPos = this.screenToWorld(screenX, screenY);

            this.input.startX = worldPos.x;
            this.input.startY = worldPos.y;
            this.input.currentX = worldPos.x;
            this.input.currentY = worldPos.y;
            // Store screen coords for panning
            this.input.panStartScreenX = screenX;
            this.input.panStartScreenY = screenY;
            this.input.dragStartTime = Date.now();

            // Check if touching a piece
            const piece = this.getPieceAt(worldPos.x, worldPos.y);

            if (piece) {
                // Start hold timer - if user holds for touchSettings.holdDelay ms, activate piece drag
                this.input.holdTimer = setTimeout(() => {
                    this.activatePieceDrag(piece, worldPos.x, worldPos.y);
                }, this.touchSettings.holdDelay);
            } else {
                // No piece, activate pan immediately and deselect
                this.input.isPanning = true;
                this.clearSelection();
            }

        } else if (touches.length === 2) {
            // Two-finger touch - pinch-to-zoom
            this.clearHoldTimer();
            this.input.isPanning = false;
            this.input.isPinching = true;
            this._pinchLogCount = 0; // Reset log counter

            const touch1 = touches[0];
            const touch2 = touches[1];
            const rect = this.canvas.getBoundingClientRect();

            // Calculate initial distance between two fingers
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            this.input.pinchStartDistance = Math.sqrt(dx * dx + dy * dy);
            this.input.pinchStartScale = this.camera.scale;

            // Calculate center point between fingers (in screen coords)
            this.input.pinchCenterX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
            this.input.pinchCenterY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

            console.log('=== PINCH START ===');
            console.log('Initial distance:', this.input.pinchStartDistance.toFixed(1));
            console.log('Initial scale:', this.input.pinchStartScale.toFixed(3));
            console.log('Pinch center:', this.input.pinchCenterX.toFixed(1), this.input.pinchCenterY.toFixed(1));
            console.log('Camera pos:', this.camera.x.toFixed(1), this.camera.y.toFixed(1));
            console.log('===================');
        }
    }

    /**
     * Handle touch move event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchMove(e) {
        e.preventDefault();

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const screenX = touch.clientX - rect.left;
            const screenY = touch.clientY - rect.top;
            const worldPos = this.screenToWorld(screenX, screenY);

            // If moved more than 10px in screen space, cancel hold timer and activate pan if not dragging
            const screenDx = Math.abs(screenX - this.input.panStartScreenX);
            const screenDy = Math.abs(screenY - this.input.panStartScreenY);

            if ((screenDx > 10 || screenDy > 10) && !this.input.isDragging) {
                this.clearHoldTimer();
                if (!this.input.isPanning) {
                    this.input.isPanning = true;
                }
            }

            this.input.currentX = worldPos.x;
            this.input.currentY = worldPos.y;

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

            } else if (this.input.isPanning) {
                // Pan camera using screen coordinates (not world!)
                const dx = screenX - this.input.panStartScreenX;
                const dy = screenY - this.input.panStartScreenY;
                this.camera.x += dx;
                this.camera.y += dy;
                // Update pan start for next frame
                this.input.panStartScreenX = screenX;
                this.input.panStartScreenY = screenY;
            }

        } else if (e.touches.length === 2 && this.input.isPinching) {
            // Pinch-to-zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const rect = this.canvas.getBoundingClientRect();

            // Calculate current distance between fingers
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);

            // Calculate new scale based on pinch ratio
            const pinchRatio = currentDistance / this.input.pinchStartDistance;
            const newScale = Math.max(0.1, Math.min(5, this.input.pinchStartScale * pinchRatio));

            // Calculate current center point between fingers
            const newCenterX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
            const newCenterY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

            // Store old values for logging
            const oldScale = this.camera.scale;
            const oldCamX = this.camera.x;
            const oldCamY = this.camera.y;

            // Get world position under pinch center BEFORE scale change
            const worldPos = this.screenToWorld(this.input.pinchCenterX, this.input.pinchCenterY);

            // Apply new scale
            this.camera.scale = newScale;

            // Convert world position back to screen - it will be offset now
            const screenPos = this.worldToScreen(worldPos.x, worldPos.y);

            // Calculate zoom adjustment
            const zoomAdjustX = this.input.pinchCenterX - screenPos.x;
            const zoomAdjustY = this.input.pinchCenterY - screenPos.y;

            // Adjust camera so the world point stays under the pinch center
            this.camera.x += zoomAdjustX;
            this.camera.y += zoomAdjustY;

            // Also allow panning while pinching by tracking finger movement
            const centerDx = newCenterX - this.input.pinchCenterX;
            const centerDy = newCenterY - this.input.pinchCenterY;
            this.camera.x += centerDx;
            this.camera.y += centerDy;

            // Throttled logging (every 10th frame approx)
            if (!this._pinchLogCount) this._pinchLogCount = 0;
            this._pinchLogCount++;
            if (this._pinchLogCount % 10 === 0) {
                console.log('=== PINCH ZOOM ===');
                console.log('Scale:', oldScale.toFixed(3), '->', newScale.toFixed(3), '(ratio:', pinchRatio.toFixed(3) + ')');
                console.log('Pinch center (screen):', this.input.pinchCenterX.toFixed(1), this.input.pinchCenterY.toFixed(1));
                console.log('World pos under center:', worldPos.x.toFixed(1), worldPos.y.toFixed(1));
                console.log('Screen pos after scale:', screenPos.x.toFixed(1), screenPos.y.toFixed(1));
                console.log('Zoom adjust:', zoomAdjustX.toFixed(1), zoomAdjustY.toFixed(1));
                console.log('Pan adjust:', centerDx.toFixed(1), centerDy.toFixed(1));
                console.log('Camera:', oldCamX.toFixed(1), oldCamY.toFixed(1), '->', this.camera.x.toFixed(1), this.camera.y.toFixed(1));
                console.log('==================');
            }

            // Update pinch center for next frame
            this.input.pinchCenterX = newCenterX;
            this.input.pinchCenterY = newCenterY;
        }
    }

    /**
     * Handle touch end event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchEnd(e) {
        e.preventDefault();

        this.clearHoldTimer();

        if (this.input.isDragging) {
            // Check for snapping
            this.checkSnapping();
            this.input.isDragging = false;
            this.edgePanning.active = false;

        } else if (this.input.isPinching) {
            // End pinch-to-zoom
            console.log('=== PINCH END ===');
            console.log('Final scale:', this.camera.scale.toFixed(3));
            console.log('Final camera:', this.camera.x.toFixed(1), this.camera.y.toFixed(1));
            console.log('=================');
            this.input.isPinching = false;

        } else if (this.input.isSelecting) {
            // Complete selection
            this.selectPiecesInBox();
            this.input.isSelecting = false;

        } else if (this.input.isPanning) {
            this.input.isPanning = false;
        }

        this.input.touchCount = e.touches.length;
    }

    /**
     * Handle mouse pointer down
     * @param {MouseEvent} e - Mouse event
     */
    handlePointerDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        this.input.startX = worldPos.x;
        this.input.startY = worldPos.y;
        this.input.currentX = worldPos.x;
        this.input.currentY = worldPos.y;
        // Store screen coords for panning
        this.input.panStartScreenX = screenX;
        this.input.panStartScreenY = screenY;

        if (e.shiftKey) {
            // Shift + drag = selection box
            this.input.isSelecting = true;
        } else if (e.altKey) {
            // Alt + drag = move piece
            const piece = this.getPieceAt(worldPos.x, worldPos.y);
            if (piece) {
                this.activatePieceDrag(piece, worldPos.x, worldPos.y);
            }
        } else {
            // Regular drag = pan, deselect if clicking on empty space
            this.input.isPanning = true;
            const piece = this.getPieceAt(worldPos.x, worldPos.y);
            if (!piece) {
                this.clearSelection();
            }
        }
    }

    /**
     * Handle mouse pointer move
     * @param {MouseEvent} e - Mouse event
     */
    handlePointerMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        this.input.currentX = worldPos.x;
        this.input.currentY = worldPos.y;

        if (this.input.isDragging) {
            // Move selected pieces in world coordinates
            this.moveSelectedPieces(
                worldPos.x - this.input.startX,
                worldPos.y - this.input.startY
            );
            this.input.startX = worldPos.x;
            this.input.startY = worldPos.y;

        } else if (this.input.isPanning) {
            // Pan camera using screen coordinates (not world!)
            const dx = screenX - this.input.panStartScreenX;
            const dy = screenY - this.input.panStartScreenY;
            this.camera.x += dx;
            this.camera.y += dy;
            // Update pan start for next frame
            this.input.panStartScreenX = screenX;
            this.input.panStartScreenY = screenY;
        }
    }

    /**
     * Handle mouse pointer up
     * @param {MouseEvent} e - Mouse event
     */
    handlePointerUp(e) {
        if (this.input.isDragging) {
            this.checkSnapping();
            this.input.isDragging = false;
        } else if (this.input.isSelecting) {
            this.selectPiecesInBox();
            this.input.isSelecting = false;
        } else if (this.input.isPanning) {
            this.input.isPanning = false;
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
     * Clear hold timer
     */
    clearHoldTimer() {
        if (this.input.holdTimer) {
            clearTimeout(this.input.holdTimer);
            this.input.holdTimer = null;
        }
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

        // Select all pieces in the same group
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
        this.selectedPieces.forEach(piece => piece.isSelected = false);
        this.selectedPieces = [];
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
                piece.isSelected = false;

                if (!piece.isPlaced) {
                    piece.isPlaced = true;
                    this.stats.placedPieces++;
                }
            }
        });

        // Clear selection since pieces are now locked
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
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context
        this.ctx.save();

        // Apply camera transform
        this.ctx.translate(this.camera.x, this.camera.y);
        this.ctx.scale(this.camera.scale, this.camera.scale);

        // Draw puzzle border first (behind pieces)
        this.drawPuzzleBorder();

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

        // Draw selection box
        if (this.input.isSelecting) {
            this.drawSelectionBox();
        }

        // Restore context
        this.ctx.restore();

        // Draw UI overlay
        this.drawUIOverlay();

        this.animationFrame = requestAnimationFrame(() => this.render());
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

        // Highlight if selected - draw outline following piece shape
        if (piece.isSelected) {
            this.ctx.strokeStyle = '#667eea';
            this.ctx.lineWidth = 3 / this.camera.scale;
            this.drawPieceOutline(piece);
        }

        // Locked pieces don't need any special outline - they're in final position

        this.ctx.restore();
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
     * Draw UI overlay (screen space)
     */
    drawUIOverlay() {
        // Show touch info
        if (this.input.touchCount > 0) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(10, 10, 200, 30);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px sans-serif';
            this.ctx.fillText(`Touches: ${this.input.touchCount}`, 20, 30);
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
}
