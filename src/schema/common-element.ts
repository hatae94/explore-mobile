/**
 * Common Element Schema — the invariant contract originating in
 * SPEC-ANDROID-001 as the shape every UI-recognition backend normalized its
 * raw platform output into.
 *
 * **This shape no longer has a producing normalizer.** The two native ones
 * (Android uiautomator, iOS accessibility) were removed by SPEC-VISION-001 M2
 * (REQ-VISION-002) with the UI-tree read path above them, and the web DOM one
 * (`normalize/webdom.ts`) went with SPEC-WEBVIEW-002. Screen reading is
 * screenshot-only on every platform now.
 *
 * What still references the type: `cli/commands/scroll-geometry.ts`
 * (`deriveScreenSize`) and this module's re-export from
 * `schema/device-backend.ts`, plus the public `src/index.ts` export.
 *
 * @MX:DEBT — `deriveScreenSize` has **no production caller**: `scroll` reads
 * the screen size from `backend.getScreenSize` (SPEC-VISION-001 M1 reversed
 * the dump-derived approach), and the only remaining call site is a test
 * fixture helper. The type therefore survives on a dead path plus a public
 * export.
 * @MX:CEILING — harmless while `src/index.ts` still exports the type as
 * public API; removing it would be a breaking change for consumers.
 * @MX:UPGRADE — revisit together with `scroll-geometry.ts` when a SPEC takes
 * up the public-API surface; SPEC-WEBVIEW-002 deliberately left both in place
 * (scope discipline — this dead path predates it).
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
 * Android (uiautomator) mapping — REQ-SCHEMA-002, **historical**:
 *   class -> role, resource-id -> id, text/content-desc -> text,
 *   bounds -> bounds, (clickable AND enabled) -> tappable.
 *
 * The iOS accessibility mapping (M2) and the web DOM mapping
 * (SPEC-WEBVIEW-002) both went out with their normalizers; git history holds
 * them. Documenting a mapping whose producer no longer exists sends a reader
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
