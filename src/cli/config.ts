import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
  text,
} from "@clack/prompts";
import { access, rm } from "node:fs/promises";
import { basename } from "node:path";

import {
  configPath,
  findExistingConfigFiles,
  loadConfig,
  saveConfig,
} from "../project/config";
import type { NukecacheConfig } from "../types";
import type { CliArgs } from "./args";

const CONFIG_KEYS = [
  "defaultScope",
  "showGlobal",
  "dryRun",
  "safe",
  "force",
  "json",
  "packageManagers",
  "days",
  "limit",
  "noUpdateCheck",
  "ignore",
  "include",
  "custom",
] as const;
type ConfigKey = (typeof CONFIG_KEYS)[number];

export interface ConfigCommandResult {
  changed?: { action: "set" | "unset"; key: ConfigKey };
  config: Required<
    Pick<NukecacheConfig, "ignore" | "include" | "custom" | "packageManagers">
  > &
    Pick<
      NukecacheConfig,
      | "defaultScope"
      | "showGlobal"
      | "dryRun"
      | "safe"
      | "force"
      | "json"
      | "days"
      | "limit"
      | "noUpdateCheck"
    >;
  exists: boolean;
  path: string;
}

export async function runConfigCommand(
  root: string,
  args: CliArgs,
): Promise<ConfigCommandResult> {
  let config = await loadConfig(root);
  let changed: ConfigCommandResult["changed"];
  const action = args.configAction ?? "show";

  if (action === "set") {
    const key = requireConfigKey(args.configKey);
    config = {
      ...config,
      [key]: parseConfigValue(key, args.configValue ?? ""),
    };
    await saveConfig(root, config);
    changed = { action, key };
  } else if (action === "unset") {
    const key = requireConfigKey(args.configKey);
    const next = { ...config } as Record<string, unknown>;
    delete next[key];
    config = next;
    await saveConfig(root, config);
    changed = { action, key };
  }

  const path = configPath(root);
  return {
    ...(changed ? { changed } : {}),
    config: {
      defaultScope: config.defaultScope ?? "project",
      showGlobal: config.showGlobal ?? false,
      dryRun: config.dryRun ?? false,
      safe: config.safe ?? false,
      force: config.force ?? false,
      json: config.json ?? false,
      packageManagers: config.packageManagers ?? [],
      days: config.days ?? 30,
      limit: config.limit ?? 10,
      noUpdateCheck: config.noUpdateCheck ?? false,
      ignore: config.ignore ?? [],
      include: config.include ?? [],
      custom: config.custom ?? [],
    },
    exists: await pathExists(path),
    path,
  };
}

export async function runInteractiveConfig(root: string): Promise<void> {
  intro("nukecache config");
  let result = await runConfigCommand(root, configArgs("show"));
  let saved = false;

  while (true) {
    note(formatConfigSummary(result), result.path);
    const action = await select({
      message: "What would you like to do?",
      options: [
        {
          value: "update",
          label: "Update configuration",
          hint: "choose any setting",
        },
        {
          value: "unset",
          label: "Restore a default",
          hint: "remove configured value",
        },
        { value: "done", label: "Done" },
      ],
      initialValue: "update",
    });
    if (isCancel(action)) return cancelConfig(saved);
    if (action === "done") {
      outro(saved ? "Configuration saved." : "Configuration unchanged.");
      return;
    }

    if (action === "unset") {
      const rawConfig = await loadConfig(root);
      const configuredKeys = CONFIG_KEYS.filter(
        (key) => rawConfig[key] !== undefined,
      );
      if (configuredKeys.length === 0) {
        log.info("All settings already use defaults.");
        continue;
      }
      const key = await select({
        message: "Select setting to restore",
        options: configuredKeys.map((value) => ({
          value,
          label: configLabel(value),
          hint: "restore default",
        })),
      });
      if (isCancel(key)) return cancelConfig(saved);
      const approved = await confirm({
        message: `Restore ${configLabel(key)} to its default?`,
        initialValue: true,
      });
      if (isCancel(approved)) return cancelConfig(saved);
      if (!approved) {
        log.info("No changes saved.");
        continue;
      }
      result = await runConfigCommand(root, configArgs("unset", key));
      saved = true;
      log.success(`${configLabel(key)} restored.`);
      continue;
    }

    const key = await select({
      message: "Select configuration",
      options: CONFIG_KEYS.map((value) => ({
        value,
        label: configLabel(value),
        hint: configHint(value, result.config),
      })),
    });
    if (isCancel(key)) return cancelConfig(saved);
    const value = await promptConfigValue(key, result.config);
    if (isCancel(value)) return cancelConfig(saved);
    const approved = await confirm({
      message: `Save ${configLabel(key)}?`,
      initialValue: true,
    });
    if (isCancel(approved)) return cancelConfig(saved);
    if (!approved) {
      log.info("No changes saved.");
      continue;
    }
    result = await runConfigCommand(root, configArgs("set", key, value));
    saved = true;
    log.success(`${configLabel(key)} updated.`);
  }
}

