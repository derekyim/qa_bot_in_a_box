export const VERSION = '0.1.0';

export interface QaBotCore {
  version: string;
}

export function createQaBotCore(): QaBotCore {
  return { version: VERSION };
}

export { TestCaseStore } from './TestCaseStore.js';
export { SpiderAgent } from './SpiderAgent.js';
export { RunStore } from './RunStore.js';
export { PlaywrightRunner } from './PlaywrightRunner.js';
export { VisualDiffEngine } from './VisualDiffEngine.js';
export { LLMJudge } from './LLMJudge.js';
export { CredentialManager } from './CredentialManager.js';
export type { Credentials } from './CredentialManager.js';
export type { TestCase, FormatAStep, RunResult, RunStep, LLMVerdict } from './types.js';
