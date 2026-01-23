# Known Issues

## Open

### Pinch-to-zoom camera drift
**Severity:** Minor
**Version:** 1.2.1
**Description:** When pinch-zooming on mobile, the camera sometimes pans to an unexpected location. The zoom level changes correctly, but the view center shifts. This appears to happen at certain zoom levels or during specific pinch gestures.

**Status:** Partially fixed in v1.2.0 (coordinate system fix). Reduced but not eliminated.

**Debug logging:** Added in v1.2.1 - console logs show pinch start/move/end with all coordinate values. Connect Safari dev tools to mobile device to capture logs when reproducing.

**Files involved:**
- `js/PuzzleEngine.js` - `handleTouchStart()`, `handleTouchMove()` pinch handling

---

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
- `js/PuzzleEngine.js` - `handleTouchStart()`, `handlePointerDown()`, `activatePieceDrag()`

---

## Closed

(none yet)

---

## Version History

| Version | Changes |
|---------|---------|
| 1.3.5 | Puzzle border, improved scattering, piece locking, 40px snap distance |
| 1.3.4 | Tab tips fix, piece outline selection, deselect on background tap |
| 1.3.3 | Piece groups and adjacent snapping |
| 1.3.2 | Image clipping fix for protruding tabs |
| 1.3.1 | Tab direction fix and shape variation |
| 1.3.0 | Classic jigsaw tab shapes |
| 1.2.1 | Pinch-to-zoom debug logging |
| 1.2.0 | Pinch-to-zoom camera drift fix |