export function formatConfig(result: ConfigCommandResult): string {
  const { config } = result;
  const lines = [
    "nukecache configuration",
    "",
    `File          ${result.path}`,
    `Status        ${result.exists ? "configured" : "defaults"}`,
    `Scope         ${config.defaultScope ?? "project"}`,
    `Show global   ${String(config.showGlobal ?? false)}`,
    `Dry run       ${String(config.dryRun ?? false)}`,
    `Safe only     ${String(config.safe ?? false)}`,
    `Force         ${String(config.force ?? false)}`,
    `JSON output   ${String(config.json ?? false)}`,
    `Pkg managers  ${formatValues(config.packageManagers)}`,
    `Days          ${String(config.days ?? 30)}`,
    `Limit         ${String(config.limit ?? 10)}`,
    `Update check  ${config.noUpdateCheck ? "disabled" : "enabled"}`,
    `Ignore        ${formatValues(config.ignore)}`,
    `Include       ${formatValues(config.include)}`,
    `Custom        ${config.custom.length} definition${config.custom.length === 1 ? "" : "s"}`,
  ];

  if (config.custom.length > 0) {
    lines.push("");
    for (const definition of config.custom) {
      lines.push(
        `  ${definition.name} · ${definition.paths.join(", ")} · ${definition.safety ?? "safe"}`,
      );
    }
  }

  if (result.changed) {
    lines.unshift(
      `✓ ${result.changed.action === "set" ? "Updated" : "Removed"} ${result.changed.key}`,
      "",
    );
  }

  lines.push(
    "",
    "Update options",
    "  nukecache config set showGlobal true",
    "  nukecache config set dryRun true",
    "  nukecache config set packageManagers '[\"pnpm\"]'",
    "  nukecache config set days 14",
    '  nukecache config set ignore \'["vite", "turbo"]\'',
    "  nukecache config unset showGlobal",
    "  nukecache config --json",
  );
  return lines.join("\n");
}

function formatConfigSummary(result: ConfigCommandResult): string {
  const { config } = result;
  const lines = [
    `Status        ${result.exists ? "configured" : "defaults"}`,
    `Scope         ${config.defaultScope ?? "project"}`,
    `Show global   ${String(config.showGlobal ?? false)}`,
    `Dry run       ${String(config.dryRun ?? false)}`,
    `Safe only     ${String(config.safe ?? false)}`,
    `Force         ${String(config.force ?? false)}`,
    `JSON output   ${String(config.json ?? false)}`,
    `Pkg managers  ${formatValues(config.packageManagers)}`,
    `Days          ${String(config.days ?? 30)}`,
    `Limit         ${String(config.limit ?? 10)}`,
    `Update check  ${config.noUpdateCheck ? "disabled" : "enabled"}`,
    `Ignore        ${formatValues(config.ignore)}`,
    `Include       ${formatValues(config.include)}`,
    `Custom        ${config.custom.length} definition${config.custom.length === 1 ? "" : "s"}`,
  ];
  for (const definition of config.custom) {
    lines.push(
      `  ${definition.name} · ${definition.paths.join(", ")} · ${definition.safety ?? "safe"}`,
    );
  }
  return lines.join("\n");
}

