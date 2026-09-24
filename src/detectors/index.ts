import type { CacheDetector } from "../types";
import { eslintDetector } from "./eslint";
import { genericDetector } from "./generic";
import { nextDetector } from "./next";
import { turboDetector } from "./turbo";
import { typescriptDetector } from "./typescript";
import { viteDetector } from "./vite";

export const builtInDetectors: readonly CacheDetector[] = [
  nextDetector,
  viteDetector,
  turboDetector,
  eslintDetector,
  typescriptDetector,
  genericDetector,
];

export {
  eslintDetector,
  genericDetector,
  nextDetector,
  turboDetector,
  typescriptDetector,
  viteDetector,
};
