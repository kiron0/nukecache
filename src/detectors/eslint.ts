import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

export const eslintDetector: CacheDetector = {
  id: "eslint",
  name: "ESLint",
  async detect(context) {
    return existingCandidates(context, [
      candidate(
        "eslint",
        "ESLint cache",
        ".eslintcache",
        "eslint",
        "File lint results cached by ESLint.",
        ["Next cached lint run checks every file again."],
      ),
      candidate(
        "eslint-cache-directory",
        "ESLint cache",
        ".cache/eslint",
        "eslint",
        "File lint results cached by ESLint.",
        ["Next cached lint run checks every file again."],
      ),
      candidate(
        "eslint-node-cache",
        "ESLint cache",
        "node_modules/.cache/eslint",
        "eslint",
        "File lint results cached by ESLint.",
        ["Next cached lint run checks every file again."],
      ),
    ]);
  },
};
