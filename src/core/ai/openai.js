// OpenAI-compatible chat provider (OpenAI, Ollama, oMLX, any /chat/completions server). Only `complete` lives here.

import { AiError, postJson } from './http.js';

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export function createOpenAi({ model, baseUrl, getKey }, { fetch }) {
  const base = String(baseUrl || OPENAI_DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return {
    id: 'openai',
    model,
    // maxTokens is unused on purpose: newer OpenAI models reject `max_tokens` and servers differ on the replacement name.
    async complete({ system, user, timeoutMs }) {
      if (!model) throw new AiError('provider', 'No model name is set.');
      const key = getKey();
      const headers = { 'content-type': 'application/json' };
      if (key) headers.authorization = `Bearer ${key}`;
      const data = await postJson(fetch, `${base}/chat/completions`, {
        headers,
        body: {
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: 0,
        },
        timeoutMs,
      });
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new AiError('malformed', 'The provider reply had no text.');
      return text;
    },
  };
}
