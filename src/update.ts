import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const MANUAL_RATE_LIMIT_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 1_200;
const REGISTRY_URL = "https://registry.npmjs.org/nukecache/latest";

interface UpdateCache {
  checkedAt?: number;
  ignoredVersion?: string;
  latestVersion?: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
}

export interface UpdateCheckOptions {
  cacheDirectory?: string;
  fetcher?: typeof fetch;
  force?: boolean;
  now?: number;
}

export interface ManualUpdateResult {
  currentVersion: string;
  latestVersion: string;
  rateLimited: boolean;
  releaseUrl: string;
  updateAvailable: boolean;
}

export async function checkUpdateManually(
  currentVersion: string,
  options: UpdateCheckOptions = {},
): Promise<ManualUpdateResult> {
  const now = options.now ?? Date.now();
  const cachePath = join(
    options.cacheDirectory ?? updateCacheDirectory(),
    "update.json",
  );
  const cache = await readCache(cachePath);
  let latestVersion = cache.latestVersion;
  const isRateLimited = Boolean(
    !options.force &&
    cache.checkedAt &&
    now - cache.checkedAt < MANUAL_RATE_LIMIT_MS,
  );

  if (!isRateLimited) {
    try {
      latestVersion = await fetchLatestVersion(options.fetcher ?? fetch);
      await writeCache(cachePath, {
        ...cache,
        checkedAt: now,
        latestVersion,
      });
    } catch {
      // Manual checks handle network errors gracefully without crashing.
    }
  }

  const effectiveLatest = latestVersion ?? currentVersion;
  const updateAvailable = Boolean(
    latestVersion && compareVersions(latestVersion, currentVersion) > 0,
  );

  return {
    currentVersion,
    latestVersion: effectiveLatest,
    rateLimited: isRateLimited,
    releaseUrl: "https://github.com/kiron0/nukecache/releases/latest",
    updateAvailable,
  };
}

export async function checkForUpdate(
  currentVersion: string,
  options: UpdateCheckOptions = {},
): Promise<UpdateInfo | undefined> {
  if (!parseVersion(currentVersion)) return undefined;

  const now = options.now ?? Date.now();
  const cachePath = join(
    options.cacheDirectory ?? updateCacheDirectory(),
    "update.json",
  );
  const cache = await readCache(cachePath);
  let latestVersion = cache.latestVersion;

  if (
    options.force ||
    !cache.checkedAt ||
    now - cache.checkedAt >= CHECK_INTERVAL_MS
  ) {
    try {
      latestVersion = await fetchLatestVersion(options.fetcher ?? fetch);
      await writeCache(cachePath, {
        ...cache,
        checkedAt: now,
        latestVersion,
      });
    } catch {
      // Update checks must never block normal commands.
    }
  }

  if (
    !latestVersion ||
    latestVersion === cache.ignoredVersion ||
    compareVersions(latestVersion, currentVersion) <= 0
  ) {
    return undefined;
  }

  return {
    currentVersion,
    latestVersion,
    releaseUrl: "https://github.com/kiron0/nukecache/releases/latest",
  };
}

export async function ignoreUpdateVersion(version: string): Promise<void> {
  const cachePath = join(updateCacheDirectory(), "update.json");
  const cache = await readCache(cachePath);
  await writeCache(cachePath, { ...cache, ignoredVersion: version });
}

export function installUpdate(version: string): Promise<void> {
  if (!parseVersion(version)) {
    return Promise.reject(new Error(`Invalid update version: ${version}`));
  }

  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(
      command,
      ["install", "--global", `nukecache@${version}`],
      {
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            signal
              ? `Update stopped by ${signal}`
              : `npm install exited with code ${code ?? "unknown"}`,
          ),
        );
      }
    });
  });
}

export function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) return 0;

  for (let index = 0; index < 3; index++) {
    const difference =
      leftVersion.numbers[index]! - rightVersion.numbers[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;

  const length = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  );
  for (let index = 0; index < length; index++) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/u.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/u.test(rightPart)
      ? Number(rightPart)
      : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) {
      return Math.sign(leftNumber - rightNumber);
    }
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

async function fetchLatestVersion(fetcher: typeof fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timer.unref();
  try {
    const response = await fetcher(REGISTRY_URL, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`npm registry returned ${response.status}`);
    const value: unknown = await response.json();
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      typeof value.version !== "string" ||
      !parseVersion(value.version)
    ) {
      throw new Error("npm registry returned an invalid version");
    }
    return value.version;
  } finally {
    clearTimeout(timer);
  }
}

function parseVersion(
  version: string,
): { numbers: [number, number, number]; prerelease?: string[] } | undefined {
  const match =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([\dA-Za-z.-]+))?(?:\+[\dA-Za-z.-]+)?$/u.exec(
      version,
    );
  if (!match) return undefined;
  const numbers: [number, number, number] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  return match[4] ? { numbers, prerelease: match[4].split(".") } : { numbers };
}

function updateCacheDirectory(): string {
  const configured = process.env.XDG_CACHE_HOME;
  if (configured) return join(configured, "nukecache");
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "nukecache");
  }
  return join(homedir(), ".cache", "nukecache");
}

async function readCache(path: string): Promise<UpdateCache> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof value !== "object" || value === null) return {};
    const record = value as Record<string, unknown>;
    return {
      ...(typeof record.checkedAt === "number" &&
      Number.isFinite(record.checkedAt)
        ? { checkedAt: record.checkedAt }
        : {}),
      ...(typeof record.ignoredVersion === "string" &&
      parseVersion(record.ignoredVersion)
        ? { ignoredVersion: record.ignoredVersion }
        : {}),
      ...(typeof record.latestVersion === "string" &&
      parseVersion(record.latestVersion)
        ? { latestVersion: record.latestVersion }
        : {}),
    };
  } catch {
    return {};
  }
}

async function writeCache(path: string, value: UpdateCache): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  } catch {
    // Read-only homes must not break normal commands.
  }
}
