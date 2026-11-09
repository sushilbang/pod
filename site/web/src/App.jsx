import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import release from './release.json';

const reducedQuery = '(prefers-reduced-motion: reduce)';
const downloadHref = `/download/${release.file}`;
const sizeMb = release.sizeBytes ? `${(release.sizeBytes / 1048576).toFixed(0)} MB` : '—';

function Logo({ size = 28 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="116" fill="currentColor" />
      <g fill="#fff">
        <rect x="104" y="196" width="40" height="120" rx="20" />
        <rect x="172" y="136" width="40" height="240" rx="20" />
        <rect x="240" y="86" width="40" height="340" rx="20" />
        <rect x="308" y="156" width="40" height="200" rx="20" />
        <rect x="376" y="212" width="40" height="88" rx="20" />
      </g>
    </svg>
  );
}

function Arrow() {
  return <svg className="arrow" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Words listed in `script` are set in the hand-lettered italic.
function Words({ text, script = [] }) {
  return text.split(' ').map((word, i) => (
    <span key={i}><span className="word"><span className={`word-in${script.includes(word) ? ' word-script' : ''}`}>{word}</span></span>{' '}</span>
  ));
}

// Starburst sticker: a 16-point star behind the label.
const burstPoints = Array.from({ length: 32 }, (_, i) => {
  const angle = (i * Math.PI) / 16;
  const radius = i % 2 ? 43 : 50;
  return `${(50 + radius * Math.cos(angle)).toFixed(1)},${(50 + radius * Math.sin(angle)).toFixed(1)}`;
}).join(' ');

function Burst({ className = '', children }) {
  return (
    <span className={`sticker burst ${className}`.trim()}>
      <svg viewBox="0 0 100 100" aria-hidden="true"><polygon points={burstPoints} /></svg>
      <span>{children}</span>
    </span>
  );
}

function Clip({ src, poster, label, eager = false }) {
  const ref = useRef(null);
  const [reduced] = useState(() => matchMedia(reducedQuery).matches);
  // Reduced-motion visitors and browsers that block autoplay get an explicit Play button instead of a still image.
  const [needsTap, setNeedsTap] = useState(reduced);
  useEffect(() => {
    const video = ref.current;
    if (reduced || !video) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
      else video.pause();
    }, { threshold: eager ? 0.05 : 0.25 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);
  const start = () => { ref.current?.play().then(() => setNeedsTap(false)).catch(() => {}); };
  return (
    <div className="clip">
      <video ref={ref} src={src} poster={poster} muted loop playsInline preload={eager ? 'auto' : 'metadata'} controls={reduced} aria-label={label} />
      {needsTap && <button type="button" className="clip-play" onClick={start}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>Play demo</button>}
    </div>
  );
}

// Accordion built on <details>: the browser can't animate closing, so open state lives in React and GSAP
// animates the panel (height + opacity, small and short). Reduced motion toggles instantly.
function FaqItem({ q, a, isOpen, onToggle }) {
  const details = useRef(null);
  const panel = useRef(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const d = details.current;
    const p = panel.current;
    const clear = () => gsap.set(p, { clearProps: 'height,opacity' });
    if (matchMedia(reducedQuery).matches) { d.open = isOpen; return undefined; }
    if (isOpen) {
      d.open = true;
      gsap.fromTo(p, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.4, ease: 'power2.out', overwrite: true, onComplete: clear });
    } else {
      gsap.to(p, { height: 0, opacity: 0, duration: 0.28, ease: 'power2.in', overwrite: true, onComplete: () => { d.open = false; clear(); } });
    }
    return undefined;
  }, [isOpen]);

  return (
    <details ref={details} className={isOpen ? 'is-open' : ''}>
      <summary onClick={event => { event.preventDefault(); onToggle(); }}>{q}</summary>
      <div className="faq-panel" ref={panel}><p>{a}</p></div>
    </details>
  );
}

