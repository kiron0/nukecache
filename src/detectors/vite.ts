import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

export const viteDetector: CacheDetector = {
  id: "vite",
  name: "Vite",
  async detect(context) {
    return existingCandidates(context, [
      candidate(
        "vite",
        "Vite dependency cache",
        "node_modules/.vite",
        "vite",
        "Pre-bundled dependencies produced by Vite.",
        ["Vite pre-bundles dependencies again on next start."],
      ),
      candidate(
        "vite-local",
        "Vite cache",
        ".vite",
        "vite",
        "Local cache produced by Vite-compatible tooling.",
        ["Next development start may take longer."],
      ),
    ]);
  },
};
