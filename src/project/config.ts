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

export function configCollisionMessage(names: string[]): string {
  return (
    `Multiple configuration files found: ${names.join(", ")}.\n` +
    "Having multiple configuration files causes ambiguous settings across binary commands (nukecache, nkc, ncache)."
  );
}

export async function loadConfig(root: string): Promise<NukecacheConfig> {
  const existing = findExistingConfigFiles(root);
  if (existing.length > 1) {
    const names = existing.map((filepath) => basename(filepath));
    throw new Error(
      `${configCollisionMessage(names)} Please remove duplicate config files.`,
    );
  }

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
  const payload: NukecacheConfig = {
    $schema: config.$schema ?? CONFIG_SCHEMA_URL,
    ...config,
  };
  validateConfig(payload);
  const path = configPath(root);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return path;
}

export function findExistingConfigFiles(root: string): string[] {
  const found: string[] = [];
  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve(root, filename);
    if (existsSync(candidate)) found.push(candidate);
  }
  return found;
}

export function configPath(root: string): string {
  const found = findExistingConfigFiles(root);
  if (found.length > 0) return found[0] as string;
  return resolve(root, CONFIG_FILENAME);
}

export const CONFIG_SCHEMA_URL = "https://nukecache.js.org/schema.json";

const ALLOWED_CONFIG_KEYS = new Set([
  "$schema",
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
]);

function validateConfig(value: unknown): asserts value is NukecacheConfig {
  if (!isRecord(value)) {
    throw new Error(`${CONFIG_FILENAME} must contain a JSON object`);
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) {
      throw new Error(`Unexpected config property: "${key}"`);
    }
  }
  if (value.$schema !== undefined && typeof value.$schema !== "string") {
    throw new Error("config.$schema must be a string");
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
  const booleanKeys = [
    "showGlobal",
    "dryRun",
    "safe",
    "force",
    "json",
    "noUpdateCheck",
  ] as const;
  for (const key of booleanKeys) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") {
      throw new Error(`config.${key} must be a boolean`);
    }
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
  for (const intKey of ["days", "limit"] as const) {
    const val = value[intKey];
    if (
      val !== undefined &&
      (!Number.isSafeInteger(val) || (val as number) < 1)
    ) {
      throw new Error(`config.${intKey} must be a positive integer`);
    }
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
