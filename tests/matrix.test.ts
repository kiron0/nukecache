import { describe, expect, it } from "vitest";

import { createCleanupPlan } from "../src/cleanup/planner";
import { parseCliArgs } from "../src/cli/args";
import { formatAge, formatBytes } from "../src/output";
import {
  isPackageManager,
  parsePackageManager,
} from "../src/project/package-manager";
import type { CacheSafety, CacheTarget } from "../src/types";
import { compareVersions } from "../src/update";

describe("formatting matrix", () => {
  const byteCases: Array<[number, string]> = [
    [0, "0 B"],
    [1, "1 B"],
    [512, "512 B"],
    [999, "999 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [2048, "2.0 KB"],
    [10 * 1024, "10.0 KB"],
    [1024 ** 2 - 1, "1024.0 KB"],
    [1024 ** 2, "1.0 MB"],
    [1.5 * 1024 ** 2, "1.5 MB"],
    [100 * 1024 ** 2, "100.0 MB"],
    [1024 ** 3, "1.0 GB"],
    [2.25 * 1024 ** 3, "2.3 GB"],
    [999 * 1024 ** 3, "999.0 GB"],
    [1024 ** 4, "1.0 TB"],
    [1.5 * 1024 ** 4, "1.5 TB"],
    [1024 ** 5, "1024.0 TB"],
    [Number.MAX_SAFE_INTEGER, "8192.0 TB"],
  ];

  it.each(byteCases)("formats %s bytes", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    -1024,
  ])("rejects invalid byte count %s", (bytes) => {
    expect(() => formatBytes(bytes)).toThrow(RangeError);
  });

  const now = Date.UTC(2026, 0, 1);
  const ageCases: Array<[number, string]> = [
    [now + 1, "now"],
    [now, "now"],
    [now - 999, "now"],
    [now - 59_999, "now"],
    [now - 60_000, "1m ago"],
    [now - 119_999, "1m ago"],
    [now - 2 * 60_000, "2m ago"],
    [now - 59 * 60_000, "59m ago"],
    [now - 60 * 60_000, "1h ago"],
    [now - 119 * 60_000, "1h ago"],
    [now - 23 * 60 * 60_000, "23h ago"],
    [now - 24 * 60 * 60_000, "1d ago"],
    [now - 47 * 60 * 60_000, "1d ago"],
    [now - 48 * 60 * 60_000, "2d ago"],
    [now - 30 * 24 * 60 * 60_000, "30d ago"],
  ];

  it.each(ageCases)("formats age %s", (timestamp, expected) => {
    expect(formatAge(timestamp, now)).toBe(expected);
  });
});

describe("semantic version matrix", () => {
  const cases: Array<[string, string, number]> = [
    ["0.0.0", "0.0.0", 0],
    ["0.0.1", "0.0.0", 1],
    ["0.0.0", "0.0.1", -1],
    ["0.1.0", "0.0.9", 1],
    ["0.0.9", "0.1.0", -1],
    ["1.0.0", "0.99.99", 1],
    ["0.99.99", "1.0.0", -1],
    ["2.3.4", "2.3.3", 1],
    ["2.3.3", "2.3.4", -1],
    ["10.0.0", "9.99.99", 1],
    ["v1.2.3", "1.2.3", 0],
    ["1.2.3+build.1", "1.2.3+build.2", 0],
    ["1.0.0", "1.0.0-alpha", 1],
    ["1.0.0-alpha", "1.0.0", -1],
    ["1.0.0-alpha", "1.0.0-alpha", 0],
    ["1.0.0-alpha", "1.0.0-beta", -1],
    ["1.0.0-beta", "1.0.0-alpha", 1],
    ["1.0.0-alpha.1", "1.0.0-alpha", 1],
    ["1.0.0-alpha", "1.0.0-alpha.1", -1],
    ["1.0.0-alpha.1", "1.0.0-alpha.2", -1],
    ["1.0.0-alpha.2", "1.0.0-alpha.10", -1],
    ["1.0.0-alpha.10", "1.0.0-alpha.2", 1],
    ["1.0.0-alpha.1", "1.0.0-alpha.beta", -1],
    ["1.0.0-alpha.beta", "1.0.0-beta", -1],
    ["1.0.0-beta", "1.0.0-beta.2", -1],
    ["1.0.0-beta.2", "1.0.0-beta.11", -1],
    ["1.0.0-beta.11", "1.0.0-rc.1", -1],
    ["1.0.0-rc.1", "1.0.0", -1],
    ["1.0.0-1", "1.0.0-alpha", -1],
    ["1.0.0-alpha", "1.0.0-1", 1],
    ["1.0.0-a.1", "1.0.0-a.1", 0],
    ["1.0.0-a.1+one", "1.0.0-a.1+two", 0],
    ["100.200.300", "100.200.299", 1],
    ["100.199.999", "100.200.0", -1],
    ["3.0.0", "2.999.999", 1],
    ["1.10.0", "1.9.9", 1],
    ["1.9.9", "1.10.0", -1],
    ["1.0.10", "1.0.9", 1],
    ["1.0.9", "1.0.10", -1],
    ["invalid", "1.0.0", 0],
    ["1.0.0", "invalid", 0],
    ["1.0", "1.0.0", 0],
    ["", "1.0.0", 0],
    ["1.0.0.0", "1.0.0", 0],
    ["1.0.0-", "1.0.0", 0],
    ["1.0.0+", "1.0.0", 0],
    ["1.0.0_rc", "1.0.0", 0],
    ["version-1.0.0", "1.0.0", 0],
    [" 1.0.0", "1.0.0", 0],
    ["1.0.0 ", "1.0.0", 0],
  ];

  it.each(cases)("compares %s with %s", (left, right, expected) => {
    expect(Math.sign(compareVersions(left, right))).toBe(expected);
  });
});

