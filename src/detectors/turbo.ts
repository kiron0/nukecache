import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

const TURBO_PATHS: Array<[id: string, path: string]> = [
  ["turbo", ".turbo"],
  ["turbo-node-cache", "node_modules/.cache/turbo"],
];

const TURBO_DESC = "Cached task outputs and metadata from Turborepo.";
const TURBO_CONSEQ = [
  "Affected tasks run again instead of replaying cached output.",
];

export const turboDetector: CacheDetector = {
  id: "turbo",
  name: "Turborepo",
  async detect(context) {
    return existingCandidates(
      context,
      TURBO_PATHS.map(([id, path]) =>
        candidate(
          id,
          "Turborepo cache",
          path,
          "turbo",
          TURBO_DESC,
          TURBO_CONSEQ,
        ),
      ),
    );
  },
};
