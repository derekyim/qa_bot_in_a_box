export type FormatAStep =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string };

export interface TestCase {
  id: string;
  url: string;
  createdAt: string;
  steps: FormatAStep[];
}

export interface RunStep {
  stepIndex: number;
  screenshotPath: string;
  diffImagePath: string;
  diffPercentage: number;
  passed: boolean;
}

export interface RunResult {
  runId: string;
  testCaseId: string;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  steps: RunStep[];
}
