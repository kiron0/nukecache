import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { slug } from "../src/detectors/helpers";
import { mapWithConcurrency } from "../src/filesystem/concurrency";
import { assertSafeProjectTarget } from "../src/filesystem/safety";

describe("safety matrix - boundary checks", () => {
  const boundaryCases = [
    ["/fake/project", "/fake/project"],
    ["/fake/project", "/fake"],
    ["/fake/project", "/other/dir"],
    ["/fake/project", "/fake/project/../../outside"],
  ];

  it.each(boundaryCases)(
    "rejects root or outside target project=%s target=%s",
    async (projectRoot, targetPath) => {
      await expect(
        assertSafeProjectTarget(projectRoot, targetPath),
      ).rejects.toThrow("Unsafe cleanup path outside project boundary");
    },
  );
});

describe("safety matrix - protected project paths", () => {
  const protectedCases = [
    ".git",
    ".git/config",
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.test",
    "app",
    "components",
    "data",
    "pages",
    "public",
    "src",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
  ];

  it.each(protectedCases)("rejects protected path %s", async (relativePath) => {
    const projectRoot = "/fake/project";
    const targetPath = `/fake/project/${relativePath}`;
    await expect(
      assertSafeProjectTarget(projectRoot, targetPath),
    ).rejects.toThrow("Protected project path cannot be removed");
  });
});

describe("safety matrix - database files", () => {
  const dbCases = ["data.db", "storage.sqlite", "app.sqlite3", "sub/store.db"];

  it.each(dbCases)("rejects database file %s", async (relativePath) => {
    const root = await mkdtemp(join(tmpdir(), "nukecache-safety-db-"));
    try {
      const targetPath = join(root, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, "sqlite format 3");
      await expect(assertSafeProjectTarget(root, targetPath)).rejects.toThrow(
        "Protected project path cannot be removed",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("slug transformation matrix", () => {
  const slugCases: Array<[string, string]> = [
    ["Vite Cache", "vite-cache"],
    ["Next.js Cache", "next-js-cache"],
    ["__SPECIAL_NAME__", "special-name"],
    ["multiple   spaces---and-dots...", "multiple-spaces-and-dots"],
    ["clean-name", "clean-name"],
  ];

  it.each(slugCases)("converts %j to %j", (input, expected) => {
    expect(slug(input)).toBe(expected);
  });
});

describe("mapWithConcurrency matrix", () => {
  it("returns empty array for empty input", async () => {
    const result = await mapWithConcurrency([], 4, async (x) => {
      await Promise.resolve();
      return x;
    });
    expect(result).toEqual([]);
  });

  const concurrencyLevels = [1, 2, 5, 10];
  it.each(concurrencyLevels)(
    "preserves item order with concurrency=%i",
    async (concurrency) => {
      const items = Array.from({ length: 20 }, (_, i) => i);
      const result = await mapWithConcurrency(
        items,
        concurrency,
        async (val) => {
          await Promise.resolve();
          return val * 2;
        },
      );
      expect(result).toEqual(items.map((val) => val * 2));
    },
  );

  it("handles sparse or undefined array items", async () => {
    const items = [undefined, "item", undefined];
    const result = await mapWithConcurrency(items, 2, async (val) => {
      await Promise.resolve();
      return val ? val.toUpperCase() : "NONE";
    });
    expect(result).toEqual([undefined, "ITEM", undefined]);
  });
});

describe("safety matrix - symlinked boundary escape", () => {
  it("rejects non-symlink target reached through symlinked parent outside project", async () => {
    const root = await mkdtemp(join(tmpdir(), "nukecache-safety-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nukecache-safety-outside-"));
    try {
      await mkdir(join(outside, "inner"), { recursive: true });
      await writeFile(join(outside, "inner", "file.txt"), "data");
      await symlink(outside, join(root, "symlink-folder"), "dir");
      const target = join(root, "symlink-folder", "inner");
      await expect(assertSafeProjectTarget(root, target)).rejects.toThrow(
        "Target resolves outside project boundary",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
