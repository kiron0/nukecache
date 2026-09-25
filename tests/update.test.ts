import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkForUpdate,
  compareVersions,
  ignoreUpdateVersion,
  installUpdate,
} from "../src/update";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("update checks", () => {
  it("compares stable and prerelease versions", async () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-beta.2")).toBe(1);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBe(-1);
    expect(compareVersions("invalid", "1.0.0")).toBe(0);
    await expect(installUpdate("not-a-version")).rejects.toThrow(
      "Invalid update version",
    );
  });

  it("caches registry checks and returns newer versions", async () => {
    const cacheDirectory = await temporaryDirectory();
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ version: "0.3.0" }), { status: 200 }),
      ),
    ) as typeof fetch;

    await expect(
      checkForUpdate("0.2.0", { cacheDirectory, fetcher, now: 1_000 }),
    ).resolves.toMatchObject({ latestVersion: "0.3.0" });
    await expect(
      checkForUpdate("0.2.0", { cacheDirectory, fetcher, now: 2_000 }),
    ).resolves.toMatchObject({ latestVersion: "0.3.0" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("can ignore one release", async () => {
    const cacheRoot = await temporaryDirectory();
    const previousCacheRoot = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ version: "0.3.0" }), { status: 200 }),
      ),
    ) as typeof fetch;
    try {
      await checkForUpdate("0.2.0", { fetcher, now: 1_000 });
      await ignoreUpdateVersion("0.3.0");
      await expect(
        checkForUpdate("0.2.0", { fetcher, now: 2_000 }),
      ).resolves.toBeUndefined();
    } finally {
      if (previousCacheRoot === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = previousCacheRoot;
    }
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "nukecache-update-"));
  temporaryDirectories.push(path);
  return path;
}
