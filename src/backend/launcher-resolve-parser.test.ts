import { describe, expect, it } from "vitest";

import { parseLauncherResolveOutput } from "./launcher-resolve-parser.js";

describe("parseLauncherResolveOutput (REQ-APP-001, M11 산출물 1)", () => {
  it("resolves a DEFAULT-declared package's two-line success output (spec.md §C.3-①/②)", () => {
    const stdout = "priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\ncom.android.settings/.Settings\n";

    const result = parseLauncherResolveOutput(stdout);

    expect(result).toEqual({ resolved: true, component: "com.android.settings/.Settings" });
  });

  it("resolves a leading-dot relative activity untouched (spec.md §C.3-①, real-device fixture)", () => {
    const stdout =
      "priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\ncom.sec.android.app.popupcalculator/.Calculator\n";

    const result = parseLauncherResolveOutput(stdout);

    expect(result).toEqual({
      resolved: true,
      component: "com.sec.android.app.popupcalculator/.Calculator",
    });
  });

  it("takes the LAST non-empty line even when the component is not a leading-dot form", () => {
    const stdout = "priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\ncom.example.app/com.example.app.MainActivity\n";

    const result = parseLauncherResolveOutput(stdout);

    expect(result).toEqual({
      resolved: true,
      component: "com.example.app/com.example.app.MainActivity",
    });
  });

  it("reports unresolved for the single-line 'No activity found' failure output (spec.md §C.3-②, exit code NOT consulted)", () => {
    const stdout = "No activity found\n";

    const result = parseLauncherResolveOutput(stdout);

    expect(result).toEqual({ resolved: false });
  });

  it("reports unresolved for empty stdout (defensive — not an observed real-device shape)", () => {
    expect(parseLauncherResolveOutput("")).toEqual({ resolved: false });
  });

  it("tolerates surrounding blank lines and trailing whitespace", () => {
    const stdout = "\n  priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true  \n  com.android.settings/.Settings  \n\n";

    const result = parseLauncherResolveOutput(stdout);

    expect(result).toEqual({ resolved: true, component: "com.android.settings/.Settings" });
  });
});
