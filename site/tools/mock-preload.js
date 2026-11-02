// Preload for capture windows only. It stands in for electron/preload.js so the REAL renderer
// (index.html + renderer.js + styles.css) runs with scripted data instead of real keys or files.
const { contextBridge } = require('electron');

const listeners = [];
const episodes = [
  ['Q3 strategy for product managers', '2026-10-30T10:20:00Z'],
  ['Why retrieval beats fine-tuning', '2026-10-28T09:14:00Z'],
  ['Inside the Q3 product roadmap', '2026-10-26T16:40:00Z'],
  ['Index funds for beginners', '2026-10-21T11:05:00Z'],
  ['The case for boring infrastructure', '2026-10-17T08:30:00Z']
].map(([title, created_at]) => ({
  title, created_at,
  audio_path: `C:\\Users\\you\\Music\\POD\\${title.replace(/[^a-z0-9]+/gi, '-')}.mp3`,
  script_path: `C:\\Users\\you\\Music\\POD\\${title.replace(/[^a-z0-9]+/gi, '-')}.txt`,
  audio_url: ''
}));

let settings = { outputDir: 'C:\\Users\\you\\Music\\POD', provider: 'gemini', hasGoogleKey: true, hasOpenaiKey: false, hasAnthropicKey: false, hasElevenlabsKey: true, secureStorage: true };
let showEpisodes = true;

contextBridge.exposeInMainWorld('pod', {
  getSettings: async () => ({ ...settings }),
  saveSettings: async update => {
    if (update?.provider) settings.provider = update.provider;
    if (update?.googleKey) settings.hasGoogleKey = true;
    if (update?.openaiKey) settings.hasOpenaiKey = true;
    if (update?.anthropicKey) settings.hasAnthropicKey = true;
    if (update?.elevenlabsKey) settings.hasElevenlabsKey = true;
    return true;
  },
  clearKeys: async () => true,
  selectPdf: async () => 'C:\\Documents\\Q3-product-strategy.pdf',
  selectFolder: async () => settings.outputDir,
  openFolder: async () => '',
  generate: async () => true,
  listPodcasts: async () => (showEpisodes ? episodes : []),
  revealPodcast: async () => true,
  onGeneration: callback => { listeners.push(callback); }
});

contextBridge.exposeInMainWorld('__mock', {
  emit: message => listeners.forEach(callback => callback(message)),
  setEpisodes: value => { showEpisodes = !!value; }
});
