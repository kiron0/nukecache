import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    minify: false,
    platform: "node",
    target: "node20",
    treeshake: true,
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    minify: false,
    platform: "node",
    target: "node20",
    treeshake: true,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
