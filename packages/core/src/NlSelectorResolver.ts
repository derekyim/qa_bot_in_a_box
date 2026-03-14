import Anthropic from '@anthropic-ai/sdk';

export interface NlSelectorResolverInput {
  /** Base64-encoded PNG screenshot of the page. */
  screenshot: Buffer;
  /** CSS selector of the element the step is about to interact with. */
  stepSelector: string;
  /** Natural-language description from the blacklist (e.g. "delete button"). */
  nlDescription: string;
  /** Anthropic API key. */
  apiKey: string;
  /** Model to use (default: claude-haiku-4-5-20251001). */
  model?: string;
}

/**
 * Asks the LLM whether the element identified by `stepSelector` corresponds to
 * the natural-language `nlDescription`.  Used as a fallback when the blacklist
 * selector is not a valid CSS selector.
 *
 * Returns `true` if the LLM believes they describe the same element, `false`
 * otherwise or on error.
 */
export async function resolveNlSelector(input: NlSelectorResolverInput): Promise<boolean> {
  const { screenshot, stepSelector, nlDescription, apiKey } = input;
  const model = input.model ?? 'claude-haiku-4-5-20251001';

  const client = new Anthropic({ apiKey });

  const prompt =
    `You are helping a QA automation system enforce a blacklist rule. ` +
    `The blacklist says: never interact with "${nlDescription}". ` +
    `A test step is about to interact with the element identified by CSS selector "${stepSelector}". ` +
    `Looking at the screenshot, does the element matched by "${stepSelector}" correspond to "${nlDescription}"? ` +
    `Reply with exactly one word: YES or NO.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.toString('base64'),
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text.trim().toUpperCase() : '';
    return text.startsWith('YES');
  } catch {
    // On any error, default to not blocking (safer than false positive)
    return false;
  }
}
