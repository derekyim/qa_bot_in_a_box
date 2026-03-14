export const VERSION = '0.1.0';

export interface QaBotCore {
  version: string;
}

export function createQaBotCore(): QaBotCore {
  return { version: VERSION };
}

export { TestCaseStore } from './TestCaseStore.js';
export { SpiderAgent } from './SpiderAgent.js';
export type { StagehandModelConfig } from './SpiderAgent.js';
export { RunStore } from './RunStore.js';
export { PlaywrightRunner } from './PlaywrightRunner.js';
export { SemanticRunner } from './SemanticRunner.js';
export { VisualDiffEngine } from './VisualDiffEngine.js';
export { LLMJudge } from './LLMJudge.js';
export { CredentialManager } from './CredentialManager.js';
export type { Credentials } from './CredentialManager.js';
export { BlacklistManager } from './BlacklistManager.js';
export { resolveNlSelector } from './NlSelectorResolver.js';
export type { NlSelectorResolverInput } from './NlSelectorResolver.js';
export type { TestCase, FormatAStep, FormatBStep, RunResult, RunStep, LLMVerdict } from './types.js';
export { QaBotCoreAdapter } from './QaBotCoreAdapter.js';
export type { QaBotAdapter } from './QaBotCoreAdapter.js';
