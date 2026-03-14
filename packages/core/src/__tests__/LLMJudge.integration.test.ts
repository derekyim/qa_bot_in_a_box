/**
 * Slow integration test for LLMJudge — tagged "slow".
 * Makes a real Anthropic API call.
 * Skipped when ANTHROPIC_API_KEY is absent.
 */
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { LLMJudge } from '../LLMJudge.js';

function createSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4 + 0] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

const HAS_API_KEY = Boolean(process.env['ANTHROPIC_API_KEY']);

describe.skipIf(!HAS_API_KEY)('LLMJudge slow integration', () => {
  it(
    'returns correct verdict shape for a known diff scenario (real API call)',
    async () => {
      const judge = new LLMJudge();
      const baseline = createSolidPng(20, 20, 255, 255, 255); // white
      const current = createSolidPng(20, 20, 255, 255, 255); // identical white (should pass)
      const diffImage = createSolidPng(20, 20, 0, 0, 0); // no diff pixels

      const result = await judge.evaluate({
        stepIntent: 'navigate to home page',
        baseline,
        current,
        diffImage,
        diffPercentage: 0,
      });

      // Verify verdict shape
      expect(['pass', 'fail']).toContain(result.verdict);
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    },
    30_000, // 30s timeout for real API call
  );
});
