import { describe, expect, it } from "vitest";

import {
  CONFIG_FILENAMES,
  CONFIG_SCHEMA_URL,
  configCollisionMessage,
  validateConfig,
} from "../src/project/config";
import type { NukecacheConfig } from "../src/types";

describe("config validation matrix - valid configurations", () => {
  const validCases: Array<[string, NukecacheConfig]> = [
    ["empty config", {}],
    ["schema with hosted url", { $schema: CONFIG_SCHEMA_URL }],
    ["schema with local path", { $schema: "./schema.json" }],
    ["defaultScope project", { defaultScope: "project" }],
    ["defaultScope global", { defaultScope: "global" }],
    ["defaultScope all", { defaultScope: "all" }],
    ["showGlobal true", { showGlobal: true }],
    ["showGlobal false", { showGlobal: false }],
    ["dryRun true", { dryRun: true }],
    ["dryRun false", { dryRun: false }],
    ["safe true", { safe: true }],
    ["safe false", { safe: false }],
    ["force true", { force: true }],
    ["force false", { force: false }],
    ["json true", { json: true }],
    ["json false", { json: false }],
    ["noUpdateCheck true", { noUpdateCheck: true }],
    ["noUpdateCheck false", { noUpdateCheck: false }],
    ["packageManagers empty", { packageManagers: [] }],
    ["packageManagers npm", { packageManagers: ["npm"] }],
    ["packageManagers pnpm", { packageManagers: ["pnpm"] }],
    ["packageManagers yarn", { packageManagers: ["yarn"] }],
    ["packageManagers bun", { packageManagers: ["bun"] }],
    ["packageManagers npm and pnpm", { packageManagers: ["npm", "pnpm"] }],
    ["packageManagers yarn and bun", { packageManagers: ["yarn", "bun"] }],
    [
      "packageManagers all four",
      { packageManagers: ["npm", "pnpm", "yarn", "bun"] },
    ],
    ["days 1", { days: 1 }],
    ["days 2", { days: 2 }],
    ["days 7", { days: 7 }],
    ["days 14", { days: 14 }],
    ["days 30", { days: 30 }],
    ["days 90", { days: 90 }],
    ["days 365", { days: 365 }],
    ["days 1000", { days: 1000 }],
    ["limit 1", { limit: 1 }],
    ["limit 3", { limit: 3 }],
    ["limit 5", { limit: 5 }],
    ["limit 10", { limit: 10 }],
    ["limit 20", { limit: 20 }],
    ["limit 50", { limit: 50 }],
    ["limit 100", { limit: 100 }],
    ["limit 500", { limit: 500 }],
    ["ignore empty", { ignore: [] }],
    ["ignore single item", { ignore: ["vite"] }],
    ["ignore multiple paths", { ignore: [".cache", "node_modules/.vite"] }],
    ["ignore three entries", { ignore: ["a", "b", "c"] }],
    ["include empty", { include: [] }],
    ["include single item", { include: ["dist"] }],
    ["include multiple paths", { include: ["build", ".output"] }],
    ["custom empty array", { custom: [] }],
    [
      "custom minimal",
      { custom: [{ name: "my-cache", paths: [".cache/my"] }] },
    ],
    [
      "custom with id",
      { custom: [{ id: "c1", name: "Custom 1", paths: ["dist/c"] }] },
    ],
    [
      "custom safety safe",
      { custom: [{ name: "c", paths: ["p"], safety: "safe" }] },
    ],
    [
      "custom safety rebuild",
      { custom: [{ name: "c", paths: ["p"], safety: "rebuild" }] },
    ],
    [
      "custom safety reinstall",
      { custom: [{ name: "c", paths: ["p"], safety: "reinstall" }] },
    ],
    [
      "custom safety global",
      { custom: [{ name: "c", paths: ["p"], safety: "global" }] },
    ],
    [
      "custom safety dangerous",
      { custom: [{ name: "c", paths: ["p"], safety: "dangerous" }] },
    ],
    [
      "custom with description",
      { custom: [{ name: "c", paths: ["p"], description: "test desc" }] },
    ],
    [
      "custom consequences empty",
      { custom: [{ name: "c", paths: ["p"], consequences: [] }] },
    ],
    [
      "custom consequences with items",
      {
        custom: [{ name: "c", paths: ["p"], consequences: ["rebuild needed"] }],
      },
    ],
    [
      "complete config with all fields",
      {
        $schema: CONFIG_SCHEMA_URL,
        defaultScope: "project",
        showGlobal: false,
        dryRun: false,
        safe: true,
        force: false,
        json: true,
        noUpdateCheck: true,
        packageManagers: ["npm", "pnpm"],
        days: 30,
        limit: 10,
        ignore: ["vite"],
        include: ["dist"],
        custom: [
          {
            id: "custom-build",
            name: "Custom Build",
            description: "Build outputs",
            paths: [".build"],
            safety: "rebuild",
            consequences: ["Builds again"],
          },
        ],
      },
    ],
  ];

  it.each(validCases)("accepts %s", (_, config) => {
    expect(() => validateConfig(config)).not.toThrow();
  });
});

