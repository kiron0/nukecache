import { isPackageManager } from "../project/package-manager";
import type { PackageManager } from "../types";

export type CliCommand =
  "clean" | "config" | "explain" | "largest" | "list" | "old";
export type ConfigAction = "set" | "show" | "unset";

const COMMANDS: CliCommand[] = [
  "clean",
  "config",
  "explain",
  "largest",
  "list",
  "old",
];
const OPTIONS = [
  "--all",
  "--cwd",
  "--days",
  "--dry-run",
  "--force",
  "--global",
  "--help",
  "-h",
  "--ignore",
  "--json",
  "--limit",
  "--no-update-check",
  "--project",
  "--safe",
  "--version",
  "-v",
  "--yes",
  "-y",
];

export interface CliArgs {
  all: boolean;
  command: CliCommand;
  configAction?: ConfigAction;
  configKey?: string;
  configValue?: string;
  cwd?: string;
  dryRun: boolean;
  days?: number;
  explainTarget?: string;
  force: boolean;
  global: boolean;
  help: boolean;
  ignore: string[];
  json: boolean;
  manager?: PackageManager;
  limit?: number;
  noUpdateCheck: boolean;
  project: boolean;
  safe: boolean;
  version: boolean;
  yes: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    all: false,
    command: "clean",
    dryRun: false,
    force: false,
    global: false,
    help: false,
    ignore: [],
    json: false,
    noUpdateCheck: false,
    project: false,
    safe: false,
    version: false,
    yes: false,
  };
  let commandSeen = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const command = arg ? resolveCommand(arg) : undefined;
    if (command) {
      if (commandSeen) throw new Error(`Unexpected command: ${arg}`);
      args.command = command;
      commandSeen = true;
      continue;
    }
    if (args.command === "config" && arg && !arg.startsWith("-")) {
      if (!args.configAction) {
        if (arg !== "show" && arg !== "set" && arg !== "unset") {
          throw usageError(arg, ["show", "set", "unset"], "config action");
        }
        args.configAction = arg;
      } else if (!args.configKey && args.configAction !== "show") {
        args.configKey = arg;
      } else if (!args.configValue && args.configAction === "set") {
        args.configValue = arg;
      } else {
        throw new Error(`Unexpected config argument: ${arg}`);
      }
      continue;
    }
    if (args.command === "explain" && arg && !arg.startsWith("-")) {
      if (args.explainTarget) throw new Error(`Unexpected target: ${arg}`);
      args.explainTarget = arg;
      if (isPackageManager(arg)) {
        args.manager = arg;
        args.global = true;
      }
      continue;
    }
    if (arg && isPackageManager(arg)) {
      if (args.manager) throw new Error(`Unexpected package manager: ${arg}`);
      args.manager = arg;
      args.global = true;
      continue;
    }

    switch (arg) {
      case "--all":
        args.all = args.safe = true;
        break;
      case "--cwd":
        args.cwd = requireValue(argv, ++index, arg);
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--days":
        args.days = requirePositiveInteger(argv, ++index, arg);
        break;
      case "--force":
        args.force = true;
        break;
      case "--global":
        args.global = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--ignore":
        args.ignore.push(requireValue(argv, ++index, arg));
        break;
      case "--json":
        args.json = true;
        break;
      case "--limit":
        args.limit = requirePositiveInteger(argv, ++index, arg);
        break;
      case "--no-update-check":
        args.noUpdateCheck = true;
        break;
      case "--project":
        args.project = true;
        break;
      case "--safe":
        args.safe = true;
        break;
      case "--version":
      case "-v":
        args.version = true;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      default:
        throw usageError(
          arg ?? "",
          arg?.startsWith("-")
            ? OPTIONS
            : [...COMMANDS, "npm", "pnpm", "yarn", "bun"],
          arg?.startsWith("-") ? "option" : "command",
        );
    }
  }

  if (
    args.command !== "clean" &&
    (args.dryRun || args.yes || args.all || args.safe || args.force)
  ) {
    throw new Error(`${args.command} does not accept cleanup flags`);
  }
  if (args.command === "explain" && !args.explainTarget) {
    throw new Error("explain requires a cache ID, tool, name, or path");
  }
  if (args.command === "config") {
    const action = args.configAction ?? "show";
    args.configAction = action;
    if (
      action === "set" &&
      (!args.configKey || args.configValue === undefined)
    ) {
      throw new Error("config set requires a key and value");
    }
    if (action === "unset" && !args.configKey) {
      throw new Error("config unset requires a key");
    }
  }
  if (args.command !== "old" && args.days !== undefined) {
    throw new Error("--days requires the old command");
  }
  if (args.command !== "largest" && args.limit !== undefined) {
    throw new Error("--limit requires the largest command");
  }
  if (args.yes && !args.safe && !args.force) {
    throw new Error("--yes requires --safe, --all, or --force");
  }
  if (args.yes && args.global && !args.force) {
    throw new Error("--global --yes requires --force");
  }
  if (args.manager && args.project) {
    throw new Error(
      "Package-manager commands cannot be combined with --project",
    );
  }
  if (args.global && args.all && !args.project) {
    throw new Error("--all excludes global caches; use --force");
  }
  if (args.json && args.command === "clean" && !args.yes && !args.dryRun) {
    throw new Error("clean --json requires --safe --yes or --dry-run");
  }

  return args;
}

function resolveCommand(value: string): CliCommand | undefined {
  if (COMMANDS.includes(value as CliCommand)) return value as CliCommand;
  return undefined;
}

function usageError(
  value: string,
  candidates: readonly string[],
  kind: string,
): Error {
  const suggestions = nearby(value, candidates);
  const lines = [`✖ Unknown ${kind}: "${value}"`];
  if (suggestions.length > 0) {
    lines.push("│", "├─ Did you mean?");
    lines.push(
      ...suggestions.map((suggestion) =>
        kind === "config action"
          ? `│  • nukecache config ${suggestion}`
          : `│  • nukecache ${suggestion}`,
      ),
    );
  }
  lines.push("│", "└─ Run `nukecache --help` for all commands.");
  return new Error(lines.join("\n"));
}

function nearby(value: string, candidates: readonly string[]): string[] {
  const normalized = value.toLowerCase();
  const maximumDistance = Math.max(2, Math.floor(normalized.length * 0.4));
  return candidates
    .map((candidate) => ({
      candidate,
      distance: editDistance(normalized, candidate.toLowerCase()),
    }))
    .filter(({ distance }) => distance <= maximumDistance)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.candidate.localeCompare(right.candidate),
    )
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? right.length;
}

function requirePositiveInteger(
  argv: string[],
  index: number,
  option: string,
): number {
  const raw = requireValue(argv, index, option);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${option} requires a positive integer`);
  }
  return value;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-"))
    throw new Error(`Missing value for ${option}`);
  return value;
}
