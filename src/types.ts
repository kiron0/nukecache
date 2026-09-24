export type CacheScope = "project" | "global";
export type DetectionScope = CacheScope | "all";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type CacheSafety =
  "safe" | "rebuild" | "reinstall" | "global" | "dangerous";

export interface NativeCleanupCommand {
  kind: "command";
  command: PackageManager;
  args: string[];
  cwd: string;
}

export interface ProjectContext {
  cwd: string;
  root: string;
  packageJson?: Record<string, unknown>;
}

export interface CacheCandidate {
  id: string;
  name: string;
  path: string;
  scope: CacheScope;
  safety: CacheSafety;
  tool: string;
  description: string;
  consequences: string[];
  cleanup?: NativeCleanupCommand;
}

export interface CacheTarget extends CacheCandidate {
  absolutePath: string;
  size: number;
  trackedByGit: boolean;
  symlink: boolean;
  exists: true;
}

export interface CacheDetector {
  id: string;
  name: string;
  detect(context: ProjectContext): Promise<CacheCandidate[]>;
}

export interface CustomCacheDefinition {
  id?: string;
  name: string;
  paths: string[];
  safety?: CacheSafety;
  description?: string;
  consequences?: string[];
}

export interface NukecacheConfig {
  ignore?: string[];
  include?: string[];
  custom?: CustomCacheDefinition[];
  defaultScope?: "project";
  showGlobal?: boolean;
}

export interface DetectOptions {
  cwd?: string;
  ignore?: string[];
  config?: NukecacheConfig;
  scope?: DetectionScope;
  packageManagers?: PackageManager[];
}

export interface DetectionWarning {
  tool: string;
  message: string;
}

export interface CleanupPlanItem {
  target: CacheTarget;
  action: "remove" | "skip";
  reason?: string;
}

export interface CleanupPlan {
  root: string;
  items: CleanupPlanItem[];
  estimatedBytes: number;
}

export interface CleanupResultItem {
  id: string;
  path: string;
  bytesFreed: number;
}

export interface CleanupFailure {
  id: string;
  path: string;
  error: string;
}

export interface CleanupResult {
  removed: CleanupResultItem[];
  skipped: Array<{ id: string; path: string; reason: string }>;
  failed: CleanupFailure[];
  bytesFreed: number;
}
