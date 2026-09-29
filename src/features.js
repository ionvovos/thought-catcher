// Switches for parts of the app that may not ship in a given release. Read by the About page and the settings screen.
// Set onDeviceSpeech to true only when src/speech/whisper.js is in the release and wired to the consent dialog.
export const FEATURES = Object.freeze({
  onDeviceSpeech: false,
});
