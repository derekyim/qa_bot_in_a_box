export type FormatAStep =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string };

export interface FormatBStep {
  intent: string;
  selector: string;
  url: string;
}

export interface TestCase {
  id: string;
  url: string;
  createdAt: string;
  steps: FormatAStep[];
  formatBSteps?: FormatBStep[];
}

export interface LLMVerdict {
  verdict: 'pass' | 'fail';
  confidence: number;
  reasoning: string;
}

export interface RunStep {
  stepIndex: number;
  screenshotPath: string;
  diffImagePath: string;
  diffPercentage: number;
  passed: boolean;
  llmVerdict?: LLMVerdict;
}

export interface RunResult {
  runId: string;
  testCaseId: string;
  runnerType: 'playwright' | 'semantic';
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  steps: RunStep[];
}
