import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

export const nextDetector: CacheDetector = {
  id: "next",
  name: "Next.js",
  async detect(context) {
    return existingCandidates(context, [
      candidate(
        "next",
        "Next.js cache",
        ".next/cache",
        "next",
        "Reusable Next.js compiler and build artifacts.",
        ["Next.js rebuilds this cache; next build may take longer."],
      ),
    ]);
  },
};
