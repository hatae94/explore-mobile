/**
 * Common Element Schema — the invariant contract originating in
 * SPEC-ANDROID-001, now fulfilled by SPEC-IOS-001's iOS/idb backend.
 *
 * Every UI-recognition backend (Android/uiautomator, iOS/idb) normalizes its
 * raw platform output into this shape. This is the load-bearing design
 * artifact shared across backends: it accepts the iOS accessibility field
 * set (AXLabel, AXUniqueId, frame, type/role) WITHOUT redesign, exactly as
 * SPEC-ANDROID-001 intended (REQ-IOS-SCHEMA-005 — the shape is unchanged by
 * SPEC-IOS-001; only the doc-comment below is corrected).
 *
 * @MX:ANCHOR — invariant contract, high fan_in (every recognition path —
 * `dump`, both backends, the Claude skill wrapper — depends on this shape
 * remaining stable). See spec.md §A.3/§A.4 and plan.md §F.9 (iOS field
 * mapping table, verified) / §F.9.1 (tappable derivation policy for iOS).
 * @MX:REASON — changing this shape is a breaking change across every
 * consumer (both backends' normalizers, CLI `dump`/`tap`/`text` commands).
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
 * Android (uiautomator) mapping — REQ-SCHEMA-002:
 *   class -> role, resource-id -> id, text/content-desc -> text,
 *   bounds -> bounds, (clickable AND enabled) -> tappable.
 *
 * @MX:NOTE — the iOS mapping doc-comment below was corrected (D5,
 * spec.md §F) against idb's real `describe-all` JSON output: the original
 * SPEC-ANDROID-001 assumptions (`AXTraits`-based tappable, `isEnabled`
 * field name, `AC-ANDROID-006 design-only` reference) were wrong and are
 * replaced with the verified mapping below. The `CommonElement` shape
 * itself is unchanged (REQ-IOS-SCHEMA-005) — only this comment is fixed.
 *
 * iOS (idb accessibility) mapping — implemented, SPEC-IOS-001 plan.md
 * §F.9/§F.9.1 (verified against idb's real `describe-all` JSON output;
 * corrects the original design-only assumptions):
 *   type -> role (primary; `role` as an AX-prefixed fallback), AXLabel ->
 *   text, AXUniqueId -> id, frame{x,y,width,height} -> bounds, enabled ->
 *   enabled (the field is named `enabled`, NOT `isEnabled`), tappable is
 *   derived from (type/role/subrole indicates interactive, OR
 *   custom_actions is non-empty) AND enabled === true — idb's real output
 *   has NO `AXTraits` field, so tappable derivation does not depend on it
 *   (see `src/normalize/idb.ts`).
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