describe("package manager matrix", () => {
  const cases: Array<[unknown, string | undefined]> = [
    ["npm", "npm"],
    ["npm@10.0.0", "npm"],
    ["pnpm", "pnpm"],
    ["pnpm@9.1.0", "pnpm"],
    ["yarn", "yarn"],
    ["yarn@4.0.0", "yarn"],
    ["bun", "bun"],
    ["bun@1.2.0", "bun"],
    ["deno", undefined],
    ["npx", undefined],
    ["NPM", undefined],
    ["npm@", "npm"],
    ["@npm", undefined],
    ["", undefined],
    [" ", undefined],
    ["npm @1", undefined],
    [null, undefined],
    [undefined, undefined],
    [42, undefined],
    [{ name: "npm" }, undefined],
  ];

  it.each(cases)("parses package manager %j", (value, expected) => {
    expect(parsePackageManager(value)).toBe(expected);
    if (typeof value === "string" && !value.includes("@")) {
      expect(isPackageManager(value)).toBe(expected !== undefined);
    }
  });
});

describe("CLI argument matrix", () => {
  const validCases: Array<[string[], Record<string, unknown>]> = [
    [[], { command: "clean" }],
    [["clean"], { command: "clean" }],
    [["list"], { command: "list" }],
    [["largest"], { command: "largest" }],
    [["largest", "--limit", "1"], { limit: 1 }],
    [["largest", "--limit", "999"], { limit: 999 }],
    [["old"], { command: "old" }],
    [["old", "--days", "1"], { days: 1 }],
    [["old", "--days", "365"], { days: 365 }],
    [["explain", "vite"], { explainTarget: "vite" }],
    [["explain", ".next/cache"], { explainTarget: ".next/cache" }],
    [["explain", "npm"], { manager: "npm", global: true }],
    [["npm"], { manager: "npm", global: true }],
    [["pnpm"], { manager: "pnpm", global: true }],
    [["yarn"], { manager: "yarn", global: true }],
    [["bun"], { manager: "bun", global: true }],
    [["--all"], { all: true, safe: true }],
    [["--cwd", "/tmp/project"], { cwd: "/tmp/project" }],
    [["--dry-run"], { dryRun: true }],
    [["--force"], { force: true }],
    [["--global"], { global: true }],
    [["--help"], { help: true }],
    [["-h"], { help: true }],
    [["--ignore", "vite"], { ignore: ["vite"] }],
    [["--ignore", "vite", "--ignore", "turbo"], { ignore: ["vite", "turbo"] }],
    [["list", "--json"], { json: true }],
    [["--no-update-check"], { noUpdateCheck: true }],
    [["list", "--project"], { project: true }],
    [["clean", "--safe"], { safe: true }],
    [["clean", "--safe", "--yes"], { safe: true, yes: true }],
    [["clean", "--all", "--yes"], { all: true, yes: true }],
    [["clean", "--force", "--yes"], { force: true, yes: true }],
    [["--version"], { version: true }],
    [["-v"], { version: true }],
    [
      ["list", "--global", "--project", "--json"],
      { global: true, project: true, json: true },
    ],
  ];

  it.each(validCases)("parses %j", (argv, expected) => {
    expect(parseCliArgs(argv)).toMatchObject(expected);
  });

  const invalidCases: Array<[string[], string]> = [
    [["wat"], "Unknown option"],
    [["--wat"], "Unknown option"],
    [["list", "clean"], "Unexpected command"],
    [["clean", "list"], "Unexpected command"],
    [["largest", "old"], "Unexpected command"],
    [["explain"], "explain requires"],
    [["explain", "vite", "turbo"], "Unexpected target"],
    [["--cwd"], "Missing value"],
    [["--cwd", "--json"], "Missing value"],
    [["--ignore"], "Missing value"],
    [["--ignore", "--force"], "Missing value"],
    [["largest", "--limit"], "Missing value"],
    [["largest", "--limit", "0"], "positive integer"],
    [["largest", "--limit", "-1"], "Missing value"],
    [["largest", "--limit", "1.5"], "positive integer"],
    [["largest", "--limit", "NaN"], "positive integer"],
    [["list", "--limit", "5"], "--limit requires"],
    [["old", "--days"], "Missing value"],
    [["old", "--days", "0"], "positive integer"],
    [["old", "--days", "1.1"], "positive integer"],
    [["old", "--days", "Infinity"], "positive integer"],
    [["list", "--days", "3"], "--days requires"],
    [["list", "--dry-run"], "does not accept cleanup flags"],
    [["list", "--yes"], "does not accept cleanup flags"],
    [["list", "--all"], "does not accept cleanup flags"],
    [["list", "--safe"], "does not accept cleanup flags"],
    [["list", "--force"], "does not accept cleanup flags"],
    [["largest", "--force"], "does not accept cleanup flags"],
    [["old", "--safe"], "does not accept cleanup flags"],
    [["explain", "vite", "--yes"], "does not accept cleanup flags"],
    [["clean", "--yes"], "--yes requires"],
    [["clean", "--global", "--safe", "--yes"], "requires --force"],
    [["npm", "--project"], "cannot be combined"],
    [["npm", "pnpm"], "Unexpected package manager"],
    [["clean", "clean"], "Unexpected command"],
  ];

  it.each(invalidCases)("rejects %j", (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(message);
  });
});

