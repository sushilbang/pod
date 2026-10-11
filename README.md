# POD desktop

POD turns a text based PDF into a two voice podcast. It runs as an Electron desktop app with no account, database, server, Redis, or cloud storage. You provide an API key for Gemini, OpenAI, or Anthropic to write the script, plus an ElevenLabs key for speech. The app saves keys using Electron's OS backed encrypted storage. Only the selected text provider key and ElevenLabs key are used for a generation. Output is an MP3 and script text file in the folder you choose.

## Run locally

Requires Node.js 22+ and Python 3.11+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm install
npm start
```

On first launch, choose an output folder, select a text provider, and enter that provider's key and an ElevenLabs key. Then select a PDF and generate. You can save keys for all three text providers and switch between them. The app does not read `.env`.

The default text models are `gemini-3.8-flash`, `gpt-6-luna`, and `claude-sonnet-5` respectively. These can be changed in `backend/tasks.py` if your provider account needs a different model.

## Build a Windows installer

Install PyInstaller in the virtual environment, then run the package script. The script bundles the Python worker and Electron Builder includes it in the desktop package.

```powershell
.\.venv\Scripts\python.exe -m pip install pyinstaller
npm run package
```

The installer is written to `release/`. `ffmpeg` is included through `ffmpeg-static`. Generated files are stored only in the chosen output folder. The keys are saved in Electron's app data directory, encrypted with the operating system's key store. Removing keys in the app deletes their saved values.

Provider and ElevenLabs usage may incur charges on your accounts. PDFs without extractable text need OCR before import. Long documents are limited to the first 40,000 extracted characters to bound API usage.
