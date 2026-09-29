import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    clean: true,
    minify: false,
    platform: "node",
    target: "node20",
    treeshake: true,
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
