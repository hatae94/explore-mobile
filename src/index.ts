/**
 * Public library entry point for SPEC-ANDROID-001.
 *
 * Exposes the common element schema (M1), the device-backend interface
 * (M1), and the uiautomator normalization pure function (M2). The CLI
 * command surface (`doctor`/`devices`/`launch`/.../`dump`) and concrete
 * backend implementations (adb subprocess wrapper) land in later
 * milestones (M3+) of this SPEC and are intentionally not exported here.
 */

export type { CommonElement, ElementBounds } from "./schema/common-element.js";
export type {
  DeviceBackend,
  DeviceConnectionState,
  DeviceInfo,
} from "./schema/device-backend.js";
export { normalizeUiAutomatorXml } from "./normalize/uiautomator.js";