async function promptConfigValue(
  key: ConfigKey,
  config: ConfigCommandResult["config"],
): Promise<Awaited<ReturnType<typeof text>>> {
  if (key === "showGlobal") {
    return select({
      message: "Show global package-manager caches by default?",
      options: [
        { value: "true", label: "Enabled", hint: "project and global caches" },
        { value: "false", label: "Disabled", hint: "project caches only" },
      ],
      initialValue: config.showGlobal ? "true" : "false",
    });
  }
  if (key === "dryRun") {
    return select({
      message: "Default to dry-run mode (preview without deleting)?",
      options: [
        { value: "true", label: "Enabled", hint: "always simulate cleanup" },
        { value: "false", label: "Disabled", hint: "normal cleanup" },
      ],
      initialValue: config.dryRun ? "true" : "false",
    });
  }
  if (key === "safe") {
    return select({
      message: "Restrict default cleanup to safe targets?",
      options: [
        { value: "true", label: "Enabled", hint: "skip rebuildable targets" },
        { value: "false", label: "Disabled", hint: "normal selection" },
      ],
      initialValue: config.safe ? "true" : "false",
    });
  }
  if (key === "force") {
    return select({
      message: "Allow clearing rebuildable and global caches without --force?",
      options: [
        {
          value: "true",
          label: "Enabled",
          hint: "dangerous / rebuildable allowed",
        },
        { value: "false", label: "Disabled", hint: "require CLI --force flag" },
      ],
      initialValue: config.force ? "true" : "false",
    });
  }
  if (key === "json") {
    return select({
      message: "Default output to JSON format?",
      options: [
        {
          value: "true",
          label: "Enabled",
          hint: "machine-readable JSON output",
        },
        {
          value: "false",
          label: "Disabled",
          hint: "human-readable terminal output",
        },
      ],
      initialValue: config.json ? "true" : "false",
    });
  }
  if (key === "packageManagers") {
    const value = await text({
      message: "Restricted package managers (npm, pnpm, yarn, bun)",
      placeholder: "pnpm, bun",
      initialValue: config.packageManagers.join(", "),
    });
    return isCancel(value)
      ? value
      : JSON.stringify(
          value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        );
  }
  if (key === "noUpdateCheck") {
    return select({
      message: "Update checks for this project",
      options: [
        { value: "false", label: "Enabled", hint: "check npm registry" },
        { value: "true", label: "Disabled", hint: "skip npm version queries" },
      ],
      initialValue: config.noUpdateCheck ? "true" : "false",
    });
  }
  if (key === "defaultScope") {
    return select({
      message: "Default detection scope",
      options: [
        { value: "project", label: "Project", hint: "project caches only" },
        {
          value: "global",
          label: "Global",
          hint: "package-manager caches only",
        },
        { value: "all", label: "All", hint: "both project and global" },
      ],
      initialValue: config.defaultScope ?? "project",
    });
  }
  if (key === "days") {
    return text({
      message: "Days threshold for old command",
      initialValue: String(config.days ?? 30),
      validate(input) {
        const num = Number(input);
        return Number.isSafeInteger(num) && num > 0
          ? undefined
          : "Enter a positive integer.";
      },
    });
  }
  if (key === "limit") {
    return text({
      message: "Maximum items for largest command",
      initialValue: String(config.limit ?? 10),
      validate(input) {
        const num = Number(input);
        return Number.isSafeInteger(num) && num > 0
          ? undefined
          : "Enter a positive integer.";
      },
    });
  }
  if (key === "ignore" || key === "include") {
    const values = key === "ignore" ? config.ignore : config.include;
    const value = await text({
      message:
        key === "ignore"
          ? "Ignored IDs, tools, or paths"
          : "Additional project cache paths",
      placeholder: key === "ignore" ? "vite, turbo" : ".generated-cache",
      initialValue: values.join(", "),
    });
    return isCancel(value)
      ? value
      : JSON.stringify(
          value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        );
  }
  return text({
    message: "Custom cache definitions (JSON array)",
    initialValue: JSON.stringify(config.custom),
    placeholder: '[{"name":"Compiler","paths":[".cache"]}]',
    validate(value) {
      try {
        return Array.isArray(JSON.parse(value ?? ""))
          ? undefined
          : "Custom definitions must be a JSON array.";
      } catch {
        return "Enter valid JSON.";
      }
    },
  });
}

