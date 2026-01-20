# Multiplayer Jigsaw Puzzle

A browser-based multiplayer jigsaw puzzle application designed for 2 users with support for 25-1500 pieces.

## Project Overview

**Hosting:** Ionos PHP shared hosting at Rambis.net/puzzle
**Architecture:** Canvas-based frontend with PHP backend using SSE for real-time synchronization
**Storage:** JSON file-based persistence

## Development Phases

### ✅ Phase 1: Core Engine (Complete)
- **PuzzleCutter.js** - Image slicing into puzzle pieces with interlocking tabs/blanks
- **PuzzleEngine.js** - Canvas rendering, piece management, collision detection, camera system
- **main.js** - Application initialization and UI management

### ✅ Phase 2: Touch Controls (Complete)
- **Tap = Pan** - Single tap and drag to pan the canvas
- **Hold & Drag = Move Piece** - Hold on a piece for 300ms to activate drag mode
- **Edge Panning** - Automatic camera panning when dragging near screen edges
- **Selection Box** - Two-finger touch to create selection box for multiple pieces

### 🔄 Phase 3: PHP Persistence (Planned)
- Save/load puzzle state to JSON files
- Session management
- Auto-save functionality

### 🔄 Phase 4: Multiplayer SSE Sync (Planned)
- Real-time piece position synchronization
- Player presence indicators
- Conflict resolution for simultaneous piece moves

### 🔄 Phase 5: Image Upload Admin (Planned)
- Admin interface for uploading puzzle images
- Image library management
- Thumbnail generation

### 🔄 Phase 6: Performance Polish (Planned)
- Optimization for 1500-piece puzzles
- Render performance improvements
- Memory management
- Progressive loading

## Features

### Current Features
- **Puzzle Generation:** Automatic cutting of images into interlocking jigsaw pieces
- **Multiple Piece Counts:** 25, 50, 100, 200, 500, 1000, 1500 pieces
- **Touch Controls:**
  - Single-finger tap/drag for panning
  - Hold gesture (300ms) on piece to activate drag mode
  - Edge panning for smooth navigation while dragging pieces
  - Two-finger touch for multi-select
- **Mouse Controls:**
  - Click and drag to pan
  - Alt + drag to move pieces
  - Shift + drag for selection box
  - Mouse wheel to zoom
- **Smart Snapping:** Pieces automatically snap to correct position when close
- **Progress Tracking:** Real-time completion percentage
- **Responsive Design:** Works on desktop, tablet, and mobile devices

### Controls

#### Touch Devices
- **Pan:** Tap and drag on empty area
- **Move Piece:** Hold on piece (300ms), then drag
- **Edge Panning:** Drag piece near screen edge to auto-pan
- **Selection Box:** Two-finger touch and drag

#### Desktop/Mouse
- **Pan:** Click and drag
- **Move Piece:** Alt + Click and drag
- **Selection Box:** Shift + Click and drag
- **Zoom:** Mouse wheel

## File Structure

```
/Jigsaw
├── index.html              # Main HTML file
├── styles.css              # Application styles
├── js/
│   ├── PuzzleCutter.js     # Puzzle piece generation
│   ├── PuzzleEngine.js     # Game engine and rendering
│   └── main.js             # Application initialization
└── README.md               # This file
```

## Technical Details

### PuzzleCutter.js
- Loads source images
- Calculates optimal grid dimensions based on piece count and aspect ratio
- Generates puzzle piece shapes with randomized interlocking tabs and blanks
- Creates individual canvas elements for each piece
- Randomizes initial piece positions

### PuzzleEngine.js
- Canvas-based rendering with camera system (pan, zoom)
- Input handling for both mouse and touch events
- Touch gesture recognition:
  - Hold timer for piece drag activation
  - Multi-touch detection for selection box
  - Edge detection for automatic panning
- Piece collision detection using alpha channel testing
- Smart snapping with configurable snap distance
- Z-index management for piece layering
- Selection box for multiple pieces
- Progress tracking

### Performance Considerations
- Efficient rendering with requestAnimationFrame
- Piece canvas pre-rendering
- Z-index sorting for correct draw order
- Touch event passive flag optimization
- Viewport culling (planned for Phase 6)

## Browser Compatibility

- **Recommended:** Chrome, Firefox, Safari, Edge (latest versions)
- **Touch Support:** iOS Safari, Chrome Mobile, Firefox Mobile
- **Requirements:** HTML5 Canvas, ES6 JavaScript support

## Installation

1. Clone or download the repository
2. Serve the files using any web server (PHP not required for Phases 1-2)
3. Open `index.html` in a web browser

For development:
```bash
# Simple HTTP server (Python 3)
python -m http.server 8000

# Or use PHP built-in server
php -S localhost:8000
```

## Usage

1. Select the desired number of pieces from the dropdown (25-1500)
2. Choose an image (currently using random placeholder images)
3. Click "Start New Puzzle"
4. Use touch or mouse controls to solve the puzzle
5. Pieces will automatically snap when placed near their correct position
6. Progress is shown in the top bar

## Known Limitations (Current Phase)

- Images are loaded from placeholder service (picsum.photos)
- No persistence - puzzle resets on page reload
- Single-player only (multiplayer in Phase 4)
- No mobile-specific UI optimizations yet

## Future Enhancements

- **Phase 3:** Save/load puzzle state, resume capability
- **Phase 4:** Real-time multiplayer with SSE
- **Phase 5:** Custom image upload and management
- **Phase 6:** Performance optimizations for large puzzles (1500 pieces)
- Hint system (show preview, highlight edge pieces)
- Sound effects and animations
- Undo/redo functionality
- Piece rotation (optional difficulty)
- Different difficulty levels (piece shapes, rotation)

## Development Notes

### SFTP Deployment
- **Host:** access-5019433264.webspace-host.com
- **Port:** 22
- **User:** a1407652
- **Path:** /puzzle (to be created)

### Touch Control Implementation
The touch control system uses:
- **Hold Timer:** 300ms delay before activating piece drag
- **Edge Pan Threshold:** 60px from screen edge
- **Edge Pan Speed:** 5px per frame
- **Snap Distance:** 20px for automatic piece snapping

These values can be adjusted in `PuzzleEngine.js` `touchSettings` object.

## License

Private use for 2 users (Rambis.net)

## Author

Development: Claude AI Assistant
Project: Rambis Multiplayer Jigsaw Puzzle
