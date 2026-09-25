import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";

import type {
  CacheSafety,
  CustomCacheDefinition,
  NukecacheConfig,
} from "../types";

export const CONFIG_FILENAMES = [
  "nukecache.config.json",
  "nkc.config.json",
  "ncache.config.json",
] as const;

export const CONFIG_FILENAME = CONFIG_FILENAMES[0];
const SAFETY_VALUES = new Set<CacheSafety>([
  "safe",
  "rebuild",
  "reinstall",
  "global",
  "dangerous",
]);

export async function loadConfig(root: string): Promise<NukecacheConfig> {
  const path = configPath(root);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid ${basename(path)}: ${(error as Error).message}`, {
      cause: error,
    });
  }

  validateConfig(value);
  return value;
}

export async function saveConfig(
  root: string,
  config: NukecacheConfig,
): Promise<string> {
  validateConfig(config);
  const path = configPath(root);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return path;
}

export function configPath(root: string): string {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve(root, filename);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(root, CONFIG_FILENAME);
}

function validateConfig(value: unknown): asserts value is NukecacheConfig {
  if (!isRecord(value)) {
    throw new Error(`${CONFIG_FILENAME} must contain a JSON object`);
  }
  validateStringArray(value.ignore, "ignore");
  validateStringArray(value.include, "include");
  if (
    value.defaultScope !== undefined &&
    value.defaultScope !== "project" &&
    value.defaultScope !== "global" &&
    value.defaultScope !== "all"
  ) {
    throw new Error("config.defaultScope must be project, global, or all");
  }
  if (value.showGlobal !== undefined && typeof value.showGlobal !== "boolean") {
    throw new Error("config.showGlobal must be a boolean");
  }
  if (value.dryRun !== undefined && typeof value.dryRun !== "boolean") {
    throw new Error("config.dryRun must be a boolean");
  }
  if (value.safe !== undefined && typeof value.safe !== "boolean") {
    throw new Error("config.safe must be a boolean");
  }
  if (value.force !== undefined && typeof value.force !== "boolean") {
    throw new Error("config.force must be a boolean");
  }
  if (value.json !== undefined && typeof value.json !== "boolean") {
    throw new Error("config.json must be a boolean");
  }
  if (value.packageManagers !== undefined) {
    if (
      !Array.isArray(value.packageManagers) ||
      value.packageManagers.some(
        (pm) =>
          typeof pm !== "string" ||
          (pm !== "npm" && pm !== "pnpm" && pm !== "yarn" && pm !== "bun"),
      )
    ) {
      throw new Error(
        "config.packageManagers must be an array of npm, pnpm, yarn, or bun",
      );
    }
  }
  if (
    value.noUpdateCheck !== undefined &&
    typeof value.noUpdateCheck !== "boolean"
  ) {
    throw new Error("config.noUpdateCheck must be a boolean");
  }
  if (
    value.days !== undefined &&
    (!Number.isSafeInteger(value.days) || (value.days as number) < 1)
  ) {
    throw new Error("config.days must be a positive integer");
  }
  if (
    value.limit !== undefined &&
    (!Number.isSafeInteger(value.limit) || (value.limit as number) < 1)
  ) {
    throw new Error("config.limit must be a positive integer");
  }

  if (value.custom !== undefined) {
    if (!Array.isArray(value.custom))
      throw new Error("config.custom must be an array");
    value.custom.forEach(validateCustomDefinition);
  }
}

function validateCustomDefinition(value: unknown, index: number): void {
  if (!isRecord(value))
    throw new Error(`config.custom[${index}] must be an object`);
  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error(`config.custom[${index}].name must be a non-empty string`);
  }
  if (value.id !== undefined && typeof value.id !== "string") {
    throw new Error(`config.custom[${index}].id must be a string`);
  }
  if (typeof value.id === "string" && value.id.trim() === "") {
    throw new Error(`config.custom[${index}].id must not be empty`);
  }
  if (
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    throw new Error(`config.custom[${index}].description must be a string`);
  }
  validateStringArray(value.paths, `custom[${index}].paths`, true);
  if (
    value.safety !== undefined &&
    (typeof value.safety !== "string" ||
      !SAFETY_VALUES.has(value.safety as CacheSafety))
  ) {
    throw new Error(`config.custom[${index}].safety is invalid`);
  }
  validateStringArray(value.consequences, `custom[${index}].consequences`);
}

function validateStringArray(
  value: unknown,
  name: string,
  required = false,
): void {
  if (value === undefined && !required) return;
  if (
    !Array.isArray(value) ||
    (required && value.length === 0) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`config.${name} must be an array of strings`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getCustomDefinitions(
  config: NukecacheConfig,
): CustomCacheDefinition[] {
  return config.custom ?? [];
}
