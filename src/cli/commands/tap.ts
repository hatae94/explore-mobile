/**
 * `tap <x> <y>` command (REQ-INPUT-001), plus `tap --id <id>` /
 * `tap --text <text>` (+ optional `--index <n>`) element-selector targeting
 * (new capability beyond SPEC-ANDROID-001's original coordinate-only
 * primitives — flagged as a spec-scope note alongside this change).
 *
 * Coordinate mode and selector mode are mutually exclusive: a caller
 * supplying both a coordinate positional AND a selector flag receives a
 * graceful `TARGET_CONFLICT` error rather than an ambiguous silent choice.
 */

import { elementCenter, findElement, type ElementSelector } from "../../normalize/element-query.js";
import { normalizeUiAutomatorXml } from "../../normalize/uiautomator.js";
import type { DeviceBackend } from "../../schema/device-backend.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import type { CommandResult } from "../envelope.js";
import { parseCoordinate, parseIndex } from "../validators.js";
import { errorMessage, type CommandHandler } from "./types.js";
import type { ParsedCommandArgs } from "../args.js";

/**
 * Selector-mode tap: fetches the current UI tree (reusing the same
 * dump + normalize path `dump` uses), finds the element matching
 * `args.id`/`args.selectorText`(+`args.index`), and taps its center.
 * Not-found and invalid-index are graceful `ELEMENT_NOT_FOUND` /
 * `INVALID_INDEX` errors — never a coordinate tap on the wrong element.
 */
async function tapBySelector(args: ParsedCommandArgs, backend: DeviceBackend): Promise<CommandResult> {
  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("tap", target.code, target.message, target.details);

  const index = args.index !== undefined ? parseIndex(args.index) : undefined;
  if (args.index !== undefined && index === undefined) {
    return failure("tap", "INVALID_INDEX", "tap --index requires a non-negative integer.", {
      received: args.index,
    });
  }

  const selector: ElementSelector = {
    ...(args.id !== undefined ? { id: args.id } : {}),
    ...(args.selectorText !== undefined ? { text: args.selectorText } : {}),
    ...(index !== undefined ? { index } : {}),
  };

  let xml: string;
  try {
    xml = await backend.dumpUiHierarchy(target.serial);
  } catch (err) {
    return failure("tap", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  const elements = normalizeUiAutomatorXml(xml);
  const element = findElement(elements, selector);
  if (element === null) {
    return failure("tap", "ELEMENT_NOT_FOUND", "No element matched the given selector.", { selector });
  }

  const { x, y } = elementCenter(element);

  try {
    await backend.tap(target.serial, x, y);
  } catch (err) {
    return failure("tap", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  // Not tappable (clickable && enabled is false) is not fatal — an
  // automation script may still legitimately want to poke a disabled
  // element's location (e.g. to confirm it does NOT respond) — but the
  // caller should know the tap landed on a non-interactive element.
  const warnings = element.tappable
    ? []
    : ["Matched element is not tappable (clickable && enabled is false); tapped its center anyway."];

  return success("tap", {
    serial: target.serial,
    x,
    y,
    selector,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

export const tapCommand: CommandHandler = async (args, backend) => {
  const [xRaw, yRaw] = args.positionals;
  const hasCoords = xRaw !== undefined || yRaw !== undefined;
  const hasSelector = args.id !== undefined || args.selectorText !== undefined;

  if (hasCoords && hasSelector) {
    return failure(
      "tap",
      "TARGET_CONFLICT",
      "tap accepts either coordinates (tap <x> <y>) or a selector (--id/--text), not both.",
    );
  }

  if (hasSelector) {
    return tapBySelector(args, backend);
  }

  const x = xRaw !== undefined ? parseCoordinate(xRaw) : undefined;
  const y = yRaw !== undefined ? parseCoordinate(yRaw) : undefined;

  if (x === undefined || y === undefined) {
    return failure(
      "tap",
      "INVALID_COORDINATES",
      "tap requires two non-negative integer coordinates: tap <x> <y>.",
      { received: { x: xRaw ?? null, y: yRaw ?? null } },
    );
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("tap", target.code, target.message, target.details);

  try {
    await backend.tap(target.serial, x, y);
  } catch (err) {
    return failure("tap", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  return success("tap", { serial: target.serial, x, y });
};
