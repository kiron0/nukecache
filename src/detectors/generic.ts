import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

export const genericDetector: CacheDetector = {
  id: "node-modules-cache",
  name: "Tool cache",
  async detect(context) {
    return existingCandidates(context, [
      candidate(
        "node-modules-cache",
        "node_modules tool cache",
        "node_modules/.cache",
        "node",
        "Caches created by development tools under node_modules.",
        ["Development tools recreate required entries on demand."],
      ),
    ]);
  },
};
