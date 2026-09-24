# Changelog

## 0.2.0

- Add explicit global cache inspection and native cleanup for npm, pnpm, Yarn, and Bun.
- Detect package managers from manifest metadata and lockfiles, with manager-specific commands and non-fatal detection warnings.
- Add Nx, Parcel, Angular CLI, Jest, Vitest, Playwright, Cypress, Babel, SWC, and Yarn project-cache detection.
- Separate project and global output, protect global cleanup behind explicit flags and confirmation, and report actual post-cleanup bytes freed.
- Harden cleanup against Git inspection failures, concurrent cache changes, environment files, additional lockfiles, and database files.

## 0.1.0

- Add Next.js, Vite, Turborepo, TypeScript, ESLint, and generic project-cache detectors.
- Add exact size calculation, interactive selection, dry runs, JSON output, and cleanup summaries.
- Add Git tracking checks, project-boundary enforcement, symlink protection, protected-path guards, and post-delete verification.
- Add custom project configuration and public programmatic API.
- Add CI-gated GitHub releases with compact changelog notes.
