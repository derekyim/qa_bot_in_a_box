import Anthropic from '@anthropic-ai/sdk';
import type { LLMVerdict } from './types.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export interface LLMJudgeInput {
  stepIntent: string;
  baseline: Buffer;
  current: Buffer;
  diffImage: Buffer;
  diffPercentage: number;
}

export class LLMJudge {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
    });
    this.model = process.env['LLM_MODEL'] ?? DEFAULT_MODEL;
  }

  async evaluate(input: LLMJudgeInput): Promise<LLMVerdict> {
    const { stepIntent, baseline, current, diffImage, diffPercentage } = input;

    const prompt = `You are a visual regression testing judge. Evaluate whether the visual change between a baseline and current screenshot represents a test failure or is an acceptable change.

Step intent: ${stepIntent}
Diff percentage: ${diffPercentage.toFixed(2)}%

You have been provided with three images:
1. The baseline screenshot (what we expect)
2. The current screenshot (what we got)
3. The diff image (highlighted pixel differences)

Based on the visual differences, determine:
- verdict: "pass" if the change is acceptable/expected, "fail" if it represents a regression
- confidence: a number between 0 and 1 indicating your confidence in the verdict
- reasoning: a brief explanation of your assessment

Respond with ONLY a JSON object in this exact format:
{"verdict": "pass" | "fail", "confidence": <number 0-1>, "reasoning": "<string>"}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: baseline.toString('base64'),
              },
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: current.toString('base64'),
              },
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: diffImage.toString('base64'),
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('LLM returned no text content');
    }

    // Extract JSON from the response — handle potential markdown code fences
    const raw = textBlock.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`LLM response did not contain valid JSON: ${raw}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<LLMVerdict>;

    if (parsed.verdict !== 'pass' && parsed.verdict !== 'fail') {
      throw new Error(`Invalid verdict value: ${String(parsed.verdict)}`);
    }
    if (typeof parsed.confidence !== 'number') {
      throw new Error(`Invalid confidence value: ${String(parsed.confidence)}`);
    }
    if (typeof parsed.reasoning !== 'string') {
      throw new Error(`Invalid reasoning value: ${String(parsed.reasoning)}`);
    }

    return {
      verdict: parsed.verdict,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      reasoning: parsed.reasoning,
    };
  }
}
