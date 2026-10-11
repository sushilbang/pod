import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.tasks import MODELS, extract_text, run, safe_name, text_generator


class LocalGenerationTests(unittest.TestCase):
    def test_filename_is_windows_safe(self):
        self.assertEqual(safe_name('  A: PDF / podcast?  '), 'A PDF  podcast')

    def test_extracts_pdf_text(self):
        import fitz
        with tempfile.TemporaryDirectory() as folder:
            pdf = Path(folder) / 'source.pdf'
            document = fitz.open()
            page = document.new_page()
            page.insert_text((72, 72), 'This is a podcast source.')
            document.save(pdf)
            document.close()
            self.assertIn('podcast source', extract_text(pdf))

    def test_gemini_adapter_uses_new_client(self):
        with patch('google.genai.Client') as client_class:
            client = client_class.return_value
            client.models.generate_content.return_value.text = '  summary  '
            self.assertEqual(text_generator('gemini', 'key')('prompt'), 'summary')
            client.models.generate_content.assert_called_once_with(
                model=MODELS['gemini'], contents='prompt'
            )

    def test_openai_adapter_uses_responses(self):
        with patch('openai.OpenAI') as client_class:
            client = client_class.return_value
            client.responses.create.return_value.output_text = '  title  '
            self.assertEqual(text_generator('openai', 'key')('prompt', 256), 'title')
            client.responses.create.assert_called_once_with(
                model=MODELS['openai'], input='prompt', max_output_tokens=256,
                reasoning={'effort': 'none'}, store=False,
            )

    def test_anthropic_adapter_uses_messages(self):
        with patch('anthropic.Anthropic') as client_class:
            client = client_class.return_value
            client.messages.create.return_value.content = [
                SimpleNamespace(type='thinking', text='hidden'),
                SimpleNamespace(type='text', text='first'),
                SimpleNamespace(type='text', text='second'),
            ]
            self.assertEqual(text_generator('anthropic', 'key')('prompt', 5000), 'first\nsecond')
            client.messages.create.assert_called_once_with(
                model=MODELS['anthropic'], max_tokens=5000,
                messages=[{'role': 'user', 'content': 'prompt'}],
            )

    def test_episode_direction_reaches_title_and_script(self):
        with tempfile.TemporaryDirectory() as folder:
            pdf = Path(folder) / 'source.pdf'
            pdf.write_bytes(b'%PDF')
            prompts = []

            def generate(prompt, max_tokens=4096):
                prompts.append(prompt)
                return ['Summary', 'Useful title', 'Dorothy: Hello there.'][len(prompts) - 1]

            def join_audio(command, **_kwargs):
                Path(command[-1]).write_bytes(b'audio')

            with patch('backend.tasks.extract_text', return_value='Document text'), \
                    patch('backend.tasks.text_generator', return_value=generate), \
                    patch('backend.tasks.ElevenLabs') as speech, \
                    patch('backend.tasks.subprocess.run', side_effect=join_audio), \
                    redirect_stdout(StringIO()):
                speech.return_value.text_to_speech.convert.return_value = [b'clip']
                run({
                    'pdf_path': str(pdf), 'output_dir': folder, 'provider': 'gemini',
                    'llm_key': 'test', 'elevenlabs_key': 'test',
                    'instruction': 'Explain the practical takeaways for beginners.'
                })
            self.assertNotIn('practical takeaways', prompts[0])
            self.assertIn('practical takeaways', prompts[1])
            self.assertIn('practical takeaways', prompts[2])
            self.assertTrue((Path(folder) / 'Useful title.mp3').exists())


if __name__ == '__main__':
    unittest.main()
