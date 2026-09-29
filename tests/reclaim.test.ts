import { describe, expect, it } from "vitest";

import { parseSize, selectReclaimCandidates } from "../src/reclaim";
import type { CacheTarget } from "../src/types";

describe("parseSize", () => {
  it("parses bytes", () => expect(parseSize("512b")).toBe(512));
  it("parses KB", () => expect(parseSize("1kb")).toBe(1024));
  it("parses MB", () => expect(parseSize("500mb")).toBe(500 * 1024 ** 2));
  it("parses GB", () => expect(parseSize("5gb")).toBe(5 * 1024 ** 3));
  it("parses TB", () => expect(parseSize("1tb")).toBe(1024 ** 4));
  it("parses decimal GB", () => {
    expect(parseSize("1.5gb")).toBe(Math.round(1.5 * 1024 ** 3));
  });
  it("is case-insensitive", () => {
    expect(parseSize("5GB")).toBe(5 * 1024 ** 3);
    expect(parseSize("500MB")).toBe(500 * 1024 ** 2);
  });
  it("treats bare number as bytes", () => expect(parseSize("1024")).toBe(1024));
  it("trims whitespace", () =>
    expect(parseSize(" 100mb ")).toBe(100 * 1024 ** 2));
  it("throws on invalid format", () => {
    expect(() => parseSize("fivegb")).toThrow("Invalid size");
    expect(() => parseSize("")).toThrow("Invalid size");
    expect(() => parseSize("0gb")).toThrow("must be positive");
  });
});

function makeTarget(
  overrides: Partial<CacheTarget> & Pick<CacheTarget, "id" | "size" | "safety">,
): CacheTarget {
  return {
    name: overrides.id,
    path: overrides.id,
    absolutePath: `/tmp/${overrides.id}`,
    scope: "project",
    tool: "test",
    description: "test cache",
    consequences: [],
    trackedByGit: false,
    symlink: false,
    createdAt: Date.now() - 1_000_000,
    modifiedAt: Date.now() - 1_000_000,
    exists: true,
    ...overrides,
  };
}

describe("selectReclaimCandidates", () => {
  it("selects nothing when no targets", () => {
    expect(selectReclaimCandidates([], 1024 ** 3)).toEqual([]);
  });

  it("selects safe targets first", () => {
    const safe = makeTarget({
      id: "safe",
      size: 100 * 1024 ** 2,
      safety: "safe",
    });
    const rebuild = makeTarget({
      id: "rebuild",
      size: 200 * 1024 ** 2,
      safety: "rebuild",
    });
    const result = selectReclaimCandidates([rebuild, safe], 50 * 1024 ** 2);
    expect(result.map((t) => t.id)).toEqual(["safe"]);
  });

  it("stops once target is met", () => {
    const a = makeTarget({ id: "a", size: 300 * 1024 ** 2, safety: "safe" });
    const b = makeTarget({ id: "b", size: 300 * 1024 ** 2, safety: "safe" });
    const result = selectReclaimCandidates([a, b], 400 * 1024 ** 2);
    expect(result.length).toBe(2);
  });

  it("picks single target when it meets requirement", () => {
    const a = makeTarget({ id: "a", size: 500 * 1024 ** 2, safety: "safe" });
    const b = makeTarget({ id: "b", size: 500 * 1024 ** 2, safety: "safe" });
    const result = selectReclaimCandidates([a, b], 400 * 1024 ** 2);
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("a");
  });

  it("excludes git-tracked targets", () => {
    const tracked = makeTarget({
      id: "tracked",
      size: 1024 ** 3,
      safety: "safe",
      trackedByGit: true,
    });
    expect(selectReclaimCandidates([tracked], 1024 ** 2)).toEqual([]);
  });

  it("excludes symlinks", () => {
    const sym = makeTarget({
      id: "sym",
      size: 1024 ** 3,
      safety: "safe",
      symlink: true,
    });
    expect(selectReclaimCandidates([sym], 1024 ** 2)).toEqual([]);
  });

  it("excludes global scope", () => {
    const global = makeTarget({
      id: "global",
      size: 1024 ** 3,
      safety: "safe",
      scope: "global",
    });
    expect(selectReclaimCandidates([global], 1024 ** 2)).toEqual([]);
  });

  it("prefers older targets over newer ones", () => {
    const recent = makeTarget({
      id: "recent",
      size: 100 * 1024 ** 2,
      safety: "safe",
      modifiedAt: Date.now() - 1_000,
    });
    const old = makeTarget({
      id: "old",
      size: 100 * 1024 ** 2,
      safety: "safe",
      modifiedAt: Date.now() - 10_000_000,
    });
    const result = selectReclaimCandidates([recent, old], 100 * 1024 ** 2);
    expect(result[0]?.id).toBe("old");
  });
});
