import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { executeCleanup } from "../src/cleanup/executor";
import { createCleanupPlan } from "../src/cleanup/planner";
import { detectCaches } from "../src/detect";
import { assertSafeProjectTarget } from "../src/filesystem/safety";
import type { CacheTarget } from "../src/types";

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nukecache-clean-"));
  await writeFile(join(root, "package.json"), '{"name":"fixture"}');
  return root;
}

describe("cleanup", () => {
  it("plans and removes safe detected caches", async () => {
    const root = await project();
    const cache = join(root, ".next", "cache");
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, "entry"), "cached");

    const detection = await detectCaches({ cwd: root });
    const plan = createCleanupPlan(root, detection.targets);
    const result = await executeCleanup(plan);

    expect(result.removed).toHaveLength(1);
    expect(result.bytesFreed).toBeGreaterThan(0);
    await expect(lstat(cache)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("skips tracked and non-safe targets", () => {
    const target = fixtureTarget({ trackedByGit: true });
    const tracked = createCleanupPlan("/tmp/project", [target]);
    expect(tracked.items[0]).toMatchObject({
      action: "skip",
      reason: "Tracked by Git",
    });

    const rebuild = createCleanupPlan("/tmp/project", [
      fixtureTarget({ trackedByGit: false, safety: "rebuild" }),
    ]);
    expect(rebuild.items[0]).toMatchObject({
      action: "skip",
      reason: "Safety level is rebuild",
    });

    const notSelected = createCleanupPlan("/tmp/project", [fixtureTarget({})], {
      selectedIds: [],
    });
    expect(notSelected.items[0]).toMatchObject({
      action: "skip",
      reason: "Not selected",
    });

    const global = createCleanupPlan("/tmp/project", [
      fixtureTarget({ scope: "global" }),
    ]);
    expect(global.items[0]).toMatchObject({
      action: "skip",
      reason: "Global cleanup not enabled",
    });
  });

  it("requires explicit allowances for rebuildable and global targets", () => {
    const rebuild = createCleanupPlan(
      "/tmp/project",
      [fixtureTarget({ safety: "rebuild" })],
      { allowRebuild: true },
    );
    expect(rebuild.items[0]?.action).toBe("remove");

    const cleanup = {
      kind: "command" as const,
      command: "npm" as const,
      args: ["cache", "clean", "--force", "--cache=/tmp/npm-cache"],
      cwd: "/tmp/project",
    };
    const global = createCleanupPlan(
      "/tmp/project",
      [
        fixtureTarget({
          scope: "global",
          safety: "global",
          tool: "npm",
          absolutePath: "/tmp/npm-cache/_cacache",
          cleanup,
        }),
      ],
      { allowGlobal: true },
    );
    expect(global.items[0]?.action).toBe("remove");
  });

  it("reports skips and independent deletion failures", async () => {
    const root = await project();
    const protectedPath = join(root, "src");
    await mkdir(protectedPath);
    const plan = createCleanupPlan(root, [
      fixtureTarget({
        id: "protected",
        path: "src",
        absolutePath: protectedPath,
      }),
      fixtureTarget({ id: "skipped", path: ".other", trackedByGit: true }),
    ]);

    const result = await executeCleanup(plan);
    expect(result.failed[0]?.error).toContain("Protected project path");
    expect(result.skipped[0]?.reason).toBe("Tracked by Git");
  });

  it("uses allowlisted native cleanup for global caches", async () => {
    const root = await project();
    const npmRoot = await mkdtemp(join(tmpdir(), "nukecache-npm-cache-"));
    const cache = join(npmRoot, "_cacache");
    await mkdir(cache);
    await writeFile(join(cache, "entry"), "cached");
    const target = fixtureTarget({
      id: "npm-cache",
      name: "npm cache",
      path: cache,
      absolutePath: cache,
      scope: "global",
      safety: "global",
      tool: "npm",
      size: 6,
      cleanup: {
        kind: "command",
        command: "npm",
        args: ["cache", "clean", "--force", `--cache=${npmRoot}`],
        cwd: root,
      },
    });
    const plan = createCleanupPlan(root, [target], { allowGlobal: true });
    const result = await executeCleanup(plan, {
      commandRunner: async (command, args) => {
        expect(command).toBe("npm");
        expect(args).toContain("--force");
        await rm(cache, { recursive: true });
        return "";
      },
    });

    expect(result.failed).toEqual([]);
    expect(result.bytesFreed).toBe(6);
  });

  it("rejects native cleanup commands outside the allowlist", async () => {
    const root = await project();
    const cache = join(root, ".cache");
    await mkdir(cache);
    const target = fixtureTarget({
      absolutePath: cache,
      tool: "npm",
      cleanup: {
        kind: "command",
        command: "npm",
        args: ["exec", "something"],
        cwd: root,
      },
    });
    const result = await executeCleanup(createCleanupPlan(root, [target]), {
      commandRunner: () => Promise.resolve(""),
    });
    expect(result.failed[0]?.error).toContain("Unsupported native cleanup");
  });

  it("allows Bun cleanup from its package-aware fallback directory", async () => {
    const root = await project();
    const fallbackCwd = await mkdtemp(join(tmpdir(), "nukecache-bun-cwd-"));
    const cache = await mkdtemp(join(tmpdir(), "nukecache-bun-cache-"));
    const target = fixtureTarget({
      id: "bun-cache",
      path: cache,
      absolutePath: cache,
      scope: "global",
      safety: "global",
      tool: "bun",
      cleanup: {
        kind: "command",
        command: "bun",
        args: ["pm", "cache", "rm"],
        cwd: fallbackCwd,
      },
    });
    const runner = vi.fn(() => Promise.resolve(""));

    const result = await executeCleanup(
      createCleanupPlan(root, [target], { allowGlobal: true }),
      { commandRunner: runner },
    );

    expect(result.failed).toEqual([]);
    expect(runner).toHaveBeenCalledWith("bun", ["pm", "cache", "rm"], {
      cwd: fallbackCwd,
      timeout: 600_000,
    });
  });

  it("removes a symlink itself without touching its destination", async () => {
    const root = await project();
    const outside = await mkdtemp(join(tmpdir(), "nukecache-destination-"));
    await writeFile(join(outside, "valuable.txt"), "keep");
    const link = join(root, ".custom-cache");
    await symlink(outside, link);

    const detection = await detectCaches({
      cwd: root,
      config: { include: [".custom-cache"] },
    });
    const result = await executeCleanup(
      createCleanupPlan(root, detection.targets),
    );

    expect(result.removed).toHaveLength(1);
    expect(await readFile(join(outside, "valuable.txt"), "utf8")).toBe("keep");
    await expect(lstat(link)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks targets reached through a symlinked parent", async () => {
    const root = await project();
    const outside = await mkdtemp(join(tmpdir(), "nukecache-parent-link-"));
    await mkdir(join(outside, "cache"));
    await symlink(outside, join(root, "linked"));

    await expect(
      assertSafeProjectTarget(root, join(root, "linked", "cache")),
    ).rejects.toThrow("outside project boundary");
  });

  it("blocks source and project-root deletion", async () => {
    const root = await project();
    await mkdir(join(root, "src"));
    await expect(assertSafeProjectTarget(root, root)).rejects.toThrow(
      "Unsafe cleanup path",
    );
    await expect(
      assertSafeProjectTarget(root, join(root, "src")),
    ).rejects.toThrow("Protected project path");
    for (const name of [
      ".env.test",
      ".ENV.LOCAL",
      "bun.lock",
      "PACKAGE.JSON",
      "app.sqlite3",
    ]) {
      await writeFile(join(root, name), "protected");
      await expect(
        assertSafeProjectTarget(root, join(root, name)),
      ).rejects.toThrow("Protected project path");
    }
  });

  it("handles cleanup failure gracefully and reports failed item", async () => {
    const root = await project();
    const badTarget: CacheTarget = {
      ...fixtureTarget({}),
      id: "unremovable",
      path: "protected-file",
      absolutePath: join(root, "protected-file"),
    };
    await writeFile(badTarget.absolutePath, "content");
    // Make target throw on assertSafeProjectTarget by pointing to project root
    const plan = createCleanupPlan(root, [
      { ...badTarget, absolutePath: root },
    ]);
    const result = await executeCleanup(plan);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe("unremovable");
    expect(result.bytesFreed).toBe(0);
  });
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
    createdAt: Date.now(),
    size: 10,
    modifiedAt: Date.now(),
    trackedByGit: false,
    symlink: false,
    exists: true,
    ...overrides,
  };
}
