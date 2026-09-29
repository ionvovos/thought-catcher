// Anthropic Messages API provider. Only `complete` lives here; prompts and validation are in adapter.js.

import { AiError, postJson } from './http.js';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export function createAnthropic({ model, getKey }, { fetch }) {
  const usedModel = model || ANTHROPIC_DEFAULT_MODEL;
  return {
    id: 'anthropic',
    model: usedModel,
    async complete({ system, user, maxTokens, timeoutMs }) {
      const key = getKey();
      if (!key) throw new AiError('auth', 'No key is set.');
      const data = await postJson(fetch, ANTHROPIC_URL, {
        headers: {
          'x-api-key': key,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: { model: usedModel, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
        timeoutMs,
      });
      const block = Array.isArray(data?.content) ? data.content.find((b) => b?.type === 'text' && typeof b.text === 'string') : null;
      if (!block) throw new AiError('malformed', 'The provider reply had no text.');
      return block.text;
    },
  };
}
