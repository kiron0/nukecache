import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectCaches } from "../src/detect";
import { findProjectRoot } from "../src/project/root";

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nukecache-detect-"));
  await writeFile(join(root, "package.json"), '{"name":"fixture"}');
  return root;
}

describe("project detection", () => {
  it("finds project root from a nested directory", async () => {
    const root = await project();
    const nested = join(root, "packages", "app");
    await mkdir(nested, { recursive: true });
    expect(await findProjectRoot(nested)).toBe(root);
  });

  it("detects supported caches and removes nested overlaps", async () => {
    const root = await project();
    await mkdir(join(root, ".next", "cache"), { recursive: true });
    await writeFile(join(root, ".next", "cache", "data.bin"), "next-cache");
    await mkdir(join(root, "node_modules", ".cache", "turbo"), {
      recursive: true,
    });
    await mkdir(join(root, "node_modules", ".vite"), { recursive: true });
    await writeFile(join(root, "tsconfig.tsbuildinfo"), "typescript-cache");

    const result = await detectCaches({ cwd: root });
    const paths = result.targets.map((target) => target.path);

    expect(paths).toContain(".next/cache");
    expect(paths).toContain("node_modules/.cache");
    expect(paths).not.toContain("node_modules/.cache/turbo");
    expect(paths).toContain("node_modules/.vite");
    expect(paths).toContain("tsconfig.tsbuildinfo");
    expect(result.targets.every((target) => target.size > 0)).toBe(true);
  });

  it("loads custom config, includes paths, and applies ignore rules", async () => {
    const root = await project();
    await mkdir(join(root, ".custom-cache"));
    await mkdir(join(root, ".manual-cache"));
    await writeFile(
      join(root, "nukecache.config.json"),
      JSON.stringify({
        ignore: ["custom-tool"],
        include: [".manual-cache"],
        custom: [
          { id: "custom-tool", name: "Custom Tool", paths: [".custom-cache"] },
        ],
      }),
    );

    const result = await detectCaches({ cwd: root });
    expect(result.targets.map((target) => target.path)).toEqual([
      ".manual-cache",
    ]);
  });

  it("rejects custom paths escaping the project", async () => {
    const root = await project();
    await expect(
      detectCaches({ cwd: root, config: { include: ["../outside"] } }),
    ).rejects.toThrow("escapes project boundary");
  });

  it("does not follow symlink directories while searching TypeScript caches", async () => {
    const root = await project();
    const outside = await mkdtemp(join(tmpdir(), "nukecache-outside-"));
    await writeFile(join(outside, "outside.tsbuildinfo"), "outside");
    await symlink(outside, join(root, "linked"));

    const result = await detectCaches({ cwd: root });
    expect(result.targets).toHaveLength(0);
  });
});
