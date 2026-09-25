# nukecache

Detect, inspect, and safely clear development caches from one CLI.

`nukecache` finds supported project and package-manager caches, measures them, explains what created them, and removes only targets you approve. Project cleanup is the default; global package-manager cleanup is always opt-in.

## Install

```bash
npm install -g nukecache
```

Node.js 20 or newer is required.

## Usage

```bash
# Interactive detection and cleanup
nukecache

# Inspection only
nukecache list

# Machine-readable inspection
nukecache list --json

# Rank caches by disk usage
nukecache largest --limit 10

# Find caches unchanged for 30 days
nukecache old --days 30

# Explain a cache by ID, tool, name, or path
nukecache explain vite

# Inspect or update project configuration
nukecache config
nukecache cfg
nukecache config set showGlobal true
nukecache config set ignore '["vite", "turbo"]'
nukecache config unset showGlobal

# Preview safe cleanup
nukecache --dry-run

# Non-interactive safe cleanup
nukecache clean --safe --yes

# Inspect detected npm, pnpm, Yarn, and Bun global caches
nukecache list --global

# Inspect or clean one package manager
nukecache npm --dry-run
nukecache pnpm

# Explicit non-interactive global cleanup
nukecache clean --global --force --yes

# Include project caches in a global scan
nukecache list --global --project
```

Scan another project or skip a detector:

```bash
nukecache list --cwd ../my-app
nukecache --ignore turbo
```

## Update checks

Every invocation checks a cached npm registry result. Registry requests occur at most once every 12 hours and time out quickly. When a newer version exists, interactive terminals can update immediately, skip once, or hide that release. JSON output remains valid; update notices use stderr.

Disable the check for one run or an automated environment:

```bash
nukecache --no-update-check
NUKECACHE_NO_UPDATE_CHECK=1 nukecache list --json
```

Updates use `npm install --global nukecache@<version>` only after explicit confirmation.

## Supported caches

Project cache detection includes:

- Next.js: `.next/cache`
- Vite: `node_modules/.vite`, `.vite`
- Turborepo: `.turbo`, `node_modules/.cache/turbo`
- TypeScript: `*.tsbuildinfo`
- ESLint: `.eslintcache` and common cache directories
- Generic tool caches: `node_modules/.cache`
- Nx: `.nx/cache`
- Parcel: `.parcel-cache`
- Angular CLI: `.angular/cache`
- Jest and Vitest project caches
- Playwright and Cypress project-local binary caches
- Babel and SWC caches
- Yarn project cache: `.yarn/cache`

Global cache support includes:

- npm content cache via `npm cache clean --force`
- pnpm store via `pnpm store prune`
- Yarn Classic and modern Yarn via `yarn cache clean`
- Bun cache via `bun pm cache rm`

Package managers are detected from the `packageManager` field and lockfiles. A manager name can also be supplied directly: `nukecache npm`, `nukecache pnpm`, `nukecache yarn`, or `nukecache bun`.

Targets nested inside another detected target are collapsed. This prevents duplicate size reporting and repeated deletion.

Every target includes creation and modification timestamps. `old` uses the cache path modification time as a safe heuristic; it never deletes anything. `largest`, `old`, and `explain` also support `--json`.

## Safety model

Cleanup uses a detect → classify → plan → confirm → delete → verify pipeline.

- Default scope is the detected project root.
- Safe project targets are selected by default.
- Rebuildable targets require `--force`.
- Global targets require `--global` (or a manager command), use each manager's native cleanup command, and start unselected in interactive mode.
- Non-interactive global cleanup requires `--force --yes`.
- Git-tracked targets are skipped.
- Symlinks are never traversed. A selected symlink removes only the link.
- Paths resolving outside the project are rejected.
- Project root, filesystem root, source directories, lockfiles, environment files, and other protected paths are rejected by the deletion layer.
- Independent cleanup failures do not stop remaining targets.

`--dry-run` constructs the same cleanup plan but never deletes files.

## Configuration

Inspect effective defaults, file location, custom definitions, and update commands:

```bash
nukecache config
nukecache config --json
```

Updates are validated and written atomically to `nukecache.config.json`:

```bash
nukecache config set showGlobal true
nukecache config set include '[".generated-cache"]'
nukecache config unset showGlobal
```

Interactive terminals use Clack throughout: configuration summary, action
selection, setting selection, typed values, confirmation, success, and
cancellation. Non-interactive terminals retain deterministic plain or JSON
output.

Command aliases: `cl` (clean), `cfg` (config), `ls` (list), `ex` (explain),
`lg` (largest), and `o` (old). Common flags also have short forms: `-a`, `-C`,
`-n`, `-d`, `-f`, `-g`, `-i`, `-j`, `-l`, `-u`, `-p`, and `-s`.

Commit `nukecache.config.json` at the project root:

```json
{
  "ignore": ["turbo"],
  "showGlobal": false,
  "include": [".generated-cache"],
  "custom": [
    {
      "id": "internal-compiler",
      "name": "Internal compiler",
      "paths": [".internal-cache"],
      "safety": "safe",
      "description": "Generated compiler artifacts.",
      "consequences": ["Next compile performs a full rebuild."]
    }
  ]
}
```

All configured paths must be project-relative. `ignore` accepts a target ID, tool ID, or exact relative path.

## Programmatic API

```ts
import { createCleanupPlan, detectCaches, executeCleanup } from "nukecache";

const { context, targets, warnings } = await detectCaches({
  cwd: process.cwd(),
  scope: "project",
});
const plan = createCleanupPlan(context.root, targets);

console.log(plan.estimatedBytes);
console.log(warnings);

// Destructive: execute only after your own confirmation flow.
const result = await executeCleanup(plan);
console.log(result.bytesFreed);
```

Detection never deletes. `executeCleanup` validates every path again immediately before removal.

## Exit behavior

- `0`: success, dry run, empty result, or user cancellation
- `1`: invalid arguments, detection error, or one or more cleanup failures

## License

MIT
