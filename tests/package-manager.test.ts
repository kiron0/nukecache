import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectPackageManagerCaches } from "../src/detectors/package-managers";
import {
  detectPackageManagers,
  parsePackageManager,
} from "../src/project/package-manager";
import type { CommandRunner } from "../src/process/command";
import type { ProjectContext } from "../src/types";

async function project(): Promise<ProjectContext> {
  const root = await mkdtemp(join(tmpdir(), "nukecache-managers-project-"));
  return { cwd: root, root, packageJson: { name: "fixture" } };
}

describe("package-manager detection", () => {
  it("detects lockfile markers and packageManager metadata", async () => {
    const context = await project();
    context.packageJson = { packageManager: "pnpm@10.0.0" };
    await writeFile(join(context.root, "package-lock.json"), "{}");
    await writeFile(join(context.root, "bun.lock"), "");

    await expect(detectPackageManagers(context)).resolves.toEqual([
      "pnpm",
      "npm",
      "bun",
    ]);
    expect(parsePackageManager("yarn@4.6.0")).toBe("yarn");
    expect(parsePackageManager("deno@2")).toBeUndefined();
  });

  it("inspects npm, pnpm, Yarn, and Bun cache locations", async () => {
    const context = await project();
    const cacheRoot = await mkdtemp(
      join(tmpdir(), "nukecache-managers-cache-"),
    );
    const npmRoot = join(cacheRoot, "npm");
    const paths = {
      npm: join(npmRoot, "_cacache"),
      pnpm: join(cacheRoot, "pnpm"),
      yarn: join(cacheRoot, "yarn"),
      bun: join(cacheRoot, "bun"),
    };
    await Promise.all(
      Object.values(paths).map((path) => mkdir(path, { recursive: true })),
    );

    const runner: CommandRunner = (command, args) => {
      if (command === "npm") return Promise.resolve(npmRoot);
      if (command === "pnpm") return Promise.resolve(paths.pnpm);
      if (command === "bun") return Promise.resolve(paths.bun);
      if (args[0] === "--version") return Promise.resolve("4.6.0");
      return Promise.resolve(JSON.stringify(paths.yarn));
    };
    const result = await detectPackageManagerCaches(
      context,
      ["npm", "pnpm", "yarn", "bun"],
      runner,
    );

    expect(result.warnings).toEqual([]);
    expect(result.candidates.map((target) => target.id)).toEqual([
      "npm-cache",
      "pnpm-store",
      "yarn-cache",
      "bun-cache",
    ]);
    expect(result.candidates.every((target) => target.scope === "global")).toBe(
      true,
    );
    expect(result.candidates.every((target) => target.cleanup)).toBe(true);
  });

  it("classifies a project-local Yarn cache as rebuildable", async () => {
    const context = await project();
    const path = join(context.root, ".yarn", "cache");
    await mkdir(path, { recursive: true });
    const runner: CommandRunner = (_command, args) =>
      Promise.resolve(
        args[0] === "--version" ? "4.0.0" : JSON.stringify({ value: path }),
      );

    const result = await detectPackageManagerCaches(context, ["yarn"], runner);
    expect(result.candidates[0]).toMatchObject({
      path: ".yarn/cache",
      scope: "project",
      safety: "rebuild",
    });
  });

  it("reports unavailable managers without failing detection", async () => {
    const context = await project();
    const runner: CommandRunner = () =>
      Promise.reject(new Error("command not found"));
    const result = await detectPackageManagerCaches(context, ["yarn"], runner);
    expect(result.candidates).toEqual([]);
    expect(result.warnings[0]).toMatchObject({ tool: "yarn" });
    expect(result.warnings[0]?.message).toContain("command not found");
  });
});
