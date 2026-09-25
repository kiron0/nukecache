import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkForUpdate,
  checkUpdateManually,
  compareVersions,
  ignoreUpdateVersion,
  installUpdate,
  MANUAL_RATE_LIMIT_MS,
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

  it("discards malformed cached fields and refreshes safely", async () => {
    const cacheDirectory = await temporaryDirectory();
    await writeFile(
      join(cacheDirectory, "update.json"),
      JSON.stringify({
        checkedAt: "never",
        ignoredVersion: "not-semver",
        latestVersion: 999,
      }),
    );
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ version: "0.4.0" }), { status: 200 }),
      ),
    ) as typeof fetch;

    await expect(
      checkForUpdate("0.3.0", { cacheDirectory, fetcher, now: 5_000 }),
    ).resolves.toMatchObject({ latestVersion: "0.4.0" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("checks updates manually with rate limit and force bypass", async () => {
    const cacheDirectory = await temporaryDirectory();
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ version: "0.5.0" }), { status: 200 }),
      ),
    ) as typeof fetch;

    // First manual check: fetches from registry
    const first = await checkUpdateManually("0.4.0", {
      cacheDirectory,
      fetcher,
      now: 10_000,
    });
    expect(first).toEqual({
      currentVersion: "0.4.0",
      latestVersion: "0.5.0",
      updateAvailable: true,
      rateLimited: false,
      releaseUrl: "https://github.com/kiron0/nukecache/releases/latest",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Second manual check within rate limit window (e.g. +30s): rate limited, no fetch
    const second = await checkUpdateManually("0.4.0", {
      cacheDirectory,
      fetcher,
      now: 10_000 + 30_000,
    });
    expect(second).toEqual({
      currentVersion: "0.4.0",
      latestVersion: "0.5.0",
      updateAvailable: true,
      rateLimited: true,
      releaseUrl: "https://github.com/kiron0/nukecache/releases/latest",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Third manual check with force: true: bypasses rate limit, fetches
    const third = await checkUpdateManually("0.4.0", {
      cacheDirectory,
      fetcher,
      force: true,
      now: 10_000 + 35_000,
    });
    expect(third.rateLimited).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Fourth manual check after rate limit expires (+61s from third): fetches
    const fourth = await checkUpdateManually("0.4.0", {
      cacheDirectory,
      fetcher,
      now: 45_000 + MANUAL_RATE_LIMIT_MS + 1_000,
    });
    expect(fourth.rateLimited).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "nukecache-update-"));
  temporaryDirectories.push(path);
  return path;
}
