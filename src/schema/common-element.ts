/**
 * Common Element Schema — the invariant contract of SPEC-ANDROID-001.
 *
 * Every UI-recognition backend (Android/uiautomator today, iOS/idb in a
 * future SPEC — see spec.md §D "Out of Scope — iOS/idb Implementation")
 * normalizes its raw platform output into this shape. This is the load-
 * bearing design artifact of the SPEC: it must accept the iOS accessibility
 * field set (AXLabel, AXUniqueId, frame, type/role) without redesign.
 *
 * @MX:ANCHOR — invariant contract, high fan_in (every recognition path —
 * `dump`, future backends, the Claude skill wrapper — depends on this shape
 * remaining stable). See spec.md §A.3 and plan.md §F.9 (iOS field mapping
 * table) / §F.9.1 (tappable derivation policy for iOS).
 * @MX:REASON — changing this shape is a breaking change across every
 * consumer (normalization layer, CLI `dump` command, future iOS backend).
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
 * iOS (idb accessibility) mapping — plan.md §F.9 (design-only, AC-ANDROID-006):
 *   type/role -> role, AXLabel -> text, AXUniqueId -> id, frame -> bounds,
 *   derived(AXTraits, isEnabled) -> tappable (see plan.md §F.9.1).
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
