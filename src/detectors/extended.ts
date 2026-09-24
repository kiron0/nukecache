import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

export const extendedToolDetector: CacheDetector = {
  id: "extended-tools",
  name: "Additional development tools",
  async detect(context) {
    return existingCandidates(context, [
      candidate(
        "nx",
        "Nx cache",
        ".nx/cache",
        "nx",
        "Cached task outputs and metadata from Nx.",
        ["Affected tasks run again instead of using cached output."],
      ),
      candidate(
        "parcel",
        "Parcel cache",
        ".parcel-cache",
        "parcel",
        "Compiled assets and dependency metadata from Parcel.",
        ["Next Parcel build performs more work."],
      ),
      candidate(
        "jest",
        "Jest cache",
        ".jest-cache",
        "jest",
        "Transformed modules and dependency metadata cached by Jest.",
        ["Next Jest run transforms affected modules again."],
      ),
      candidate(
        "vitest",
        "Vitest cache",
        ".vitest",
        "vitest",
        "Test result and module metadata cached by Vitest.",
        ["Next Vitest run rebuilds its cache."],
      ),
      candidate(
        "playwright",
        "Playwright project cache",
        ".cache/ms-playwright",
        "playwright",
        "Project-local browser binaries downloaded by Playwright.",
        ["Playwright may need to download browser binaries again."],
        "rebuild",
      ),
      candidate(
        "cypress",
        "Cypress project cache",
        ".cache/Cypress",
        "cypress",
        "Project-local Cypress binary cache.",
        ["Cypress may need to download its binary again."],
        "rebuild",
      ),
      candidate(
        "babel",
        "Babel cache",
        ".babel-cache",
        "babel",
        "Transformed source cached by Babel tooling.",
        ["Next Babel build recompiles affected modules."],
      ),
      candidate(
        "swc",
        "SWC cache",
        ".swc",
        "swc",
        "Transformed source cached by SWC tooling.",
        ["Next SWC build recompiles affected modules."],
      ),
      candidate(
        "angular",
        "Angular CLI cache",
        ".angular/cache",
        "angular",
        "Persistent build cache created by Angular CLI.",
        ["Next Angular build performs more work."],
      ),
      candidate(
        "yarn-project-cache",
        "Yarn project cache",
        ".yarn/cache",
        "yarn",
        "Project-local package archives used by modern Yarn.",
        [
          "A network install may be required unless another mirror is available.",
        ],
        "rebuild",
      ),
    ]);
  },
};
