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
