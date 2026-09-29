import { describe, expect, it } from "vitest";

import { formatDockerUsage } from "../src/output";

describe("Docker build cache formatting", () => {
  it("formats docker build cache usage table", () => {
    const size = 8.4 * 1024 ** 3;
    const reclaimable = 6.7 * 1024 ** 3;

    const output = formatDockerUsage(size, reclaimable);

    expect(output).toContain("Docker build cache");
    expect(output).toContain("Size:");
    expect(output).toContain("Reclaimable:");
    expect(output).toContain("GB");
  });

  it("handles zero build cache size", () => {
    const output = formatDockerUsage(0, 0);

    expect(output).toContain("Docker build cache");
    expect(output).toContain("0 B");
  });
});
