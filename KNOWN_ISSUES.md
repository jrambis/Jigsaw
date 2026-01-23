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

## Closed

(none yet)
