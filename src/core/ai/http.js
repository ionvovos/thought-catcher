// Shared by the AI providers: the error type and one POST helper with a hard timeout. Pure: fetch is injected.

export const AI_ERROR_KINDS = Object.freeze(['auth', 'rate', 'timeout', 'network', 'malformed', 'provider']);

export class AiError extends Error {
  constructor(kind, message, { status = null } = {}) {
    super(message || kind);
    this.name = 'AiError';
    this.kind = kind;
    this.status = status;
  }
}

function providerMessage(body) {
  try {
    const data = JSON.parse(body);
    const m = data?.error?.message ?? data?.message ?? data?.error;
    if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 200);
  } catch { /* body was not JSON */ }
  return String(body ?? '').trim().slice(0, 200);
}

// POSTs JSON and returns the parsed JSON body. Throws AiError with a kind. The timer covers connect and body read.
export async function postJson(fetchFn, url, { headers, body, timeoutMs }) {
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new AiError('timeout', 'The AI did not answer in time.'));
    }, timeoutMs);
  });
  const run = (async () => {
    let res;
    try {
      res = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (err) {
      if (timedOut || err?.name === 'AbortError') throw new AiError('timeout', 'The AI did not answer in time.');
      throw new AiError('network', 'Could not reach the AI service.');
    }
    let text;
    try {
      text = await res.text();
    } catch {
      if (timedOut) throw new AiError('timeout', 'The AI did not answer in time.');
      throw new AiError('network', 'The connection dropped while reading the reply.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new AiError('auth', providerMessage(text) || 'Key rejected.', { status: res.status });
    }
    if (res.status === 429) {
      throw new AiError('rate', providerMessage(text) || 'Rate limit reached.', { status: 429 });
    }
    if (!res.ok) {
      throw new AiError('provider', providerMessage(text) || `The provider answered ${res.status}.`, { status: res.status });
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new AiError('malformed', 'The provider reply was not JSON.');
    }
  })();
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
    run.catch(() => {});
  }
}

const MESSAGES = {
  auth: 'Key rejected.',
  rate: 'The provider is limiting requests. Try again in a minute.',
  timeout: 'The AI took too long. Your thought is saved.',
  network: 'Could not reach the AI service.',
  malformed: 'The AI reply was not usable. Your thought is unchanged.',
};

// One line for the user, from any error thrown by the AI layer.
export function describeAiError(err) {
  if (err instanceof AiError) {
    if (err.kind === 'provider') return err.message || 'The provider returned an error.';
    return MESSAGES[err.kind] ?? err.message;
  }
  return 'Something went wrong with the AI request.';
}
