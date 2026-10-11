const $ = id => document.getElementById(id);
const providerNames = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };
const stages = ['source', 'script', 'voice', 'export'];
let pdfPath = null;
let outputDir = null;
let running = false;

function errorMessage(error) {
  return error?.message?.replace(/^Error invoking remote method '[^']+': Error: /, '') || String(error);
}

function settingsMessage(message, isError = false) {
  $('settings-message').textContent = message;
  $('settings-message').classList.toggle('is-error', isError);
}

function showProvider(provider) {
  for (const name of Object.keys(providerNames)) {
    $(name === 'gemini' ? 'google-field' : `${name}-field`).hidden = name !== provider;
  }
  $('provider-help').textContent = `${providerNames[provider]} summarizes the document and writes the conversation.`;
}

function keyState(id, saved) {
  const element = $(id);
  element.textContent = saved ? 'CONNECTED' : 'NEEDED';
  element.classList.toggle('is-saved', saved);
}

async function refresh() {
  const settings = await window.pod.getSettings();
  outputDir = settings.outputDir;
  $('output-path').textContent = outputDir;
  $('output-path').title = outputDir;
  $('provider').value = settings.provider;
  showProvider(settings.provider);
  keyState('google-state', settings.hasGoogleKey);
  keyState('openai-state', settings.hasOpenaiKey);
  keyState('anthropic-state', settings.hasAnthropicKey);
  keyState('elevenlabs-state', settings.hasElevenlabsKey);
  if (!settings.secureStorage) settingsMessage('Encrypted key storage is unavailable on this computer.', true);
}

function setStage(active, complete = false) {
  const activeIndex = stages.indexOf(active);
  for (const [index, stage] of stages.entries()) {
    const element = $(`stage-${stage}`);
    element.classList.toggle('is-done', complete || (activeIndex >= 0 && index < activeIndex));
    element.classList.toggle('is-active', !complete && index === activeIndex);
  }
}

function setRunning(value) {
  running = value;
  $('generate').disabled = value;
  $('generate-label').textContent = value ? 'Producing episode…' : 'Generate episode';
  document.querySelector('.production-panel').classList.toggle('is-running', value);
  $('status-chip').textContent = value ? 'IN PROGRESS' : 'IDLE';
}

function setStatus(message, state = 'idle') {
  $('status').textContent = message;
  $('status-chip').textContent = state === 'error' ? 'NEEDS ATTENTION' : state === 'complete' ? 'COMPLETE' : state === 'running' ? 'IN PROGRESS' : 'IDLE';
}

$('choose-pdf').addEventListener('click', async () => {
  try {
    const selected = await window.pod.selectPdf();
    if (!selected) return;
    pdfPath = selected;
    $('pdf-name').textContent = selected.split(/[\\/]/).pop();
    $('pdf-path').textContent = selected;
    $('pdf-path').title = selected;
    setStatus('Document selected. Connect your services, then generate.');
    setStage('source');
  } catch (error) { setStatus(errorMessage(error), 'error'); }
});

$('choose-folder').addEventListener('click', async () => {
  try {
    const selected = await window.pod.selectFolder();
    if (selected) {
      await window.pod.saveSettings({ outputDir: selected });
      await refresh();
      settingsMessage('Output folder saved.');
    }
  } catch (error) { settingsMessage(errorMessage(error), true); }
});

$('provider').addEventListener('change', async () => {
  const provider = $('provider').value;
  showProvider(provider);
  try {
    await window.pod.saveSettings({ provider });
    settingsMessage(`${providerNames[provider]} selected for scripts.`);
  } catch (error) { settingsMessage(errorMessage(error), true); }
});

$('save-settings').addEventListener('click', async () => {
  try {
    await window.pod.saveSettings({
      provider: $('provider').value, outputDir,
      googleKey: $('google-key').value,
      openaiKey: $('openai-key').value,
      anthropicKey: $('anthropic-key').value,
      elevenlabsKey: $('elevenlabs-key').value
    });
    for (const id of ['google-key', 'openai-key', 'anthropic-key', 'elevenlabs-key']) $(id).value = '';
    await refresh();
    settingsMessage('Connections saved and ready.');
  } catch (error) { settingsMessage(errorMessage(error), true); }
});

$('clear-keys').addEventListener('click', async () => {
  try {
    await window.pod.clearKeys();
    for (const id of ['google-key', 'openai-key', 'anthropic-key', 'elevenlabs-key']) $(id).value = '';
    await refresh();
    settingsMessage('Saved keys removed.');
  } catch (error) { settingsMessage(errorMessage(error), true); }
});

$('generate').addEventListener('click', async () => {
  if (running) return;
  if (!pdfPath) { setStatus('Choose a PDF to get started.', 'error'); $('choose-pdf').focus(); return; }
  setRunning(true);
  setStatus('Starting production…', 'running');
  setStage('source');
  $('result').hidden = true;
  $('audio-preview').removeAttribute('src');
  try {
    await window.pod.saveSettings({ provider: $('provider').value });
    await window.pod.generate(pdfPath);
  } catch (error) {
    setRunning(false);
    setStatus(errorMessage(error), 'error');
  }
});

$('open-folder').addEventListener('click', async () => {
  try { await window.pod.openFolder(outputDir); }
  catch (error) { setStatus(errorMessage(error), 'error'); }
});

window.pod.onGeneration(message => {
  if (message.event === 'progress') {
    setStatus(message.message, 'running');
    if (message.message.startsWith('Reading')) setStage('source');
    else if (message.message.startsWith('Summarizing') || message.message.startsWith('Writing')) setStage('script');
    else if (message.message.startsWith('Generating speech')) setStage('voice');
    else if (message.message.startsWith('Joining')) setStage('export');
  }
  if (message.event === 'complete') {
    setRunning(false);
    setStatus('Episode ready. Preview it below or open its folder.', 'complete');
    setStage(null, true);
    $('result-title').textContent = message.title || 'Your episode';
    $('result-path').textContent = message.audio_path;
    $('audio-preview').src = message.audio_url;
    $('result').hidden = false;
  }
  if (message.event === 'error') {
    setRunning(false);
    setStatus(message.message, 'error');
  }
});

refresh().catch(error => setStatus(errorMessage(error), 'error'));
