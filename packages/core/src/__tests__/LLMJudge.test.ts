import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PNG } from 'pngjs';
import { LLMJudge } from '../LLMJudge.js';

// Create a minimal solid-color PNG buffer for testing
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

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          verdict: 'pass',
          confidence: 0.95,
          reasoning: 'No significant visual changes detected.',
        }),
      },
    ],
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

describe('LLMJudge', () => {
  let originalApiKey: string | undefined;
  let originalModel: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalModel = process.env['LLM_MODEL'];
    process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
    delete process.env['LLM_MODEL'];
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalModel !== undefined) {
      process.env['LLM_MODEL'] = originalModel;
    } else {
      delete process.env['LLM_MODEL'];
    }
  });

  it('returns a verdict with pass/fail, confidence, and reasoning fields', async () => {
    const judge = new LLMJudge();
    const img = createSolidPng(10, 10, 255, 0, 0);

    const result = await judge.evaluate({
      stepIntent: 'click login button',
      baseline: img,
      current: img,
      diffImage: img,
      diffPercentage: 0,
    });

    expect(result).toHaveProperty('verdict');
    expect(['pass', 'fail']).toContain(result.verdict);
    expect(result).toHaveProperty('confidence');
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result).toHaveProperty('reasoning');
    expect(typeof result.reasoning).toBe('string');
  });

  it('uses claude-haiku-4-5-20251001 as default model', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const judge = new LLMJudge();
    const img = createSolidPng(4, 4, 0, 255, 0);

    await judge.evaluate({
      stepIntent: 'navigate to home',
      baseline: img,
      current: img,
      diffImage: img,
      diffPercentage: 0,
    });

    const instance = vi.mocked(Anthropic).mock.results[0]?.value as {
      messages: { create: ReturnType<typeof vi.fn> };
    };
    const createCall = instance.messages.create.mock.calls[0]?.[0] as { model?: string };
    expect(createCall?.model).toBe('claude-haiku-4-5-20251001');
  });

  it('uses LLM_MODEL env var when set', async () => {
    process.env['LLM_MODEL'] = 'claude-sonnet-4-6';
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const judge = new LLMJudge();
    const img = createSolidPng(4, 4, 0, 0, 255);

    await judge.evaluate({
      stepIntent: 'fill form',
      baseline: img,
      current: img,
      diffImage: img,
      diffPercentage: 5,
    });

    const instances = vi.mocked(Anthropic).mock.results;
    const latestInstance = instances[instances.length - 1]?.value as {
      messages: { create: ReturnType<typeof vi.fn> };
    };
    const calls = latestInstance.messages.create.mock.calls;
    const lastCall = calls[calls.length - 1]?.[0] as { model?: string };
    expect(lastCall?.model).toBe('claude-sonnet-4-6');
  });
});
