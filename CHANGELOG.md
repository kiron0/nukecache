# Changelog

## 0.6.0

- Remove programmatic API (`src/index.ts`, CJS/ESM library exports, type declarations). CLI-only distribution.
- Drop `main`, `module`, `types`, and `exports` fields from `package.json`. Build produces only `dist/cli.js`.
- Fix Windows command execution: replace `resolveExecutable` wrapper with `shell: true` on Win32 in `runCommand` and `installUpdate`.
- Fix `installUpdate` to pass `shell: process.platform === "win32"` to `spawn` instead of resolving `npm.cmd` manually.
- Export `installUpdate` from public API (was missing).
- Restrict CI workflow triggers to `main` branch for both `push` and `pull_request` events.
- Expand test coverage for cleanup, detection, and safety-matrix edge cases.
- Add `sweep <dir>` command: walk a directory tree, find all project roots, detect caches per project, display a sorted table with project, cache path, size, and age. Supports `--days`/`--min-age` to filter by cache age, `--dry-run`, `--json`, and interactive multi-select cleanup.
- Add `reclaim <size>` command: parse a human-readable size target (e.g. `5gb`, `500mb`), auto-select the safest candidates (safe → oldest → largest) until the target is met, display a plan, and confirm before deleting. Supports `--dry-run`, `--yes`, and `--json`.
- Add runtime active-process protection: automatically scan running dev servers (`next dev`, `vite`, `turbo`, `jest --watch`, `vitest`, `playwright`, `cypress`); skip active caches with PID indicator unless `--force` is used.
- Add `orphaned` command and `--orphaned` flag: detect caches whose tools, dependencies, or configuration files no longer exist in the project; preview with `--dry-run` or clear interactively.
- Add Docker build cache support (`nkc list --docker`, `nkc clean --docker`): inspect build cache size with `docker system df` and prune safely with `docker builder prune`.

## 0.5.0

- Support configuration aliases (`nkc.config.json`, `ncache.config.json`) alongside `nukecache.config.json`.
- Add JSON Schema hosted at `https://nukecache.js.org/schema.json` with strict validation.
- Detect multiple config file collisions, providing interactive deletion options to avoid ambiguous behavior.
- Expand project configuration with `defaultScope`, `dryRun`, `safe`, `force`, `json`, `packageManagers`, `days`, `limit`, and `noUpdateCheck` options.
- Add `--check-update` CLI option and `check-update` command with 60s cooldown rate limiting.
- Add rich project overview header (`formatProjectSummary`) before interactive cache selection.
- Add cache safety hints directly in interactive multiselect options.
- Standardize friendly exit thanks message on all successful commands, cancellations, and errors.
- Shorten update check interval to 6 hours for faster release discovery.

## 0.4.0

- Add `nkc` and `ncache` command shortcuts (aliases) for `nukecache` in `package.json`.
- Add `config` inspection and atomic updates, plus nearby command suggestions with structured CLI errors.
- Add a complete Clack configuration workflow.

## 0.3.0

- Add automatic update checks with cached registry results, interactive update choices, release ignoring, and automation opt-outs.
- Add `largest`, `old`, and `explain` inspection commands with JSON output and cache timestamps.
- Make cache scans faster with bounded concurrent filesystem traversal, batched Git checks, and lower-overhead root detection.
- Fix Bun cache detection and cleanup outside package directories, including home-directory scans.
- Keep package-manager caches global under home-like roots and remove project-local Yarn caches through guarded filesystem cleanup.
- Add 250+ unit, integration, security, compatibility, argument, output, and semantic-version tests.

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
