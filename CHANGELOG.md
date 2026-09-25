# Changelog

## 0.3.0

- Add automatic update checks with cached registry results, interactive update choices, release ignoring, and automation opt-outs.
- Add `largest`, `old`, and `explain` inspection commands with JSON output and cache timestamps.
- Make cache scans faster with bounded concurrent filesystem traversal, batched Git checks, and lower-overhead root detection.
- Fix Bun cache detection and cleanup outside package directories, including home-directory scans.
- Keep package-manager caches global under home-like roots and remove project-local Yarn caches through guarded filesystem cleanup.
- Add 250+ unit, integration, security, compatibility, argument, output, and semantic-version tests.
- Add `config` inspection and atomic updates, plus nearby command suggestions with structured CLI errors.
- Add a complete Clack configuration workflow and concise aliases for every command and common option.

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