function configArgs(
  action: "set" | "show" | "unset",
  key?: ConfigKey,
  value?: string,
): CliArgs {
  return {
    all: false,
    command: "config",
    configAction: action,
    ...(key ? { configKey: key } : {}),
    ...(value !== undefined ? { configValue: value } : {}),
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
}

function configLabel(key: ConfigKey): string {
  return {
    defaultScope: "Default scope",
    showGlobal: "Global caches",
    dryRun: "Dry run mode",
    safe: "Safe targets only",
    force: "Force mode",
    json: "JSON output",
    packageManagers: "Package managers",
    days: "Old age threshold (days)",
    limit: "Largest items limit",
    noUpdateCheck: "Disable update check",
    ignore: "Ignored targets",
    include: "Included paths",
    custom: "Custom cache definitions",
  }[key];
}

function configHint(
  key: ConfigKey,
  config: ConfigCommandResult["config"],
): string {
  switch (key) {
    case "defaultScope":
      return config.defaultScope ?? "project";
    case "showGlobal":
      return config.showGlobal ? "enabled" : "disabled";
    case "dryRun":
      return config.dryRun ? "enabled" : "disabled";
    case "safe":
      return config.safe ? "enabled" : "disabled";
    case "force":
      return config.force ? "enabled" : "disabled";
    case "json":
      return config.json ? "enabled" : "disabled";
    case "packageManagers":
      return `${config.packageManagers.length} managers`;
    case "days":
      return `${config.days ?? 30} days`;
    case "limit":
      return `${config.limit ?? 10} items`;
    case "noUpdateCheck":
      return config.noUpdateCheck ? "disabled" : "enabled";
    case "ignore":
      return `${config.ignore.length} values`;
    case "include":
      return `${config.include.length} values`;
    case "custom":
      return `${config.custom.length} definitions`;
  }
}

function cancelConfig(saved: boolean): void {
  cancel(saved ? "Saved changes kept." : "Configuration unchanged.");
}

function requireConfigKey(value: string | undefined): ConfigKey {
  if (value && CONFIG_KEYS.includes(value as ConfigKey))
    return value as ConfigKey;
  throw new Error(
    `Unknown config key: "${value ?? ""}"\nValid keys: ${CONFIG_KEYS.join(", ")}`,
  );
}

function parseConfigValue(key: ConfigKey, source: string): unknown {
  if (
    key === "showGlobal" ||
    key === "dryRun" ||
    key === "safe" ||
    key === "force" ||
    key === "json" ||
    key === "noUpdateCheck"
  ) {
    if (source === "true") return true;
    if (source === "false") return false;
    throw new Error(`${key} must be true or false`);
  }
  if (key === "days" || key === "limit") {
    const num = Number(source);
    if (!Number.isSafeInteger(num) || num < 1) {
      throw new Error(`${key} must be a positive integer`);
    }
    return num;
  }
  if (key === "defaultScope") {
    if (source === "project" || source === "global" || source === "all")
      return source;
    throw new Error("defaultScope must be project, global, or all");
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(`${key} must be valid JSON`);
  }
}

function formatValues(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveConfigCollision(
  root: string,
  isInteractive: boolean,
): Promise<void> {
  const configs = findExistingConfigFiles(root);
  if (configs.length <= 1) return;

  const names = configs.map((filepath) => basename(filepath));
  const collisionMessage =
    `Multiple configuration files found: ${names.join(", ")}.\n` +
    "Having multiple configuration files causes ambiguous settings across binary commands (nukecache, nkc, ncache).";

  if (!isInteractive) {
    throw new Error(
      `${collisionMessage}\nPlease remove duplicate config files and keep only one.`,
    );
  }

  log.error(collisionMessage);
  note(
    "Multiple configuration files lead to inconsistent cache behavior.\n" +
      "Select which duplicate file(s) to remove so only one configuration remains.",
    "Configuration Conflict",
  );

  while (true) {
    const current = findExistingConfigFiles(root);
    if (current.length <= 1) {
      log.success(
        `Configuration conflict resolved. Active file: ${basename(current[0] ?? "")}`,
      );
      break;
    }

    const selectedFile = await select({
      message: "Which configuration file would you like to remove?",
      options: current.map((filepath) => ({
        value: filepath,
        label: basename(filepath),
        hint: `delete to avoid collision (${basename(filepath)})`,
      })),
    });

    if (isCancel(selectedFile)) {
      cancel("Aborted. Multiple configuration files still exist.");
      throw new Error("Aborted config resolution.");
    }

    const confirmed = await confirm({
      message: `Delete ${basename(selectedFile)}?`,
      initialValue: true,
    });

    if (isCancel(confirmed) || !confirmed) {
      cancel("Aborted. File was not removed.");
      throw new Error("Aborted config resolution.");
    }

    await rm(selectedFile, { force: true });
    log.step(`Removed ${basename(selectedFile)}.`);
  }
}