function Faq() {
  const [open, setOpen] = useState(-1);
  return (
    <div className="faq" data-reveal>
      {faqs.map(([q, a], i) => <FaqItem key={q} q={q} a={a} isOpen={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />)}
    </div>
  );
}

function Frame({ children }) {
  return (
    <figure className="frame" data-media>
      <div className="frame-bar" aria-hidden="true"><i /><i /><i /><span>POD Studio</span></div>
      <div className="frame-body">{children}</div>
    </figure>
  );
}

const features = [
  {
    n: '01', title: 'Drop in a PDF. Describe the episode.',
    body: 'Attach any text-based PDF and say how it should sound: who it is for, what tone to take, what to end on. Leave the box empty and POD makes a sensible two-host episode on its own.',
    points: ['Reads up to the first 40,000 characters of the document', 'Direction of up to 2,000 characters, entirely optional', 'Your original PDF is never modified'],
    media: { type: 'video', src: '/media/create.mp4', poster: '/media/create-poster.webp', label: 'Attaching a PDF, typing a direction and producing an episode' }
  },
  {
    n: '02', title: 'Watch it get made, stage by stage.',
    body: 'While POD works, the session panel shows exactly where it is: reading, scripting, voicing or exporting. When the episode is ready you can play it right inside the conversation.',
    points: ['A dialogue of about 1,200 words between Dorothy and Will', 'Every line is voiced separately for natural turn-taking', 'FFmpeg joins the clips without re-encoding'],
    media: { type: 'video', src: '/media/progress.mp4', poster: '/media/progress-poster.webp', label: 'The session panel moving through read, script, audio and export until the episode appears' }
  },
  {
    n: '03', title: 'A library that lives on your disk.',
    body: 'Every episode lands as an MP3 plus a plain-text script in a folder you choose. The Podcasts page lists them, plays them, and opens the file in Explorer with one click.',
    points: ['Defaults to your Music folder, change it any time', 'Matching MP3 and script pairs are picked up automatically', 'No account, no cloud copy, nothing to sync'],
    media: { type: 'video', src: '/media/library.mp4', poster: '/media/library-poster.webp', label: 'The Podcasts library starting empty and filling with episodes, then scrolling through them' }
  },
  {
    n: '04', title: 'Bring your own AI accounts.',
    body: 'Pick Google Gemini, OpenAI or Anthropic to write the script, and ElevenLabs for the voices. Keys are encrypted by Windows on your machine and used only for the render you start.',
    points: ['Switch script providers without touching your PDF', 'No sign-up and no POD server in between', 'Generation is billed by your own provider accounts'],
    media: { type: 'video', src: '/media/settings.mp4', poster: '/media/settings-poster.webp', label: 'Switching the text provider and saving an API key in Settings' }
  },
  {
    n: '05', title: 'Light, dark, or follow the system.',
    body: 'POD ships as a cream-and-tomato diner by day and the same diner after hours. It follows your Windows theme by default, and a single toggle in the header lets you override it. The choice is remembered.',
    points: ['Clean, high-contrast type at a comfortable size', 'Keyboard friendly with visible focus states', 'Honors reduced-motion preferences'],
    media: { type: 'video', src: '/media/themes.mp4', poster: '/media/themes-poster.webp', label: 'Toggling between light and dark themes across pages' }
  }
];

const steps = [
  ['01', 'Read', 'PyMuPDF extracts the text of your PDF.'],
  ['02', 'Summarize', 'Your chosen model builds a grounded summary.'],
  ['03', 'Write', 'A two-host dialogue and a short title.'],
  ['04', 'Voice', 'ElevenLabs speaks each line as Dorothy or Will.'],
  ['05', 'Export', 'FFmpeg joins the clips into an MP3 and a script.']
];

const faqs = [
  ['Does it cost anything?', 'The app needs no account and POD runs no server. Generating an episode uses your own AI and ElevenLabs accounts, so any cost comes from those providers’ pricing and quotas.'],
  ['Where do my files and keys go?', 'Keys are encrypted by Windows on your computer. Document text is sent to the text provider you choose, and script lines are sent to ElevenLabs to create the voices. Episodes, scripts and audio stay in your output folder.'],
  ['Does it work offline?', 'No. Writing the script and creating voices both call your providers over the internet. Browsing your library and playing finished episodes works offline.'],
  ['Why does Windows show a SmartScreen warning?', 'The portable build is not code-signed yet, so SmartScreen may say it does not recognise the app. Compare the SHA-256 above with your download, then choose More info and Run anyway if it matches.'],
  ['What kind of PDF works best?', 'A text-based PDF with selectable text and clear headings. Scanned or image-only PDFs need OCR first, and only the first 40,000 extracted characters are used.'],
  ['Is there a Mac or Linux version?', 'Not yet. The packaged download is Windows 10/11 x64 only.'],
  ['Are the screenshots real?', 'They are scripted mock-ups. They run the app’s real interface and stylesheet in a test window with sample episodes and no real document, keys or API calls, which is why the page says so beneath the hero and at the end of the features.']
];

export default function App() {
  const root = useRef(null);
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const q = gsap.utils.selector(root);

      gsap.set([...q('.hero-fade'), ...q('.hero-shot')], { autoAlpha: 0, y: 24 });
      gsap.set(q('.word-in'), { yPercent: 110 });
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .to(q('.word-in'), { yPercent: 0, duration: 0.9, stagger: 0.05 }, 0.1)
        .to(q('.hero-fade'), { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.1 }, 0.45)
        .to(q('.hero-shot'), { autoAlpha: 1, y: 0, duration: 1 }, 0.7);

      const bars = q('.wave i');
      const wave = gsap.timeline();
      bars.forEach((bar, i) => {
        wave.fromTo(bar, { scaleY: 0.18 + 0.5 * Math.abs(Math.sin(i * 0.7)) }, {
          scaleY: 1 - 0.55 * Math.abs(Math.cos(i * 0.45)), duration: 0.9 + (i % 5) * 0.17,
          ease: 'sine.inOut', repeat: -1, yoyo: true
        }, i * 0.035);
      });
      ScrollTrigger.create({ trigger: q('.hero')[0], start: 'top bottom', end: 'bottom top', onToggle: self => wave.paused(!self.isActive) });

      const revealed = [...q('[data-reveal]'), ...q('[data-media]')];
      gsap.set(revealed, { autoAlpha: 0, y: 28 });
      gsap.set(q('.pipe-line'), { scaleX: 0 });
      ScrollTrigger.batch(revealed, {
        start: 'top 88%', once: true,
        onEnter: els => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.75, stagger: 0.09, ease: 'power2.out', overwrite: true })
      });
      ScrollTrigger.create({ trigger: q('.pipeline')[0], start: 'top 80%', once: true, onEnter: () => gsap.to(q('.pipe-line'), { scaleX: 1, duration: 1.2, ease: 'power2.inOut' }) });
    });
    return () => mm.revert();
  }, []);

  const copyHash = async () => {
    try { await navigator.clipboard.writeText(release.sha256); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ }
  };

  return (
    <div ref={root} className="sheet">
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav">
        <a className="nav-brand" href="#top" aria-label="POD Studio home"><Logo /><span>POD Studio</span></a>
        <nav aria-label="Main"><a href="#features">Features</a><a href="#how">How it works</a><a href="#faq">FAQ</a></nav>
        <a className="btn btn-yellow btn-sm" href="#download">Download</a>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="wrap hero-copy">
            <p className="eyebrow hero-fade">Local-first desktop app for Windows</p>
            <h1><Words text="Turn any PDF into a two-voice podcast." script={['two-voice']} /></h1>
            <p className="lede hero-fade">POD Studio reads your document, writes a conversation between two hosts with the AI account you already have, and hands you an MP3 and the script. Your files and keys stay on your computer.</p>
            <div className="cta-row hero-fade">
              <a className="btn btn-yellow btn-lg" href="#download">Download for Windows <Arrow /></a>
              <a className="btn btn-ghost btn-lg" href="#features">See what it does</a>
            </div>
            <p className="meta hero-fade">v{release.version} · Portable .exe · {sizeMb} · Windows 10/11 x64</p>
          </div>
          <div className="wave" aria-hidden="true">{Array.from({ length: 56 }, (_, i) => <i key={i} />)}</div>
          <div className="wrap hero-stage">
            <Burst className="burst-tag hero-shot">Latest<br />v{release.version}</Burst>
            <figure className="frame hero-shot">
              <div className="frame-bar" aria-hidden="true"><i /><i /><i /><span>POD Studio</span></div>
              <div className="frame-body"><Clip eager src="/media/hero.mp4" poster="/media/hero-poster.webp" label="POD Studio turning a PDF into a finished episode: attach, create, stage progress, then an audio player" /></div>
            </figure>
            <p className="shot-note">Scripted mock-up of the real interface, not a recording of a live run.</p>
          </div>
        </section>

        <section className="strip" aria-label="Works with">
          <div className="wrap strip-in">
            <span className="mono">Bring your own keys</span>
            <ul><li>Google Gemini</li><li>OpenAI</li><li>Anthropic</li><li>ElevenLabs voices</li></ul>
          </div>
        </section>

        <section className="section" id="features">
          <div className="wrap">
            <p className="eyebrow" data-reveal>Features</p>
            <h2 data-reveal>Everything between a PDF and a podcast, in one window.</h2>
            <p className="section-lede" data-reveal>Attach a PDF, follow each stage, keep your library on disk, bring your own keys, and pick a theme. Here is each part in motion.</p>
          </div>
          <div className="wrap rows">
            {features.map((f, i) => (
              <article className={`row${i % 2 ? ' row-flip' : ''}`} key={f.n}>
                <div className="row-text">
                  <span className="row-n" data-reveal>{f.n}</span>
                  <h3 data-reveal>{f.title}</h3>
                  <p data-reveal>{f.body}</p>
                  <ul data-reveal>{f.points.map(p => <li key={p}>{p}</li>)}</ul>
                </div>
                <Frame>
                  {f.media.type === 'video'
                    ? <Clip src={f.media.src} poster={f.media.poster} label={f.media.label} />
                    : <img src={f.media.src} alt={f.media.alt} width="1600" height="1000" loading="lazy" decoding="async" />}
                </Frame>
              </article>
            ))}
          </div>
          <div className="wrap">
            <p className="shot-note shot-note-end" data-reveal>All clips above are scripted mock-ups of the app’s real interface, with sample episodes and a placeholder key. No real document or API call is shown.</p>
          </div>
        </section>

        <section className="section section-tint pipeline" id="how">
          <div className="wrap">
            <p className="eyebrow" data-reveal>How it works</p>
            <h2 data-reveal>Five steps, all started by one button.</h2>
            <div className="pipe">
              <div className="pipe-line" aria-hidden="true" />
              <ol>
                {steps.map(([n, name, text]) => (
                  <li key={n} data-reveal><span className="mono">{n}</span><strong>{name}</strong><p>{text}</p></li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="download" id="download">
          <div className="grid-band">
            <div className="wrap band-in">
              <p className="eyebrow" data-reveal>Download</p>
              <h2 data-reveal>POD Studio for Windows</h2>
              <p className="download-lede" data-reveal>One portable file. No installer, no account. Download it, run it, and add your keys in Settings.</p>
              <div className="pill-stage" data-reveal>
                <span className="sticker ticket"><b>No account</b><i>needed!</i></span>
                <a className="btn btn-yellow btn-pill" href={downloadHref} download>Download .exe <Arrow /></a>
                <Burst>Local-<br />first!</Burst>
              </div>
            </div>
          </div>
          <div className="wrap download-grid">
            <dl className="specs" data-reveal>
              <div><dt>Version</dt><dd>{release.version}</dd></div>
              <div><dt>Size</dt><dd>{sizeMb}</dd></div>
              <div><dt>Format</dt><dd>Portable .exe</dd></div>
              <div><dt>Requires</dt><dd>Windows 10/11, 64-bit</dd></div>
            </dl>
            <div className="verify" data-reveal>
              <p className="mono verify-label">SHA-256</p>
              <code className="hash" aria-label="SHA-256 checksum">{release.sha256}</code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyHash}>{copied ? 'Copied' : 'Copy checksum'}</button>
              <p className="verify-help">Check your download in PowerShell:</p>
              <code className="cmd">Get-FileHash .\{release.file} -Algorithm SHA256</code>
              <p className="verify-help">The build is not code-signed yet, so Windows SmartScreen may warn on first run. If the checksums match, choose <em>More info</em>, then <em>Run anyway</em>.</p>
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="wrap faq-grid">
            <div>
              <p className="eyebrow" data-reveal>FAQ</p>
              <h2 data-reveal>Questions, answered plainly.</h2>
            </div>
            <Faq />
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <p className="foot-note">This site sets no cookies and runs no analytics. Screenshots and clips are scripted mock-ups of the app’s real interface.</p>
          <div className="foot-bottom">
            <a className="foot-word" href="#top" aria-label="POD Studio, back to top">pod studio<Logo /></a>
            <a className="btn btn-ghost btn-sm foot-top" href="#top">Back to top <Arrow /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
