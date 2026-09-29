import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DockerDiskUsage {
  buildCacheSize: number; // bytes, total
  buildCacheReclaimable: number; // bytes, reclaimable
  raw: string; // raw docker system df output
}

export interface DockerPruneResult {
  reclaimedBytes: number;
  raw: string;
}

/**
 * Runs `docker system df` and parses build-cache sizes.
 * Throws if Docker is not installed or not running.
 */
export async function getDockerDiskUsage(): Promise<DockerDiskUsage> {
  const { stdout } = await execFileAsync(
    "docker",
    ["system", "df", "--format", "{{json .}}"],
    {
      encoding: "utf8",
      timeout: 15_000,
      shell: process.platform === "win32",
    },
  ).catch(() => {
    // Fallback: plain text format
    return execFileAsync("docker", ["system", "df"], {
      encoding: "utf8",
      timeout: 15_000,
      shell: process.platform === "win32",
    });
  });

  return parseDf(stdout);
}

/**
 * Runs `docker builder prune --force` and returns reclaimed bytes.
 */
export async function pruneDockerBuildCache(
  force = true,
): Promise<DockerPruneResult> {
  const args = ["builder", "prune"];
  if (force) args.push("--force");

  const { stdout } = await execFileAsync("docker", args, {
    encoding: "utf8",
    timeout: 5 * 60_000,
    shell: process.platform === "win32",
  });

  const reclaimedBytes = parseReclaimedBytes(stdout);
  return { reclaimedBytes, raw: stdout };
}

/**
 * Check whether Docker daemon is accessible.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      encoding: "utf8",
      timeout: 5_000,
      shell: process.platform === "win32",
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseDf(output: string): DockerDiskUsage {
  // docker system df --format '{{json .}}' emits multiple JSON objects (one per line)
  // or we fall back to plain text line parsing.
  let buildCacheSize = 0;
  let buildCacheReclaimable = 0;

  const lines = output.trim().split("\n");

  for (const line of lines) {
    // Try JSON line first.
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      // docker system df --format {{json .}} per object has Type, Size, Reclaimable
      const type = String(obj["Type"] ?? "");
      if (type === "Build Cache") {
        buildCacheSize = parseDockerBytes(String(obj["Size"] ?? "0"));
        const rec = String(obj["Reclaimable"] ?? "0");
        // Reclaimable may be "2.5GB (40%)" — take the first token
        buildCacheReclaimable = parseDockerBytes(rec.split(" ")[0] ?? "0");
      }
    } catch {
      // Plain text row: "Build Cache   25       36.63MB   17.58MB"
      if (/build\s+cache/i.test(line)) {
        const tokens = line.trim().split(/\s{2,}/);
        buildCacheSize = parseDockerBytes(tokens[2] ?? "0");
        buildCacheReclaimable = parseDockerBytes(
          (tokens[3] ?? "0").split(" ")[0] ?? "0",
        );
      }
    }
  }

  return { buildCacheSize, buildCacheReclaimable, raw: output };
}

function parseReclaimedBytes(output: string): number {
  // "Total reclaimed space: 5.217GB"
  const match = output.match(/Total reclaimed space:\s*([\d.]+\s*\w+)/i);
  if (!match) return 0;
  return parseDockerBytes(match[1]?.trim() ?? "0");
}

function parseDockerBytes(value: string): number {
  const match = value.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "B").toUpperCase();
  const map: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Math.round(num * (map[unit] ?? 1));
}
