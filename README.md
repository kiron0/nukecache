# nukecache

Detect, inspect, and safely clear development caches from one CLI.

`nukecache` finds supported caches in the current project, measures them, explains what created them, and removes only targets you approve. It does not delete dependencies, lockfiles, environment files, source code, global package-manager caches, or browser state.

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

# Preview safe cleanup
nukecache --dry-run

# Non-interactive safe cleanup
nukecache clean --safe --yes
```

Scan another project or skip a detector:

```bash
nukecache list --cwd ../my-app
nukecache --ignore turbo
```

## Supported caches

Initial release detects:

- Next.js: `.next/cache`
- Vite: `node_modules/.vite`, `.vite`
- Turborepo: `.turbo`, `node_modules/.cache/turbo`
- TypeScript: `*.tsbuildinfo`
- ESLint: `.eslintcache` and common cache directories
- Generic tool caches: `node_modules/.cache`

Targets nested inside another detected target are collapsed. This prevents duplicate size reporting and repeated deletion.

## Safety model

Cleanup uses a detect → classify → plan → confirm → delete → verify pipeline.

- Default scope is the detected project root.
- Only `safe` targets are selectable in v0.1.
- Git-tracked targets are skipped.
- Symlinks are never traversed. A selected symlink removes only the link.
- Paths resolving outside the project are rejected.
- Project root, filesystem root, source directories, lockfiles, environment files, and other protected paths are rejected by the deletion layer.
- Independent cleanup failures do not stop remaining targets.

`--dry-run` constructs the same cleanup plan but never deletes files.

## Configuration

Commit `nukecache.config.json` at the project root:

```json
{
  "ignore": ["turbo"],
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

const { context, targets } = await detectCaches({ cwd: process.cwd() });
const plan = createCleanupPlan(context.root, targets);

console.log(plan.estimatedBytes);

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
