// Voice choice helpers (X9, AC-X9.4). Pure: they take the list a `speechSynthesis.getVoices()` call returned.

const REGION = { US: 'US', GB: 'UK', AU: 'Australia', IN: 'India', IE: 'Ireland', ZA: 'South Africa', CA: 'Canada', NZ: 'New Zealand' };

// "System voice, English (UK)" from a BCP 47 tag such as "en-GB".
export function voiceSub(lang) {
  const [language, region] = String(lang ?? '').replace('_', '-').split('-');
  if (!language) return 'System voice';
  const name = language.toLowerCase() === 'en' ? 'English' : language.toLowerCase();
  const where = region ? REGION[region.toUpperCase()] ?? region.toUpperCase() : '';
  return `System voice, ${name}${where ? ` (${where})` : ''}`;
}

// English voices only (the app is English only), and only voices that run on the phone: a network voice would send the
// reply text, which contains the filed title, to its maker (security review F3). By name, at most `max` rows.
export function voiceRows(voices, max = 12) {
  const list = Array.from(voices ?? []).filter((v) => v && v.name);
  const en = list.filter((v) => v.localService === true && /^en([-_]|$)/i.test(v.lang ?? ''));
  const seen = new Set();
  return en
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((v) => (seen.has(v.name) ? false : seen.add(v.name)))
    .slice(0, max)
    .map((v) => ({ name: v.name, lang: v.lang, sub: voiceSub(v.lang), voice: v }));
}

export const PREVIEW_TEXT = 'Filed as a reminder for Friday at 6 pm.';
