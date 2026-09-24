export { detectCaches, type DetectionResult } from "./detect";
export { builtInDetectors } from "./detectors";
export { createCleanupPlan, type PlanOptions } from "./cleanup/planner";
export { executeCleanup, type ExecuteOptions } from "./cleanup/executor";
export {
  detectPackageManagerCaches,
  type PackageManagerDetection,
} from "./detectors/package-managers";
export { calculateSize } from "./filesystem/size";
export { assertSafeProjectTarget } from "./filesystem/safety";
export { findProjectRoot, createProjectContext } from "./project/root";
export { loadConfig } from "./project/config";
export {
  detectPackageManagers,
  isPackageManager,
  parsePackageManager,
} from "./project/package-manager";
export {
  formatBytes,
  formatList,
  formatPlan,
  formatResult,
  formatTarget,
  formatWarnings,
} from "./output";
export type {
  CacheCandidate,
  CacheDetector,
  CacheSafety,
  CacheScope,
  CacheTarget,
  CleanupFailure,
  CleanupPlan,
  CleanupPlanItem,
  CleanupResult,
  CleanupResultItem,
  CustomCacheDefinition,
  DetectionScope,
  DetectionWarning,
  DetectOptions,
  NativeCleanupCommand,
  NukecacheConfig,
  PackageManager,
  ProjectContext,
} from "./types";
