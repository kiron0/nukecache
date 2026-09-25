import { describe, expect, it } from "vitest";

import * as nukecache from "../src/index";

describe("public API entrypoint (src/index.ts)", () => {
  it("exports all core detection, inspection, and cleanup functions", () => {
    expect(typeof nukecache.detectCaches).toBe("function");
    expect(Array.isArray(nukecache.builtInDetectors)).toBe(true);
    expect(typeof nukecache.createCleanupPlan).toBe("function");
    expect(typeof nukecache.executeCleanup).toBe("function");
    expect(typeof nukecache.detectPackageManagerCaches).toBe("function");
    expect(typeof nukecache.calculateSize).toBe("function");
    expect(typeof nukecache.assertSafeProjectTarget).toBe("function");
    expect(typeof nukecache.findProjectRoot).toBe("function");
    expect(typeof nukecache.createProjectContext).toBe("function");
    expect(typeof nukecache.configPath).toBe("function");
    expect(typeof nukecache.loadConfig).toBe("function");
    expect(typeof nukecache.saveConfig).toBe("function");
    expect(typeof nukecache.detectPackageManagers).toBe("function");
    expect(typeof nukecache.isPackageManager).toBe("function");
    expect(typeof nukecache.parsePackageManager).toBe("function");
    expect(typeof nukecache.formatBytes).toBe("function");
    expect(typeof nukecache.formatList).toBe("function");
    expect(typeof nukecache.formatPlan).toBe("function");
    expect(typeof nukecache.formatResult).toBe("function");
    expect(typeof nukecache.formatTarget).toBe("function");
    expect(typeof nukecache.formatWarnings).toBe("function");
  });
});
