# Known Issues

## Open

### Piece selection/deselection UX review
**Severity:** UX Review
**Version:** 1.3.4
**Description:** Current behavior: tap/click on background deselects pieces; hold-drag on piece selects and moves it (touch); alt+drag moves pieces (mouse). Need to review if this is the ideal UX for piece selection/deselection across touch and mouse interactions.

**Considerations:**
- Should tapping a piece select it without moving?
- Should there be a way to select multiple pieces without shift+drag?
- Is the hold delay (300ms) the right timing for touch?
- Mouse controls feel clunky compared to touch (requiring Alt+drag)

**Files involved:**
- `js/PuzzleEngine.js` - `onHammerPress()`, `onHammerPanStart()`, `activatePieceDrag()`

---

## Closed

### Pinch-to-zoom camera drift (FIXED)
**Severity:** Minor
**Version:** 1.2.1 → Fixed in 1.4.0
**Description:** When pinch-zooming on mobile, the camera sometimes panned to an unexpected location due to cumulative floating-point errors in delta-based calculations.

**Resolution:** Replaced custom touch handling with Hammer.js gesture library. The new implementation captures world coordinates at pinch start and recalculates camera position from scratch on each frame, eliminating drift from accumulated errors.

**Files involved:**
- `js/PuzzleEngine.js` - Replaced `handleTouchStart()`, `handleTouchMove()`, `handleTouchEnd()` with Hammer.js handlers
- `index.html` - Added Hammer.js CDN dependency

---

## Version History

| Version | Changes |
|---------|---------|
| 1.4.0 | Hammer.js integration, pinch-to-zoom drift fix |
| 1.3.5 | Puzzle border, improved scattering, piece locking, 40px snap distance |
| 1.3.4 | Tab tips fix, piece outline selection, deselect on background tap |
| 1.3.3 | Piece groups and adjacent snapping |
| 1.3.2 | Image clipping fix for protruding tabs |
| 1.3.1 | Tab direction fix and shape variation |
| 1.3.0 | Classic jigsaw tab shapes |
| 1.2.1 | Pinch-to-zoom debug logging |
| 1.2.0 | Pinch-to-zoom camera drift fix |
