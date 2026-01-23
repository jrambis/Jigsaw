/**
 * PuzzleEngine - Manages puzzle rendering, interaction, and game logic
 * Includes touch controls: tap=pan, hold-drag=move piece, edge panning, selection box
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
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            // Screen coordinates for panning (separate from world coords)
            panStartScreenX: 0,
            panStartScreenY: 0,
            dragStartTime: 0,
            holdTimer: null,
            touchCount: 0
        };

        // Touch-specific settings
        this.touchSettings = {
            holdDelay: 300, // ms to wait before activating piece drag
            edgePanThreshold: 60, // pixels from edge to trigger panning
            edgePanSpeed: 5,
            snapDistance: 20 // Distance for auto-snapping pieces
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
                // No piece, activate pan immediately
                this.input.isPanning = true;
            }

        } else if (touches.length === 2) {
            // Two-finger touch - selection box
            this.clearHoldTimer();
            this.input.isSelecting = true;

            const touch1 = touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const worldPos = this.screenToWorld(touch1.clientX - rect.left, touch1.clientY - rect.top);

            this.input.startX = worldPos.x;
            this.input.startY = worldPos.y;
            this.input.currentX = worldPos.x;
            this.input.currentY = worldPos.y;
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

        } else if (e.touches.length === 2 && this.input.isSelecting) {
            // Update selection box
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const worldPos = this.screenToWorld(touch.clientX - rect.left, touch.clientY - rect.top);

            this.input.currentX = worldPos.x;
            this.input.currentY = worldPos.y;
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
            // Regular drag = pan
            this.input.isPanning = true;
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

        if (!piece.isSelected) {
            this.clearSelection();
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
     * Check for piece snapping
     */
    checkSnapping() {
        const snapDist = this.touchSettings.snapDistance;

        this.selectedPieces.forEach(piece => {
            const dx = piece.correctX - piece.currentX;
            const dy = piece.correctY - piece.currentY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < snapDist) {
                // Snap to correct position
                piece.currentX = piece.correctX;
                piece.currentY = piece.correctY;

                if (!piece.isPlaced) {
                    piece.isPlaced = true;
                    this.stats.placedPieces++;
                }
            }
        });
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

        // Sort pieces by z-index
        const sortedPieces = [...this.pieces].sort((a, b) => a.zIndex - b.zIndex);

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

        // Highlight if selected
        if (piece.isSelected) {
            this.ctx.strokeStyle = '#667eea';
            this.ctx.lineWidth = 3 / this.camera.scale;
            this.ctx.strokeRect(
                piece.currentX,
                piece.currentY,
                piece.width,
                piece.height
            );
        }

        // Show correct position outline (for debugging)
        if (piece.isPlaced) {
            this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
            this.ctx.lineWidth = 2 / this.camera.scale;
            this.ctx.strokeRect(
                piece.correctX,
                piece.correctY,
                piece.width,
                piece.height
            );
        }

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
