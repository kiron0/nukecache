export { detectCaches, type DetectionResult } from "./detect";
export { builtInDetectors } from "./detectors";
export { createCleanupPlan, type PlanOptions } from "./cleanup/planner";
export { executeCleanup } from "./cleanup/executor";
export { calculateSize } from "./filesystem/size";
export { assertSafeProjectTarget } from "./filesystem/safety";
export { findProjectRoot, createProjectContext } from "./project/root";
export { loadConfig } from "./project/config";
export {
  formatBytes,
  formatList,
  formatPlan,
  formatResult,
  formatTarget,
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
  DetectOptions,
  NukecacheConfig,
  ProjectContext,
} from "./types";
