/**
 * Common Element Schema — the invariant contract originating in
 * SPEC-ANDROID-001 as the shape every UI-recognition backend normalized its
 * raw platform output into.
 *
 * **Its remaining consumer is the web path** (SPEC-WEBVIEW-001). The two
 * native normalizers that used to fill this shape — the Android uiautomator
 * one and the iOS accessibility one — were removed by SPEC-VISION-001 M2
 * (REQ-VISION-002) together with the UI-tree read path above them; native
 * screen reading is screenshot-only now. `normalize/webdom.ts` is the only
 * producer left, and it fills this shape from a page's DOM.
 *
 * This file is deliberately RETAINED rather than removed alongside them
 * (AC-VISION-011): it is the negative control against over-removal —
 * deleting it breaks `tap --web` / `text --web`, which SPEC-VISION-001 is
 * explicitly forbidden from regressing (REQ-VISION-007).
 *
 * @MX:ANCHOR — invariant contract for the web recognition path
 * (`tap --web` / `text --web` selector lookup).
 * @MX:REASON — changing this shape breaks `normalize/webdom.ts` and the
 * `--web` selector lookup above it. Its fan_in fell when M2 removed the two
 * native normalizers, but the remaining consumer belongs to a DIFFERENT
 * SPEC (SPEC-WEBVIEW-001), so a change here reaches outside this SPEC's
 * scope — which is exactly why the anchor stays.
 */

/** Pixel-space bounding rectangle for a UI element, in device coordinates. */
export interface ElementBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Platform-agnostic representation of one UI element.
 *
 * Web DOM mapping — the only mapping with a live producer
 * (`normalize/webdom.ts`, SPEC-WEBVIEW-001 REQ-WEB-NORM-001..004).
 *
 * Android (uiautomator) mapping — REQ-SCHEMA-002, **historical**:
 *   class -> role, resource-id -> id, text/content-desc -> text,
 *   bounds -> bounds, (clickable AND enabled) -> tappable.
 *
 * The iOS accessibility mapping this comment used to document field by
 * field went out with its normalizer in M2; git history holds it.
 * Documenting a mapping whose producer no longer exists sends a reader
 * looking for code that is not there.
 */
export interface CommonElement {
  /** Element's platform role/type (Android `class`, iOS `type`/`role`). */
  role: string;
  /** Visible or accessible label (Android `text`/`content-desc`, iOS `AXLabel`). */
  text: string;
  /** Stable identifier (Android `resource-id`, iOS `AXUniqueId`). */
  id: string;
  /** Bounding rectangle in device pixel coordinates. */
  bounds: ElementBounds;
  /** Whether the element can be tapped (Android `clickable && enabled`). */
  tappable: boolean;
  /** Whether the element is enabled for interaction. */
  enabled: boolean;
  /** Nested child elements, preserving the source hierarchy's tree shape. */
  children: CommonElement[];
}
