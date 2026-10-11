const $ = id => document.getElementById(id);
const providerNames = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };
const stages = ['source', 'script', 'voice', 'export'];
let pdfPath = null;
let outputDir = null;
let running = false;
let progressBubble = null;
let activeView = 'chat';

function errorMessage(error) {
  return error?.message?.replace(/^Error invoking remote method '[^']+': Error: /, '') || String(error);
}

function setView(name, focus = true) {
  if (!['chat', 'podcasts', 'docs', 'settings'].includes(name)) return;
  activeView = name;
  for (const view of ['chat', 'podcasts', 'docs', 'settings']) {
    $('view-' + view).hidden = view !== name;
  }
  for (const button of document.querySelectorAll('.main-nav [data-view], .settings-link')) {
    const current = button.dataset.view === name;
    button.classList.toggle('is-active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (name === 'podcasts') loadPodcasts();
  if (focus) {
    const heading = $('view-' + name).querySelector('h1');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

function settingsMessage(message, isError = false) {
  $('settings-message').textContent = message;
  $('settings-message').classList.toggle('is-error', isError);
}

function showProvider(provider) {
  for (const name of Object.keys(providerNames)) {
    $(name === 'gemini' ? 'google-field' : name + '-field').hidden = name !== provider;
  }
  $('provider-help').textContent = providerNames[provider] + ' summarizes the document and writes the conversation.';
  $('session-provider').textContent = providerNames[provider];
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
  $('session-output').textContent = outputDir;
  $('output-path').title = outputDir;
  $('session-output').title = outputDir;
  $('provider').value = settings.provider;
  showProvider(settings.provider);
  keyState('google-state', settings.hasGoogleKey);
  keyState('openai-state', settings.hasOpenaiKey);
  keyState('anthropic-state', settings.hasAnthropicKey);
  keyState('elevenlabs-state', settings.hasElevenlabsKey);
  if (!settings.secureStorage) settingsMessage('Encrypted key storage is unavailable on this computer.', true);
}

function appendMessage(role, text, fileName) {
  const row = document.createElement('div');
  row.className = 'message-row ' + (role === 'user' ? 'user-row' : 'assistant-row');
  const avatar = document.createElement('span');
  avatar.className = 'avatar ' + (role === 'user' ? 'avatar-user' : 'avatar-assistant');
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = role === 'user' ? 'Y' : 'P';
  const body = document.createElement('div');
  body.className = 'message-body';
  const author = document.createElement('span');
  author.className = 'message-author';
  author.textContent = role === 'user' ? 'You' : 'POD Studio';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble ' + (role === 'user' ? 'user-bubble' : 'assistant-bubble');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  bubble.append(paragraph);
  if (fileName) {
    const file = document.createElement('div');
    file.className = 'message-file';
    file.textContent = fileName;
    bubble.append(file);
  }
  body.append(author, bubble);
  row.append(avatar, body);
  $('conversation-feed').append(row);
  $('conversation-feed').scrollTop = $('conversation-feed').scrollHeight;
  return { bubble, paragraph };
}

function setStage(active, complete = false) {
  const index = stages.indexOf(active);
  for (const [position, stage] of stages.entries()) {
    const element = $('stage-' + stage);
    element.classList.toggle('is-done', complete || (index >= 0 && position < index));
    element.classList.toggle('is-active', !complete && position === index);
  }
}

function setStatus(message, state = 'running') {
  $('session-progress').hidden = false;
  $('status').textContent = message;
  $('status-chip').textContent = state === 'error' ? 'NEEDS ATTENTION' : state === 'complete' ? 'READY TO LISTEN' : 'IN PROGRESS';
  if (progressBubble) progressBubble.paragraph.textContent = message;
}

function setRunning(value) {
  running = value;
  $('generate').disabled = value;
  $('choose-pdf').disabled = value;
  $('remove-pdf').disabled = value;
  $('instruction').disabled = value;
  $('generate-label').textContent = value ? 'Producing…' : 'Create podcast';
}

async function loadPodcasts() {
  try {
    const episodes = await window.pod.listPodcasts();
    const list = $('podcast-list');
    list.replaceChildren();
    $('podcasts-empty').hidden = episodes.length !== 0;
    $('podcast-count').hidden = episodes.length === 0;
    $('podcast-count').textContent = episodes.length;
    for (const episode of episodes) {
      const card = document.createElement('article');
      card.className = 'podcast-card';
      const top = document.createElement('div');
      top.className = 'podcast-card-top';
      const art = document.createElement('span');
      art.className = 'podcast-art';
      art.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = episode.title;
      const date = document.createElement('time');
      date.dateTime = episode.created_at;
      date.textContent = new Date(episode.created_at).toLocaleString();
      info.append(title, date);
      top.append(art, info);
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = episode.audio_url;
      audio.setAttribute('aria-label', 'Play ' + episode.title);
      const location = document.createElement('p');
      location.className = 'podcast-path';
      location.textContent = episode.audio_path;
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.textContent = 'Reveal MP3 and script in folder ↗';
      reveal.addEventListener('click', () => window.pod.revealPodcast(episode.audio_path).catch(error => settingsMessage(errorMessage(error), true)));
      card.append(top, audio, location, reveal);
      list.append(card);
    }
  } catch (error) {
    $('podcast-list').replaceChildren();
    $('podcasts-empty').hidden = false;
    $('podcasts-empty').querySelector('p').textContent = errorMessage(error);
  }
}

document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

$('choose-pdf').addEventListener('click', async () => {
  try {
    const selected = await window.pod.selectPdf();
    if (!selected) return;
    pdfPath = selected;
    const name = selected.split(/[\\/]/).pop();
    $('attachment-name').textContent = name;
    $('attachment').hidden = false;
    $('session-pdf').textContent = name;
  } catch (error) { appendMessage('assistant', errorMessage(error)); }
});

$('remove-pdf').addEventListener('click', () => {
  pdfPath = null;
  $('attachment').hidden = true;
  $('session-pdf').textContent = 'No PDF attached';
});

$('composer').addEventListener('submit', async event => {
  event.preventDefault();
  if (running) return;
  if (!pdfPath) {
    appendMessage('assistant', 'Attach a PDF to start an episode.');
    $('choose-pdf').focus();
    return;
  }
  const instruction = $('instruction').value.trim();
  const name = pdfPath.split(/[\\/]/).pop();
  appendMessage('user', instruction || 'Make a two voice podcast from this document.', name);
  progressBubble = appendMessage('assistant', 'Reading your PDF and preparing the episode…');
  setStage('source');
  setRunning(true);
  setStatus('Starting production…');
  try {
    await window.pod.saveSettings({ provider: $('provider').value });
    await window.pod.generate({ pdfPath, instruction });
    $('instruction').value = '';
  } catch (error) {
    setRunning(false);
    setStatus(errorMessage(error), 'error');
  }
});

$('provider').addEventListener('change', async () => {
  const provider = $('provider').value;
  showProvider(provider);
  try {
    await window.pod.saveSettings({ provider });
    settingsMessage(providerNames[provider] + ' selected for scripts.');
  } catch (error) { settingsMessage(errorMessage(error), true); }
});

$('choose-folder').addEventListener('click', async () => {
  try {
    const selected = await window.pod.selectFolder();
    if (!selected) return;
    await window.pod.saveSettings({ outputDir: selected });
    await refresh();
    settingsMessage('Output folder saved.');
    loadPodcasts();
  } catch (error) { settingsMessage(errorMessage(error), true); }
});

$('open-library-folder').addEventListener('click', async () => {
  try { await window.pod.openFolder(outputDir); }
  catch (error) { appendMessage('assistant', errorMessage(error)); setView('chat'); }
});

$('save-settings').addEventListener('click', async () => {
  try {
    await window.pod.saveSettings({
      provider: $('provider').value,
      outputDir,
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

window.pod.onGeneration(message => {
  if (!progressBubble) progressBubble = appendMessage('assistant', 'Producing your episode…');
  if (message.event === 'progress') {
    setStatus(message.message);
    if (message.message.startsWith('Reading')) setStage('source');
    else if (message.message.startsWith('Summarizing') || message.message.startsWith('Writing')) setStage('script');
    else if (message.message.startsWith('Generating speech')) setStage('voice');
    else if (message.message.startsWith('Joining')) setStage('export');
  }
  if (message.event === 'complete') {
    setRunning(false);
    setStage(null, true);
    setStatus('Episode ready. Listen here or find it in Podcasts.', 'complete');
    const title = document.createElement('strong');
    title.textContent = message.title || 'Your episode';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = message.audio_url;
    audio.setAttribute('aria-label', 'Generated podcast preview');
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'bubble-link';
    reveal.textContent = 'Reveal MP3 and script ↗';
    reveal.addEventListener('click', () => window.pod.revealPodcast(message.audio_path).catch(error => setStatus(errorMessage(error), 'error')));
    progressBubble.bubble.append(title, audio, reveal);
    progressBubble = null;
    loadPodcasts();
  }
  if (message.event === 'error') {
    setRunning(false);
    setStatus(message.message, 'error');
    progressBubble = null;
  }
  $('conversation-feed').scrollTop = $('conversation-feed').scrollHeight;
});

refresh().then(loadPodcasts).catch(error => appendMessage('assistant', errorMessage(error)));
