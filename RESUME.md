# Resume Development

Use this prompt when starting a new Claude Code session on this project.

---

## Resume Prompt

```
Multiplayer Jigsaw Puzzle - Resuming Development

Current version: v1.3.5
Branch: claude/add-touch-controls-4GPXy

Recently completed (v1.3.x):
- Classic jigsaw piece shapes with varied tabs
- Piece groups (connected pieces move together)
- Adjacent piece snapping (pieces snap to neighbors)
- Puzzle border showing target area
- Shuffled piece scattering within bounds
- Piece locking when snapped to final position
- 40px snap distance

Key files:
- js/PuzzleEngine.js - Rendering, interaction, camera, snapping, groups
- js/PuzzleCutter.js - Image cutting, piece generation, scatter logic
- js/main.js - App initialization, UI
- index.html - Layout and controls

Next phases to consider:
- Phase 3: PHP Persistence (save/load puzzle state)
- Phase 4: Multiplayer SSE sync
- UX improvements (mouse controls require Alt+drag, feels clunky)

Known issues (see KNOWN_ISSUES.md):
- Pinch-to-zoom camera drift (minor)
- UX review needed for piece selection controls

Hosting: Ionos PHP shared hosting at Rambis.net/puzzle
```

---

## Project Status

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Core Engine | Complete | PuzzleCutter, PuzzleEngine, rendering |
| 2. Touch Controls | Complete | Hold-drag, edge pan, pinch zoom |
| 3. PHP Persistence | Planned | Save/load puzzle state to JSON |
| 4. Multiplayer SSE | Planned | Real-time sync between 2 users |
| 5. Image Upload | Planned | Admin interface for puzzle images |
| 6. Performance | Planned | Optimize for 1500 pieces |

---

## Quick Reference

### Controls
- **Touch:** Tap=pan, Hold+drag=move piece, Pinch=zoom
- **Mouse:** Drag=pan, Alt+drag=move piece, Shift+drag=select, Wheel=zoom

### Testing
- Use 4-piece puzzle option for quick testing
- Check browser console for debug output (especially pinch-zoom logs)

### Deployment
- Push to branch triggers GitHub Actions deploy to Rambis.net/puzzle
- See DEPLOYMENT.md for details
