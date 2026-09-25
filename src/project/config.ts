import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CacheSafety,
  CustomCacheDefinition,
  NukecacheConfig,
} from "../types";

const CONFIG_FILENAME = "nukecache.config.json";
const SAFETY_VALUES = new Set<CacheSafety>([
  "safe",
  "rebuild",
  "reinstall",
  "global",
  "dangerous",
]);

export async function loadConfig(root: string): Promise<NukecacheConfig> {
  const path = resolve(root, CONFIG_FILENAME);
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
    throw new Error(`Invalid ${CONFIG_FILENAME}: ${(error as Error).message}`, {
      cause: error,
    });
  }

  if (!isRecord(value))
    throw new Error(`${CONFIG_FILENAME} must contain a JSON object`);
  validateStringArray(value.ignore, "ignore");
  validateStringArray(value.include, "include");
  if (value.defaultScope !== undefined && value.defaultScope !== "project") {
    throw new Error("config.defaultScope must be project");
  }
  if (value.showGlobal !== undefined && typeof value.showGlobal !== "boolean") {
    throw new Error("config.showGlobal must be a boolean");
  }

  if (value.custom !== undefined) {
    if (!Array.isArray(value.custom))
      throw new Error("config.custom must be an array");
    value.custom.forEach(validateCustomDefinition);
  }

  return value;
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
