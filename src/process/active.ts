import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ACTIVE_TOOL_PATTERNS: Array<{ pattern: RegExp; tool: string }> = [
  { pattern: /next(\s+dev|\s+start|\.js)/i, tool: "next" },
  { pattern: /vite/i, tool: "vite" },
  { pattern: /turbo(\s+watch|\s+dev|\s+build)/i, tool: "turbo" },
  { pattern: /jest(\s+--watch|\s+--watchAll)/i, tool: "jest" },
  { pattern: /vitest(\s+watch)?/i, tool: "vitest" },
  { pattern: /playwright/i, tool: "playwright" },
  { pattern: /cypress/i, tool: "cypress" },
  { pattern: /angular\/core/i, tool: "angular" },
  { pattern: /ng(\s+serve|\s+build)/i, tool: "angular" },
  { pattern: /parcel(\s+serve)?/i, tool: "parcel" },
];

export interface ActiveProcess {
  pid: number;
  command: string;
  tool: string;
}

export async function getActiveToolProcesses(): Promise<
  Map<string, ActiveProcess>
> {
  const active = new Map<string, ActiveProcess>();
  let lines: string[];
  try {
    lines = await listProcesses();
  } catch {
    return active;
  }

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[0]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    const command = parts.slice(1).join(" ");
    for (const { pattern, tool } of ACTIVE_TOOL_PATTERNS) {
      if (pattern.test(command) && !active.has(tool)) {
        active.set(tool, { pid, command, tool });
        break;
      }
    }
  }

  return active;
}

async function listProcesses(): Promise<string[]> {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync(
      "wmic",
      ["process", "get", "ProcessId,CommandLine", "/format:csv"],
      { encoding: "utf8", timeout: 5_000, windowsHide: true, shell: true },
    );
    return stdout.split("\n").slice(2);
  }
  const { stdout } = await execFileAsync("ps", ["-eo", "pid,command"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  return stdout.split("\n").slice(1);
}
