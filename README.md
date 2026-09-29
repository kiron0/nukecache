# nukecache

> Detect, inspect, and safely clear development caches from one CLI.

[![npm version](https://img.shields.io/npm/v/nukecache.svg)](https://www.npmjs.com/package/nukecache)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-nukecache.js.org-blue)](https://nukecache.js.org)

Full documentation and guides available at **[nukecache.js.org](https://nukecache.js.org)**.

---

## Quick Install

```bash
npm install -g nukecache
```

Commands: `nukecache` (shortcuts: `nkc`, `ncache`). Requires Node.js 20+.

## Common Commands

```bash
# Interactive cleanup (Clack UI)
nkc

# Preview cleanup without deleting
nkc --dry-run

# Inspect detected project caches
nkc list
nkc list --json

# Rank caches by disk size
nkc largest --limit 10

# Find caches untouched for 30+ days
nkc old --days 30

# Explain why a cache exists
nkc explain vite

# Interactive project configuration
nkc config

# Global package-manager caches (opt-in)
nkc list --global
nkc clean --safe --yes
```

## Features

- **Project caches**: Next.js, Vite, Turborepo, TypeScript, ESLint, Nx, Parcel, Angular CLI, Vitest, Jest, Playwright, Cypress, Babel, SWC, and Yarn `.yarn/cache`.
- **Global package managers**: npm, pnpm, Yarn, Bun (always opt-in, runs native CLI commands).
- **Safe by default**: ignores Git-tracked files, preserves symlinks, rejects protected files (`.env`, lockfiles, source files).
- **Interactive UI**: intuitive Clack terminal workflows with automatic update checks.
- **Configurable**: project-level settings via `nukecache.config.json`.

## Advanced Commands

```bash
# Sweep all projects across a directory
nkc sweep ~/Code --days 30

# Auto-reclaim a specific amount of disk space
nkc reclaim 5gb
nkc reclaim 500mb --dry-run

# Detect & clean caches whose tool was removed
nkc orphaned
nkc clean --orphaned

# Inspect and prune Docker build cache
nkc list --docker
nkc clean --docker
```

## License

[MIT](LICENSE)