describe("config validation matrix - invalid configurations", () => {
  const invalidCases: Array<[string, unknown, string]> = [
    ["null value", null, "must contain a JSON object"],
    ["undefined value", undefined, "must contain a JSON object"],
    ["string root", "string", "must contain a JSON object"],
    ["number root", 42, "must contain a JSON object"],
    ["boolean root", true, "must contain a JSON object"],
    ["array root", [], "must contain a JSON object"],
    [
      "unknown key invalidKey",
      { invalidKey: true },
      'Unexpected config property: "invalidKey"',
    ],
    [
      "unknown key caches",
      { caches: [] },
      'Unexpected config property: "caches"',
    ],
    [
      "unknown key verbose",
      { verbose: true },
      'Unexpected config property: "verbose"',
    ],
    [
      "unknown key timeout",
      { timeout: 100 },
      'Unexpected config property: "timeout"',
    ],
    [
      "unknown key recursive",
      { recursive: false },
      'Unexpected config property: "recursive"',
    ],
    ["$schema number", { $schema: 123 }, "config.$schema must be a string"],
    ["$schema boolean", { $schema: true }, "config.$schema must be a string"],
    ["$schema array", { $schema: [] }, "config.$schema must be a string"],
    ["$schema object", { $schema: {} }, "config.$schema must be a string"],
    [
      "defaultScope workspace",
      { defaultScope: "workspace" },
      "config.defaultScope must be project, global, or all",
    ],
    [
      "defaultScope local",
      { defaultScope: "local" },
      "config.defaultScope must be project, global, or all",
    ],
    [
      "defaultScope empty string",
      { defaultScope: "" },
      "config.defaultScope must be project, global, or all",
    ],
    [
      "defaultScope number",
      { defaultScope: 123 },
      "config.defaultScope must be project, global, or all",
    ],
    [
      "defaultScope boolean",
      { defaultScope: true },
      "config.defaultScope must be project, global, or all",
    ],
    [
      "showGlobal string",
      { showGlobal: "true" },
      "config.showGlobal must be a boolean",
    ],
    [
      "showGlobal number",
      { showGlobal: 1 },
      "config.showGlobal must be a boolean",
    ],
    ["dryRun string", { dryRun: "false" }, "config.dryRun must be a boolean"],
    ["dryRun null", { dryRun: null }, "config.dryRun must be a boolean"],
    ["safe string", { safe: "yes" }, "config.safe must be a boolean"],
    ["safe array", { safe: [] }, "config.safe must be a boolean"],
    ["force number", { force: 0 }, "config.force must be a boolean"],
    ["force object", { force: {} }, "config.force must be a boolean"],
    ["json string", { json: "json" }, "config.json must be a boolean"],
    ["json number", { json: 1 }, "config.json must be a boolean"],
    [
      "noUpdateCheck string",
      { noUpdateCheck: "1" },
      "config.noUpdateCheck must be a boolean",
    ],
    [
      "noUpdateCheck null",
      { noUpdateCheck: null },
      "config.noUpdateCheck must be a boolean",
    ],
    [
      "packageManagers string",
      { packageManagers: "npm" },
      "config.packageManagers must be an array",
    ],
    [
      "packageManagers invalid string item",
      { packageManagers: ["invalid"] },
      "config.packageManagers must be an array of npm, pnpm, yarn, or bun",
    ],
    [
      "packageManagers cargo",
      { packageManagers: ["cargo"] },
      "config.packageManagers must be an array of npm, pnpm, yarn, or bun",
    ],
    [
      "packageManagers mixed with invalid",
      { packageManagers: ["npm", "pip"] },
      "config.packageManagers must be an array of npm, pnpm, yarn, or bun",
    ],
    [
      "packageManagers number item",
      { packageManagers: [123] },
      "config.packageManagers must be an array of npm, pnpm, yarn, or bun",
    ],
    [
      "packageManagers null item",
      { packageManagers: [null] },
      "config.packageManagers must be an array of npm, pnpm, yarn, or bun",
    ],
    ["days 0", { days: 0 }, "config.days must be a positive integer"],
    ["days -1", { days: -1 }, "config.days must be a positive integer"],
    ["days -10", { days: -10 }, "config.days must be a positive integer"],
    ["days float", { days: 1.5 }, "config.days must be a positive integer"],
    ["days string", { days: "7" }, "config.days must be a positive integer"],
    ["days boolean", { days: true }, "config.days must be a positive integer"],
    ["days null", { days: null }, "config.days must be a positive integer"],
    ["days array", { days: [] }, "config.days must be a positive integer"],
    ["limit 0", { limit: 0 }, "config.limit must be a positive integer"],
    ["limit -5", { limit: -5 }, "config.limit must be a positive integer"],
    ["limit float", { limit: 2.5 }, "config.limit must be a positive integer"],
    [
      "limit string",
      { limit: "10" },
      "config.limit must be a positive integer",
    ],
    [
      "limit boolean",
      { limit: false },
      "config.limit must be a positive integer",
    ],
    ["limit null", { limit: null }, "config.limit must be a positive integer"],
    [
      "ignore string",
      { ignore: "path" },
      "config.ignore must be an array of strings",
    ],
    [
      "ignore number array",
      { ignore: [123] },
      "config.ignore must be an array of strings",
    ],
    [
      "ignore empty string item",
      { ignore: [""] },
      "config.ignore must be an array of strings",
    ],
    [
      "ignore whitespace item",
      { ignore: ["   "] },
      "config.ignore must be an array of strings",
    ],
    [
      "ignore null item",
      { ignore: [null] },
      "config.ignore must be an array of strings",
    ],
    [
      "include string",
      { include: "dist" },
      "config.include must be an array of strings",
    ],
    [
      "include number item",
      { include: [456] },
      "config.include must be an array of strings",
    ],
    [
      "include empty string item",
      { include: [""] },
      "config.include must be an array of strings",
    ],
    [
      "include whitespace item",
      { include: ["   "] },
      "config.include must be an array of strings",
    ],
    ["custom string", { custom: "custom" }, "config.custom must be an array"],
    [
      "custom null item",
      { custom: [null] },
      "config.custom[0] must be an object",
    ],
    [
      "custom string item",
      { custom: ["item"] },
      "config.custom[0] must be an object",
    ],
    [
      "custom empty object",
      { custom: [{}] },
      "config.custom[0].name must be a non-empty string",
    ],
    [
      "custom empty name",
      { custom: [{ name: "" }] },
      "config.custom[0].name must be a non-empty string",
    ],
    [
      "custom whitespace name",
      { custom: [{ name: "   " }] },
      "config.custom[0].name must be a non-empty string",
    ],
    [
      "custom number name",
      { custom: [{ name: 123 }] },
      "config.custom[0].name must be a non-empty string",
    ],
    [
      "custom empty paths",
      { custom: [{ name: "test", paths: [] }] },
      "config.custom[0].paths must be an array of strings",
    ],
    [
      "custom empty path string",
      { custom: [{ name: "test", paths: [""] }] },
      "config.custom[0].paths must be an array of strings",
    ],
    [
      "custom whitespace path string",
      { custom: [{ name: "test", paths: ["   "] }] },
      "config.custom[0].paths must be an array of strings",
    ],
    [
      "custom number in paths",
      { custom: [{ name: "test", paths: [123] }] },
      "config.custom[0].paths must be an array of strings",
    ],
    [
      "custom number id",
      { custom: [{ name: "test", paths: ["a"], id: 123 }] },
      "config.custom[0].id must be a string",
    ],
    [
      "custom empty id",
      { custom: [{ name: "test", paths: ["a"], id: "" }] },
      "config.custom[0].id must not be empty",
    ],
    [
      "custom whitespace id",
      { custom: [{ name: "test", paths: ["a"], id: "   " }] },
      "config.custom[0].id must not be empty",
    ],
    [
      "custom number description",
      { custom: [{ name: "test", paths: ["a"], description: 123 }] },
      "config.custom[0].description must be a string",
    ],
    [
      "custom invalid safety string",
      { custom: [{ name: "test", paths: ["a"], safety: "super-safe" }] },
      "config.custom[0].safety is invalid",
    ],
    [
      "custom number safety",
      { custom: [{ name: "test", paths: ["a"], safety: 123 }] },
      "config.custom[0].safety is invalid",
    ],
    [
      "custom string consequences",
      { custom: [{ name: "test", paths: ["a"], consequences: "bad" }] },
      "config.custom[0].consequences must be an array of strings",
    ],
    [
      "custom number consequences",
      { custom: [{ name: "test", paths: ["a"], consequences: [123] }] },
      "config.custom[0].consequences must be an array of strings",
    ],
    [
      "custom empty string consequences",
      { custom: [{ name: "test", paths: ["a"], consequences: [""] }] },
      "config.custom[0].consequences must be an array of strings",
    ],
  ];

  it.each(invalidCases)("rejects %s", (_, config, expectedMessage) => {
    expect(() => validateConfig(config)).toThrow(expectedMessage);
  });
});

describe("config filenames and collision formatting", () => {
  it.each(CONFIG_FILENAMES)(
    "recognizes supported config filename %s",
    (filename) => {
      expect(filename.endsWith(".config.json")).toBe(true);
    },
  );

  const collisionCases: Array<[string[], string]> = [
    [
      ["nukecache.config.json", "nkc.config.json"],
      "nukecache.config.json, nkc.config.json",
    ],
    [
      ["nukecache.config.json", "ncache.config.json"],
      "nukecache.config.json, ncache.config.json",
    ],
    [
      ["nukecache.config.json", "nkc.config.json", "ncache.config.json"],
      "nukecache.config.json, nkc.config.json, ncache.config.json",
    ],
  ];

  it.each(collisionCases)(
    "formats collision message for %j",
    (names, expectedSnippet) => {
      const message = configCollisionMessage(names);
      expect(message).toContain(expectedSnippet);
      expect(message).toContain("Multiple configuration files found:");
      expect(message).toContain("ambiguous settings across binary commands");
    },
  );
});
