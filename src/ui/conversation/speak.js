// Spoken replies with the phone's own voice (speechSynthesis). Off by default (voice.speak); the same text is always on
// screen. The voice is the one named in settings (voice.name); null means silent.
export function createSpeaker({ win = globalThis, onStart = () => {}, onEnd = () => {} } = {}) {
  const synth = win.speechSynthesis;
  const supported = Boolean(synth && win.SpeechSynthesisUtterance);
  let active = null;

  const voices = () => (supported ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : []);

  function stop() {
    if (!supported) return;
    active = null;
    synth.cancel();
  }

  // Returns the voice name used, or null when nothing was spoken.
  function speak(text, voiceName) {
    if (!supported || !voiceName || !String(text ?? '').trim()) return null;
    const voice = synth.getVoices().find((v) => v.name === voiceName);
    if (!voice) return null;
    stop();
    const u = new win.SpeechSynthesisUtterance(String(text));
    u.voice = voice;
    u.lang = voice.lang;
    const end = () => { if (active === u) { active = null; onEnd(); } };
    u.onend = end;
    u.onerror = end;
    active = u;
    synth.speak(u);
    onStart(voiceName);
    return voiceName;
  }

  return { supported, voices, speak, stop, isSpeaking: () => active !== null };
}