describe("cleanup planner matrix", () => {
  const safetyLevels: CacheSafety[] = [
    "safe",
    "rebuild",
    "reinstall",
    "global",
    "dangerous",
  ];
  const projectCases = safetyLevels.flatMap((safety) =>
    [false, true].flatMap((allowRebuild) =>
      [false, true].map((tracked) => [safety, allowRebuild, tracked] as const),
    ),
  );

  it.each(projectCases)(
    "plans project safety=%s allowRebuild=%s tracked=%s",
    (safety, allowRebuild, tracked) => {
      const target = fixtureTarget({ safety, trackedByGit: tracked });
      const plan = createCleanupPlan("/tmp/project", [target], {
        allowRebuild,
      });
      const removable =
        !tracked &&
        (safety === "safe" || (safety === "rebuild" && allowRebuild));
      expect(plan.items[0]?.action).toBe(removable ? "remove" : "skip");
      expect(plan.estimatedBytes).toBe(removable ? target.size : 0);
    },
  );

  const globalCases = [false, true].flatMap((allowGlobal) =>
    [false, true].flatMap((tracked) =>
      [false, true].map(
        (hasCleanup) => [allowGlobal, tracked, hasCleanup] as const,
      ),
    ),
  );

  it.each(globalCases)(
    "plans global allow=%s tracked=%s cleanup=%s",
    (allowGlobal, tracked, hasCleanup) => {
      const target = fixtureTarget({
        scope: "global",
        safety: "global",
        trackedByGit: tracked,
        ...(hasCleanup
          ? {
              cleanup: {
                kind: "command" as const,
                command: "npm" as const,
                args: ["cache", "clean", "--force", "--cache=/tmp/npm-cache"],
                cwd: "/tmp/project",
              },
            }
          : {}),
      });
      const plan = createCleanupPlan("/tmp/project", [target], {
        allowGlobal,
      });
      expect(plan.items[0]?.action).toBe(
        allowGlobal && !tracked && hasCleanup ? "remove" : "skip",
      );
    },
  );

  it.each(["fixture", "other", "", "FIXTURE", " fixture "])(
    "uses exact selected ID %j",
    (selectedId) => {
      const action = createCleanupPlan("/tmp/project", [fixtureTarget({})], {
        selectedIds: [selectedId],
      }).items[0]?.action;
      expect(action).toBe(selectedId === "fixture" ? "remove" : "skip");
    },
  );
});

function fixtureTarget(overrides: Partial<CacheTarget>): CacheTarget {
  return {
    id: "fixture",
    name: "Fixture",
    path: ".cache",
    absolutePath: "/tmp/project/.cache",
    scope: "project",
    safety: "safe",
    tool: "fixture",
    description: "Fixture cache",
    consequences: [],
    createdAt: 1,
    size: 10,
    modifiedAt: 1,
    trackedByGit: false,
    symlink: false,
    exists: true,
    ...overrides,
  };
}
