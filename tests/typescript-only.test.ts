import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const JAVASCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);

describe("TypeScript-only source", () => {
  it("contains no maintained JavaScript files", async () => {
    const roots = [join(process.cwd(), "src"), join(process.cwd(), "tests")];
    const files = (await Promise.all(roots.map(collectFiles))).flat();
    const javascriptFiles = files
      .filter((path) => JAVASCRIPT_EXTENSIONS.has(extname(path)))
      .map((path) => relative(process.cwd(), path));

    expect(javascriptFiles).toEqual([]);
  });
});

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : Promise.resolve([path]);
    }),
  );
  return files.flat();
}
