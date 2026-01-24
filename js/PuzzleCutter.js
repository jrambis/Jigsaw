/**
 * PuzzleCutter - Cuts images into jigsaw puzzle pieces
 * Handles piece generation with interlocking tabs and blanks
 */
class PuzzleCutter {
    constructor() {
        this.image = null;
        this.pieces = [];
        this.rows = 0;
        this.cols = 0;
        this.pieceWidth = 0;
        this.pieceHeight = 0;
        this.rng = null;  // Seeded random number generator
    }

    /**
     * Mulberry32 seeded PRNG - produces deterministic random numbers from a seed
     * @param {number} seed - 32-bit integer seed
     * @returns {Function} Random number generator function returning 0-1
     */
    createRNG(seed) {
        return function() {
            seed |= 0;
            seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    /**
     * Get a random number using the seeded RNG (or Math.random as fallback)
     * @returns {number} Random number between 0 and 1
     */
    random() {
        return this.rng ? this.rng() : Math.random();
    }

    /**
     * Load an image and cut it into puzzle pieces
     * @param {string} imagePath - Path to the image
     * @param {number} pieceCount - Target number of pieces
     * @param {number} [seed] - Optional seed for deterministic piece shapes
     * @returns {Promise<Array>} Array of puzzle pieces
     */
    async cutImage(imagePath, pieceCount, seed = null) {
        // Initialize seeded RNG if seed provided
        if (seed !== null) {
            this.rng = this.createRNG(seed);
        } else {
            this.rng = null;  // Fall back to Math.random
        }

        // Load the image
        this.image = await this.loadImage(imagePath);

        // Calculate grid dimensions
        this.calculateGrid(pieceCount);

        // Generate pieces
        this.pieces = this.generatePieces();

        return this.pieces;
    }

    /**
     * Load an image from a path
     * @param {string} path - Image path
     * @returns {Promise<HTMLImageElement>}
     */
    loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = path;
        });
    }

    /**
     * Calculate grid dimensions based on piece count
     * @param {number} targetCount - Desired number of pieces
     */
    calculateGrid(targetCount) {
        const aspectRatio = this.image.width / this.image.height;

        // Calculate rows and columns to get close to target count
        this.cols = Math.round(Math.sqrt(targetCount * aspectRatio));
        this.rows = Math.round(this.cols / aspectRatio);

        // Ensure minimum of 2x2
        this.cols = Math.max(2, this.cols);
        this.rows = Math.max(2, this.rows);

        this.pieceWidth = this.image.width / this.cols;
        this.pieceHeight = this.image.height / this.rows;
    }

    /**
     * Generate random variation for a tab/blank edge
     * @returns {Object} Variation parameters
     */
    generateEdgeVariation() {
        return {
            neckWidth: 0.4 + this.random() * 0.2,    // 0.4 - 0.6
            headWidth: 0.7 + this.random() * 0.3,    // 0.7 - 1.0
            headHeight: 0.8 + this.random() * 0.3,   // 0.8 - 1.1
            neckHeight: 0.1 + this.random() * 0.1    // 0.1 - 0.2
        };
    }

    /**
     * Generate all puzzle pieces with interlocking shapes
     * @returns {Array} Array of piece objects
     */
    generatePieces() {
        const pieces = [];

        // Generate random tab/blank pattern with variation
        // Each edge stores: { direction: 1/-1, variation: {...} }
        const horizontalEdges = []; // Vertical edges between pieces
        const verticalEdges = [];   // Horizontal edges between pieces

        // Generate horizontal edges (between columns)
        for (let row = 0; row < this.rows; row++) {
            horizontalEdges[row] = [];
            for (let col = 0; col < this.cols - 1; col++) {
                horizontalEdges[row][col] = {
                    direction: this.random() > 0.5 ? 1 : -1,
                    variation: this.generateEdgeVariation()
                };
            }
        }

        // Generate vertical edges (between rows)
        for (let row = 0; row < this.rows - 1; row++) {
            verticalEdges[row] = [];
            for (let col = 0; col < this.cols; col++) {
                verticalEdges[row][col] = {
                    direction: this.random() > 0.5 ? 1 : -1,
                    variation: this.generateEdgeVariation()
                };
            }
        }

        // Generate shuffled scatter positions within puzzle bounds
        const scatterPositions = this.generateShuffledPositions();

        // Create pieces
        let pieceId = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const piece = this.createPiece(
                    pieceId,
                    row,
                    col,
                    horizontalEdges,
                    verticalEdges,
                    scatterPositions[pieceId]
                );
                pieceId++;
                pieces.push(piece);
            }
        }

        return pieces;
    }

    /**
     * Generate shuffled positions for piece scattering
     * Creates a grid of positions within puzzle bounds and shuffles them
     * Ensures no piece starts at its correct position
     * @returns {Array} Array of {x, y} positions
     */
    generateShuffledPositions() {
        const positions = [];
        const totalPieces = this.rows * this.cols;

        // Create a grid of positions within the puzzle area
        const gridCols = this.cols;
        const gridRows = this.rows;

        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                // Position within cell with some randomness
                const cellWidth = this.image.width / gridCols;
                const cellHeight = this.image.height / gridRows;

                // Add random offset within cell (keep 20% margin)
                const margin = 0.2;
                const x = col * cellWidth + cellWidth * margin + this.random() * cellWidth * (1 - 2 * margin);
                const y = row * cellHeight + cellHeight * margin + this.random() * cellHeight * (1 - 2 * margin);

                positions.push({ x, y, originalRow: row, originalCol: col });
            }
        }

        // Fisher-Yates shuffle - but ensure no piece ends up at its original position
        for (let i = positions.length - 1; i > 0; i--) {
            // Pick a random index that's not the same as i (to avoid piece staying in place)
            let j;
            do {
                j = Math.floor(this.random() * (i + 1));
            } while (j === i && positions.length > 2);

            [positions[i], positions[j]] = [positions[j], positions[i]];
        }

        // Final check: ensure no piece is at its original grid position
        // If a piece ended up in its own cell, swap it with a neighbor
        for (let i = 0; i < positions.length; i++) {
            const pieceRow = Math.floor(i / this.cols);
            const pieceCol = i % this.cols;

            if (positions[i].originalRow === pieceRow && positions[i].originalCol === pieceCol) {
                // Swap with next position (wrap around if needed)
                const swapIdx = (i + 1) % positions.length;
                [positions[i], positions[swapIdx]] = [positions[swapIdx], positions[i]];
            }
        }

        return positions;
    }

    /**
     * Create a single puzzle piece
     * @param {number} id - Piece ID
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @param {Array} hEdges - Horizontal edge patterns
     * @param {Array} vEdges - Vertical edge patterns
     * @param {Object} scatterPos - Pre-computed scatter position {x, y}
     * @returns {Object} Piece object
     */
    createPiece(id, row, col, hEdges, vEdges, scatterPos) {
        const x = col * this.pieceWidth;
        const y = row * this.pieceHeight;

        // Determine tabs/blanks for each side with variation
        // Each edge: { direction: 0/1/-1, variation: {...} } or just 0 for flat edges
        const tabs = {
            top: row === 0 ? { direction: 0 } : {
                direction: -vEdges[row - 1][col].direction,
                variation: vEdges[row - 1][col].variation
            },
            right: col === this.cols - 1 ? { direction: 0 } : {
                direction: hEdges[row][col].direction,
                variation: hEdges[row][col].variation
            },
            bottom: row === this.rows - 1 ? { direction: 0 } : {
                direction: vEdges[row][col].direction,
                variation: vEdges[row][col].variation
            },
            left: col === 0 ? { direction: 0 } : {
                direction: -hEdges[row][col - 1].direction,
                variation: hEdges[row][col - 1].variation
            }
        };

        // Create canvas for this piece
        const canvas = document.createElement('canvas');
        const tabSize = Math.min(this.pieceWidth, this.pieceHeight) * 0.2;
        // Padding must accommodate max tab protrusion: neckHeight(0.2) + headHeight(1.1) = 1.3
        const tabPadding = tabSize * 1.5;

        // Canvas needs to be larger to accommodate tabs
        canvas.width = this.pieceWidth + tabPadding * 2;
        canvas.height = this.pieceHeight + tabPadding * 2;

        const ctx = canvas.getContext('2d');

        // Draw piece shape and clip image
        this.drawPieceShape(ctx, tabs, tabSize, tabPadding);

        // Draw the image portion
        // We need to draw extra image area to cover protruding tabs
        // Calculate source rectangle (clamped to image bounds)
        const srcX = Math.max(0, x - tabPadding);
        const srcY = Math.max(0, y - tabPadding);
        const srcRight = Math.min(this.image.width, x + this.pieceWidth + tabPadding);
        const srcBottom = Math.min(this.image.height, y + this.pieceHeight + tabPadding);
        const srcWidth = srcRight - srcX;
        const srcHeight = srcBottom - srcY;

        // Calculate destination rectangle (adjusted for clamping)
        const destX = tabPadding - (x - srcX);
        const destY = tabPadding - (y - srcY);

        ctx.save();
        ctx.clip();
        ctx.drawImage(
            this.image,
            srcX, srcY, srcWidth, srcHeight,
            destX, destY, srcWidth, srcHeight
        );
        ctx.restore();

        // Use pre-computed shuffled scatter position (within puzzle bounds)
        const scatterX = scatterPos.x;
        const scatterY = scatterPos.y;

        return {
            id,
            row,
            col,
            correctX: x,
            correctY: y,
            x: scatterX,
            y: scatterY,
            currentX: scatterX,
            currentY: scatterY,
            width: canvas.width,
            height: canvas.height,
            tabs,
            tabSize,
            tabPadding,
            canvas,
            isPlaced: false,
            isSelected: false,
            isLocked: false,
            rotation: 0,
            zIndex: id
        };
    }

    /**
     * Draw the puzzle piece shape with tabs and blanks
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} tabs - Tab configuration for each side
     * @param {number} tabSize - Size of tabs/blanks
     * @param {number} tabPadding - Padding around piece for tab protrusion
     */
    drawPieceShape(ctx, tabs, tabSize, tabPadding) {
        const w = ctx.canvas.width - tabPadding * 2;
        const h = ctx.canvas.height - tabPadding * 2;

        ctx.beginPath();
        ctx.moveTo(tabPadding, tabPadding);

        // Top edge
        if (tabs.top.direction !== 0) {
            this.drawTab(ctx,
                tabPadding, tabPadding,
                tabPadding + w, tabPadding,
                tabs.top.direction, tabSize, 'horizontal', 'top', tabs.top.variation
            );
        } else {
            ctx.lineTo(tabPadding + w, tabPadding);
        }

        // Right edge
        if (tabs.right.direction !== 0) {
            this.drawTab(ctx,
                tabPadding + w, tabPadding,
                tabPadding + w, tabPadding + h,
                tabs.right.direction, tabSize, 'vertical', 'right', tabs.right.variation
            );
        } else {
            ctx.lineTo(tabPadding + w, tabPadding + h);
        }

        // Bottom edge
        if (tabs.bottom.direction !== 0) {
            this.drawTab(ctx,
                tabPadding + w, tabPadding + h,
                tabPadding, tabPadding + h,
                tabs.bottom.direction, tabSize, 'horizontal', 'bottom', tabs.bottom.variation
            );
        } else {
            ctx.lineTo(tabPadding, tabPadding + h);
        }

        // Left edge
        if (tabs.left.direction !== 0) {
            this.drawTab(ctx,
                tabPadding, tabPadding + h,
                tabPadding, tabPadding,
                tabs.left.direction, tabSize, 'vertical', 'left', tabs.left.variation
            );
        } else {
            ctx.lineTo(tabPadding, tabPadding);
        }

        ctx.closePath();
    }

    /**
     * Draw a tab or blank on an edge with classic jigsaw shape
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x1 - Start x
     * @param {number} y1 - Start y
     * @param {number} x2 - End x
     * @param {number} y2 - End y
     * @param {number} direction - 1 for tab (out), -1 for blank (in)
     * @param {number} size - Tab size
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {string} side - 'top', 'right', 'bottom', or 'left'
     * @param {Object} variation - Tab dimension variations
     */
    drawTab(ctx, x1, y1, x2, y2, direction, size, orientation, side, variation) {
        const length = orientation === 'horizontal' ? Math.abs(x2 - x1) : Math.abs(y2 - y1);

        // Tab dimensions with variation
        const neckWidth = size * variation.neckWidth;
        const headWidth = size * variation.headWidth;
        const headHeight = size * variation.headHeight;
        const neckHeight = size * variation.neckHeight;

        // Calculate the actual tab direction based on which side we're drawing
        // direction = 1 means tab (protrude OUTSIDE), -1 means blank (cut INSIDE)
        // We need to determine what "outside" means for each side:
        // - Top edge: outside is negative Y (up)
        // - Right edge: outside is positive X (right)
        // - Bottom edge: outside is positive Y (down)
        // - Left edge: outside is negative X (left)
        let tabDir;
        if (side === 'top') {
            tabDir = -direction;  // Tab goes up (negative Y), blank goes down
        } else if (side === 'bottom') {
            tabDir = direction;   // Tab goes down (positive Y), blank goes up
        } else if (side === 'right') {
            tabDir = direction;   // Tab goes right (positive X), blank goes left
        } else { // left
            tabDir = -direction;  // Tab goes left (negative X), blank goes right
        }

        if (orientation === 'horizontal') {
            const dir = x2 > x1 ? 1 : -1;
            const midX = x1 + dir * length / 2;

            // Draw to start of neck
            ctx.lineTo(midX - dir * neckWidth, y1);

            // Left side of neck curving into head
            ctx.bezierCurveTo(
                midX - dir * neckWidth, y1 + tabDir * neckHeight,           // Control 1: straight down
                midX - dir * headWidth, y1 + tabDir * neckHeight,           // Control 2: out to head width
                midX - dir * headWidth, y1 + tabDir * (neckHeight + headHeight * 0.5)  // End: side of head
            );

            // Bottom curve of head (left to right)
            ctx.bezierCurveTo(
                midX - dir * headWidth, y1 + tabDir * (neckHeight + headHeight),  // Control 1: down
                midX + dir * headWidth, y1 + tabDir * (neckHeight + headHeight),  // Control 2: across
                midX + dir * headWidth, y1 + tabDir * (neckHeight + headHeight * 0.5)   // End: right side of head
            );

            // Right side of head curving back to neck
            ctx.bezierCurveTo(
                midX + dir * headWidth, y1 + tabDir * neckHeight,           // Control 1: up to neck level
                midX + dir * neckWidth, y1 + tabDir * neckHeight,           // Control 2: in to neck width
                midX + dir * neckWidth, y1                                   // End: back at edge
            );

            // Continue to end point
            ctx.lineTo(x2, y2);

        } else {
            const dir = y2 > y1 ? 1 : -1;
            const midY = y1 + dir * length / 2;

            // Draw to start of neck
            ctx.lineTo(x1, midY - dir * neckWidth);

            // Top side of neck curving into head
            ctx.bezierCurveTo(
                x1 + tabDir * neckHeight, midY - dir * neckWidth,           // Control 1: straight out
                x1 + tabDir * neckHeight, midY - dir * headWidth,           // Control 2: up to head width
                x1 + tabDir * (neckHeight + headHeight * 0.5), midY - dir * headWidth  // End: top of head
            );

            // Side curve of head (top to bottom)
            ctx.bezierCurveTo(
                x1 + tabDir * (neckHeight + headHeight), midY - dir * headWidth,  // Control 1: out
                x1 + tabDir * (neckHeight + headHeight), midY + dir * headWidth,  // Control 2: down
                x1 + tabDir * (neckHeight + headHeight * 0.5), midY + dir * headWidth   // End: bottom of head
            );

            // Bottom side of head curving back to neck
            ctx.bezierCurveTo(
                x1 + tabDir * neckHeight, midY + dir * headWidth,           // Control 1: back to neck depth
                x1 + tabDir * neckHeight, midY + dir * neckWidth,           // Control 2: in to neck width
                x1, midY + dir * neckWidth                                   // End: back at edge
            );

            // Continue to end point
            ctx.lineTo(x2, y2);
        }
    }
}
