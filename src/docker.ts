import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DockerDiskUsage {
  buildCacheSize: number;
  buildCacheReclaimable: number;
  raw: string;
}

export interface DockerPruneResult {
  reclaimedBytes: number;
  raw: string;
}

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
    return execFileAsync("docker", ["system", "df"], {
      encoding: "utf8",
      timeout: 15_000,
      shell: process.platform === "win32",
    });
  });

  return parseDf(stdout);
}

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

function parseDf(output: string): DockerDiskUsage {
  let buildCacheSize = 0;
  let buildCacheReclaimable = 0;

  const lines = output.trim().split("\n");

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const type = typeof obj["Type"] === "string" ? obj["Type"] : "";
      if (type === "Build Cache") {
        const sizeStr = typeof obj["Size"] === "string" ? obj["Size"] : "0";
        buildCacheSize = parseDockerBytes(sizeStr);
        const recStr =
          typeof obj["Reclaimable"] === "string" ? obj["Reclaimable"] : "0";
        buildCacheReclaimable = parseDockerBytes(recStr.split(" ")[0] ?? "0");
      }
    } catch {
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
