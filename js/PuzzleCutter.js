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
    }

    /**
     * Load an image and cut it into puzzle pieces
     * @param {string} imagePath - Path to the image
     * @param {number} pieceCount - Target number of pieces
     * @returns {Promise<Array>} Array of puzzle pieces
     */
    async cutImage(imagePath, pieceCount) {
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

        // Ensure minimum of 3x3
        this.cols = Math.max(3, this.cols);
        this.rows = Math.max(3, this.rows);

        this.pieceWidth = this.image.width / this.cols;
        this.pieceHeight = this.image.height / this.rows;
    }

    /**
     * Generate all puzzle pieces with interlocking shapes
     * @returns {Array} Array of piece objects
     */
    generatePieces() {
        const pieces = [];

        // Generate random tab/blank pattern
        // Each edge can have a tab (1), blank (-1), or be flat (0 for edges)
        const horizontalEdges = []; // Vertical edges between pieces
        const verticalEdges = [];   // Horizontal edges between pieces

        // Generate horizontal edges (between columns)
        for (let row = 0; row < this.rows; row++) {
            horizontalEdges[row] = [];
            for (let col = 0; col < this.cols - 1; col++) {
                horizontalEdges[row][col] = Math.random() > 0.5 ? 1 : -1;
            }
        }

        // Generate vertical edges (between rows)
        for (let row = 0; row < this.rows - 1; row++) {
            verticalEdges[row] = [];
            for (let col = 0; col < this.cols; col++) {
                verticalEdges[row][col] = Math.random() > 0.5 ? 1 : -1;
            }
        }

        // Create pieces
        let pieceId = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const piece = this.createPiece(
                    pieceId++,
                    row,
                    col,
                    horizontalEdges,
                    verticalEdges
                );
                pieces.push(piece);
            }
        }

        return pieces;
    }

    /**
     * Create a single puzzle piece
     * @param {number} id - Piece ID
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @param {Array} hEdges - Horizontal edge patterns
     * @param {Array} vEdges - Vertical edge patterns
     * @returns {Object} Piece object
     */
    createPiece(id, row, col, hEdges, vEdges) {
        const x = col * this.pieceWidth;
        const y = row * this.pieceHeight;

        // Determine tabs/blanks for each side
        const tabs = {
            top: row === 0 ? 0 : -vEdges[row - 1][col],
            right: col === this.cols - 1 ? 0 : hEdges[row][col],
            bottom: row === this.rows - 1 ? 0 : vEdges[row][col],
            left: col === 0 ? 0 : -hEdges[row][col - 1]
        };

        // Create canvas for this piece
        const canvas = document.createElement('canvas');
        const tabSize = Math.min(this.pieceWidth, this.pieceHeight) * 0.2;

        // Canvas needs to be larger to accommodate tabs
        canvas.width = this.pieceWidth + tabSize * 2;
        canvas.height = this.pieceHeight + tabSize * 2;

        const ctx = canvas.getContext('2d');

        // Draw piece shape and clip image
        this.drawPieceShape(ctx, tabs, tabSize);

        // Draw the image portion
        ctx.save();
        ctx.clip();
        ctx.drawImage(
            this.image,
            x, y, this.pieceWidth, this.pieceHeight,
            tabSize, tabSize, this.pieceWidth, this.pieceHeight
        );
        ctx.restore();

        // Randomize initial position (scattered around canvas)
        const scatterRange = 500;
        const randomX = x + (Math.random() - 0.5) * scatterRange;
        const randomY = y + (Math.random() - 0.5) * scatterRange;

        return {
            id,
            row,
            col,
            correctX: x,
            correctY: y,
            x: randomX,
            y: randomY,
            currentX: randomX,
            currentY: randomY,
            width: canvas.width,
            height: canvas.height,
            tabs,
            tabSize,
            canvas,
            isPlaced: false,
            isSelected: false,
            rotation: 0,
            zIndex: id
        };
    }

    /**
     * Draw the puzzle piece shape with tabs and blanks
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} tabs - Tab configuration for each side
     * @param {number} tabSize - Size of tabs/blanks
     */
    drawPieceShape(ctx, tabs, tabSize) {
        const w = ctx.canvas.width - tabSize * 2;
        const h = ctx.canvas.height - tabSize * 2;

        ctx.beginPath();
        ctx.moveTo(tabSize, tabSize);

        // Top edge
        if (tabs.top !== 0) {
            this.drawTab(ctx,
                tabSize, tabSize,
                tabSize + w, tabSize,
                tabs.top, tabSize, 'horizontal'
            );
        } else {
            ctx.lineTo(tabSize + w, tabSize);
        }

        // Right edge
        if (tabs.right !== 0) {
            this.drawTab(ctx,
                tabSize + w, tabSize,
                tabSize + w, tabSize + h,
                tabs.right, tabSize, 'vertical'
            );
        } else {
            ctx.lineTo(tabSize + w, tabSize + h);
        }

        // Bottom edge
        if (tabs.bottom !== 0) {
            this.drawTab(ctx,
                tabSize + w, tabSize + h,
                tabSize, tabSize + h,
                tabs.bottom, tabSize, 'horizontal'
            );
        } else {
            ctx.lineTo(tabSize, tabSize + h);
        }

        // Left edge
        if (tabs.left !== 0) {
            this.drawTab(ctx,
                tabSize, tabSize + h,
                tabSize, tabSize,
                tabs.left, tabSize, 'vertical'
            );
        } else {
            ctx.lineTo(tabSize, tabSize);
        }

        ctx.closePath();
    }

    /**
     * Draw a tab or blank on an edge
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x1 - Start x
     * @param {number} y1 - Start y
     * @param {number} x2 - End x
     * @param {number} y2 - End y
     * @param {number} direction - 1 for tab (out), -1 for blank (in)
     * @param {number} size - Tab size
     * @param {string} orientation - 'horizontal' or 'vertical'
     */
    drawTab(ctx, x1, y1, x2, y2, direction, size, orientation) {
        const length = orientation === 'horizontal' ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
        const center = length / 2;
        const tabWidth = size * 1.2;
        const tabHeight = size * direction;

        if (orientation === 'horizontal') {
            const dir = x2 > x1 ? 1 : -1;
            ctx.lineTo(x1 + dir * (center - tabWidth / 2), y1);
            ctx.quadraticCurveTo(
                x1 + dir * center, y1 + tabHeight,
                x1 + dir * (center + tabWidth / 2), y1
            );
            ctx.lineTo(x2, y2);
        } else {
            const dir = y2 > y1 ? 1 : -1;
            ctx.lineTo(x1, y1 + dir * (center - tabWidth / 2));
            ctx.quadraticCurveTo(
                x1 + tabHeight, y1 + dir * center,
                x1, y1 + dir * (center + tabWidth / 2)
            );
            ctx.lineTo(x2, y2);
        }
    }
}
