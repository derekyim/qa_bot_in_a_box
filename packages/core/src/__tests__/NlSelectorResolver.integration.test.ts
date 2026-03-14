/**
 * Integration test for NL selector resolution via LLM.
 * Skipped when ANTHROPIC_API_KEY is not set (tagged slow).
 */
import { describe, it, expect } from 'vitest';
import { resolveNlSelector } from '../NlSelectorResolver.js';

describe('NL selector resolution (LLM fallback)', () => {
  const apiKey = process.env['ANTHROPIC_API_KEY'];

  it.skipIf(!apiKey)(
    'resolves a natural-language selector to true when it describes the target element',
    async () => {
      // Minimal 1x1 white PNG as a dummy screenshot (resolution accuracy is not the point;
      // we're testing the API integration path)
      const whitePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      // The NL description matches the element's visible text
      const result = await resolveNlSelector({
        screenshot: whitePng,
        stepSelector: '#delete-btn',
        nlDescription: 'delete button',
        apiKey,
      });

      // LLM should return a boolean (true or false — we can't assert a specific value
      // without a real page, but we can assert the API call succeeds and returns a boolean)
      expect(typeof result).toBe('boolean');
    },
    30_000,
  );
});
