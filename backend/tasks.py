"""Local PDF to podcast generation, invoked by the Electron process.

Input is one JSON object on stdin. Progress and result are JSON lines on stdout.
No API keys are read from environment variables or written to disk here.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz
from elevenlabs.client import ElevenLabs


VOICES = {
    "DOROTHY": "ThT5KcBeYPX3keUQqHPh",
    "WILL": "bIHbv24MWmeRgasZH58o",
}

MODELS = {
    "gemini": "gemini-3.8-flash",
    "openai": "gpt-6-luna",
    "anthropic": "claude-sonnet-5",
}


def emit(event, **values):
    print(json.dumps({"event": event, **values}), flush=True)


def text_generator(provider, api_key):
    """Return a text generation function for the selected provider."""
    if provider == "gemini":
        from google import genai

        client = genai.Client(api_key=api_key)

        def call(prompt, max_tokens):
            response = client.models.generate_content(
                model=MODELS[provider], contents=prompt
            )
            return response.text

    elif provider == "openai":
        from openai import OpenAI

        client = OpenAI(api_key=api_key)

        def call(prompt, max_tokens):
            response = client.responses.create(
                model=MODELS[provider], input=prompt,
                max_output_tokens=max_tokens, reasoning={"effort": "none"},
                store=False,
            )
            return response.output_text

    elif provider == "anthropic":
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)

        def call(prompt, max_tokens):
            response = client.messages.create(
                model=MODELS[provider], max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return "\n".join(
                block.text for block in response.content if block.type == "text"
            )

    else:
        raise ValueError("Choose Gemini, OpenAI, or Anthropic as the text provider.")

    def generate(prompt, max_tokens=4096):
        result = (call(prompt, max_tokens) or "").strip()
        if not result:
            raise ValueError(f"{provider.title()} returned an empty response.")
        return result

    return generate


def extract_text(pdf_path):
    with fitz.open(pdf_path) as document:
        if not document.is_pdf:
            raise ValueError("Please select a PDF document.")
        text = "\n".join(page.get_text() for page in document)[:40000]
    if not text.strip():
        raise ValueError("Could not extract text from this PDF. Scanned PDFs need OCR first.")
    return text


def safe_name(title):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", title).strip(" .")
    return name[:80] or "podcast"


def run(request):
    pdf_path = Path(request["pdf_path"]).resolve(strict=True)
    output_dir = Path(request["output_dir"]).resolve(strict=True)
    if pdf_path.suffix.lower() != ".pdf" or not pdf_path.is_file():
        raise ValueError("Please select a PDF document.")
    if not output_dir.is_dir() or not os.access(output_dir, os.W_OK):
        raise ValueError("Choose a writable output folder.")

    provider = request.get("provider", "gemini")
    if provider not in MODELS or not request.get("llm_key"):
        raise ValueError("Choose a text provider and save its API key.")
    generate = text_generator(provider, request["llm_key"])
    speech = ElevenLabs(api_key=request["elevenlabs_key"])

    emit("progress", message="Reading PDF")
    source_text = extract_text(pdf_path)
    emit("progress", message="Summarizing document")
    summary = generate(f"Analyze this text for a conversational podcast. Summarize the main thesis, key topics, important facts and conclusion faithfully, without inventing facts.\n\n{source_text}")
    emit("progress", message="Writing title and script")
    title = generate(f"Generate a short, descriptive podcast title (5-10 words). Return only the title without quotes.\n\n{summary}", max_tokens=1024).replace('"', "")
    script = generate(f"""Write an engaging, approximately 1200-word podcast discussion based on this summary. The two hosts are Dorothy, an insightful analyst, and Will, a curious commentator. Include the main thesis, key topics, important facts and conclusion. Use natural dialogue. Start every spoken line with exactly 'Dorothy:' or 'Will:'. Do not include stage directions or any other text.\n\n{summary}""", max_tokens=5000)

    lines = []
    for line in script.splitlines():
        match = re.match(r"^\s*(Dorothy|Will):\s*(.+)\s*$", line, re.IGNORECASE)
        if match:
            spoken = re.sub(r"\[[^]]*\]|\*[^*]*\*", "", match.group(2)).strip()
            if spoken:
                lines.append((match.group(1).upper(), spoken))
    if not lines:
        raise ValueError(f"{provider.title()} did not return dialogue in the expected format.")

    with tempfile.TemporaryDirectory(prefix="podcast-") as temp:
        chunks = []
        for index, (speaker, spoken) in enumerate(lines, 1):
            emit("progress", message=f"Generating speech {index}/{len(lines)}")
            chunk_path = Path(temp) / f"{index:04d}.mp3"
            audio = speech.text_to_speech.convert(
                voice_id=VOICES[speaker], text=spoken, model_id="eleven_multilingual_v2"
            )
            with chunk_path.open("wb") as output:
                for part in audio:
                    output.write(part)
            if not chunk_path.stat().st_size:
                raise ValueError("ElevenLabs returned an empty audio segment.")
            chunks.append(chunk_path)

        emit("progress", message="Joining audio")
        manifest = Path(temp) / "chunks.txt"
        # ffmpeg's concat demuxer reads audio directly from disk.
        entries = []
        for chunk in chunks:
            escaped = str(chunk).replace("\\", "/").replace("'", "'\\''")
            entries.append(f"file '{escaped}'\n")
        manifest.write_text("".join(entries), encoding="utf-8")
        combined = Path(temp) / "podcast.mp3"
        command = [os.environ.get("POD_FFMPEG", "ffmpeg"), "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(manifest), "-c", "copy", str(combined)]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=600)
        except FileNotFoundError as exc:
            raise RuntimeError("ffmpeg is required. Install it and add it to PATH.") from exc
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"ffmpeg could not join audio: {exc.stderr.strip()}") from exc

        base = safe_name(title)
        destination = output_dir / f"{base}.mp3"
        suffix = 2
        while destination.exists():
            destination = output_dir / f"{base} ({suffix}).mp3"
            suffix += 1
        shutil.copyfile(combined, destination)
        script_path = destination.with_suffix(".txt")
        script_path.write_text(script, encoding="utf-8")
        emit("complete", title=title, audio_path=str(destination), script_path=str(script_path))


if __name__ == "__main__":
    try:
        run(json.load(sys.stdin))
    except Exception as error:
        emit("error", message=str(error))
        sys.exit(1)
