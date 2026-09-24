import { isPackageManager } from "../project/package-manager";
import type { PackageManager } from "../types";

export type CliCommand = "clean" | "list";

export interface CliArgs {
  all: boolean;
  command: CliCommand;
  cwd?: string;
  dryRun: boolean;
  force: boolean;
  global: boolean;
  help: boolean;
  ignore: string[];
  json: boolean;
  manager?: PackageManager;
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
    project: false,
    safe: false,
    version: false,
    yes: false,
  };
  let commandSeen = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "list" || arg === "clean") {
      if (commandSeen) throw new Error(`Unexpected command: ${arg}`);
      args.command = arg;
      commandSeen = true;
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
        args.all = true;
        args.safe = true;
        break;
      case "--cwd":
        args.cwd = requireValue(argv, ++index, arg);
        break;
      case "--dry-run":
        args.dryRun = true;
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
        throw new Error(`Unknown option or command: ${arg}`);
    }
  }

  if (
    args.command === "list" &&
    (args.dryRun || args.yes || args.all || args.safe || args.force)
  ) {
    throw new Error("list does not accept cleanup flags");
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

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-"))
    throw new Error(`Missing value for ${option}`);
  return value;
}
