import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

export const turboDetector: CacheDetector = {
  id: "turbo",
  name: "Turborepo",
  async detect(context) {
    return existingCandidates(context, [
      candidate(
        "turbo",
        "Turborepo cache",
        ".turbo",
        "turbo",
        "Cached task outputs and metadata from Turborepo.",
        ["Affected tasks run again instead of replaying cached output."],
      ),
      candidate(
        "turbo-node-cache",
        "Turborepo cache",
        "node_modules/.cache/turbo",
        "turbo",
        "Cached task outputs stored under node_modules.",
        ["Affected tasks run again instead of replaying cached output."],
      ),
    ]);
  },
};
