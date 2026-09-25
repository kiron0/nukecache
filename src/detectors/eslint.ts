import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

const ESLINT_PATHS: Array<[id: string, path: string]> = [
  ["eslint", ".eslintcache"],
  ["eslint-cache-directory", ".cache/eslint"],
  ["eslint-node-cache", "node_modules/.cache/eslint"],
];

const ESLINT_DESC = "File lint results cached by ESLint.";
const ESLINT_CONSEQ = ["Next cached lint run checks every file again."];

export const eslintDetector: CacheDetector = {
  id: "eslint",
  name: "ESLint",
  async detect(context) {
    return existingCandidates(
      context,
      ESLINT_PATHS.map(([id, path]) =>
        candidate(
          id,
          "ESLint cache",
          path,
          "eslint",
          ESLINT_DESC,
          ESLINT_CONSEQ,
        ),
      ),
    );
  },
};
