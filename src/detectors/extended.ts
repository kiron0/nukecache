import type { CacheDetector } from "../types";
import { candidate, existingCandidates } from "./helpers";

const EXTENDED_TOOLS: Array<
  [
    id: string,
    name: string,
    path: string,
    tool: string,
    description: string,
    consequences: string[],
    safety?: "rebuild",
  ]
> = [
  [
    "nx",
    "Nx cache",
    ".nx/cache",
    "nx",
    "Cached task outputs and metadata from Nx.",
    ["Affected tasks run again instead of using cached output."],
  ],
  [
    "parcel",
    "Parcel cache",
    ".parcel-cache",
    "parcel",
    "Compiled assets and dependency metadata from Parcel.",
    ["Next Parcel build performs more work."],
  ],
  [
    "jest",
    "Jest cache",
    ".jest-cache",
    "jest",
    "Transformed modules and dependency metadata cached by Jest.",
    ["Next Jest run transforms affected modules again."],
  ],
  [
    "vitest",
    "Vitest cache",
    ".vitest",
    "vitest",
    "Test result and module metadata cached by Vitest.",
    ["Next Vitest run rebuilds its cache."],
  ],
  [
    "playwright",
    "Playwright project cache",
    ".cache/ms-playwright",
    "playwright",
    "Project-local browser binaries downloaded by Playwright.",
    ["Playwright may need to download browser binaries again."],
    "rebuild",
  ],
  [
    "cypress",
    "Cypress project cache",
    ".cache/Cypress",
    "cypress",
    "Project-local Cypress binary cache.",
    ["Cypress may need to download its binary again."],
    "rebuild",
  ],
  [
    "babel",
    "Babel cache",
    ".babel-cache",
    "babel",
    "Transformed source cached by Babel tooling.",
    ["Next Babel build recompiles affected modules."],
  ],
  [
    "swc",
    "SWC cache",
    ".swc",
    "swc",
    "Transformed source cached by SWC tooling.",
    ["Next SWC build recompiles affected modules."],
  ],
  [
    "angular",
    "Angular CLI cache",
    ".angular/cache",
    "angular",
    "Persistent build cache created by Angular CLI.",
    ["Next Angular build performs more work."],
  ],
  [
    "yarn-project-cache",
    "Yarn project cache",
    ".yarn/cache",
    "yarn",
    "Project-local package archives used by modern Yarn.",
    ["A network install may be required unless another mirror is available."],
    "rebuild",
  ],
];

export const extendedToolDetector: CacheDetector = {
  id: "extended-tools",
  name: "Additional development tools",
  async detect(context) {
    return existingCandidates(
      context,
      EXTENDED_TOOLS.map((item) => candidate(...item)),
    );
  },
};
