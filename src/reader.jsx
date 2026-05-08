// Voorlees-interface met Web Speech API + woord-highlight
// Tokenizes text into words/punctuation, advances highlight on `boundary` events.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Tokenize: yields {text, start, end, isWord, sentenceIdx}
function tokenize(text) {
  const tokens = [];
  let i = 0;
  let sentenceIdx = 0;
  // Match either a word run [^\s] of letters/digits/-' or a single non-word char
  const re = /([\p{L}\p{N}][\p{L}\p{N}'\-]*)|(\s+)|([^\s])/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    const isWord = !!m[1];
    const isSpace = !!m[2];
    tokens.push({
      text: t,
      start: m.index,
      end: m.index + t.length,
      isWord,
      isSpace,
      sentenceIdx
    });
    // sentence terminator -> next token starts a new sentence
    if (!isWord && /[.!?]/.test(t)) sentenceIdx++;
  }
  return tokens;
}

const VOICE_PROFILES = [
  { id: 'nl-lotte', label: 'Lotte', lang: 'nl-NL', match: /lotte|Xander|Microsoft/i, fallbackLang: 'nl-NL' },
  { id: 'nl-daan',  label: 'Daan',  lang: 'nl-NL', match: /daan|Frank|Microsoft/i, fallbackLang: 'nl-NL' },
  { id: 'en-olivia', label: 'Olivia', lang: 'en-GB', match: /olivia|Daniel|Kate/i, fallbackLang: 'en-GB' },
  { id: 'en-aaron', label: 'Aaron', lang: 'en-US', match: /aaron|Alex|Samantha/i, fallbackLang: 'en-US' },
  { id: 'de-anna',  label: 'Anna',  lang: 'de-DE', match: /anna|Markus/i, fallbackLang: 'de-DE' },
  { id: 'fr-amelie', label: 'Amélie', lang: 'fr-FR', match: /amelie|Thomas/i, fallbackLang: 'fr-FR' },
  { id: 'es-monica', label: 'Mónica', lang: 'es-ES', match: /monica|Diego/i, fallbackLang: 'es-ES' },
];

function Reader({ doc, onClose, tweaks }) {
  const text = doc.body;
  const tokens = useMemo(() => tokenize(text), [text]);

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [charIdx, setCharIdx] = useState(0);
  const [rate, setRate] = useState(1.0);
  const [voiceId, setVoiceId] = useState(() => {
    const m = VOICE_PROFILES.find(v => v.lang === doc.lang);
    return (m || VOICE_PROFILES[0]).id;
  });
  const [voicesAvailable, setVoicesAvailable] = useState([]);
  const utterRef = useRef(null);
  const containerRef = useRef(null);

  // Load voices (async on Chrome)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoicesAvailable(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.onvoiceschanged = update;
  }, []);

  // pick a real voice for the chosen profile
  const pickVoice = useCallback((profileId) => {
    const profile = VOICE_PROFILES.find(v => v.id === profileId) || VOICE_PROFILES[0];
    const list = voicesAvailable;
    // Prefer same language
    const sameLang = list.filter(v => v.lang.toLowerCase().startsWith(profile.lang.slice(0,2).toLowerCase()));
    if (!sameLang.length) return null;
    // try matching name
    const named = sameLang.find(v => profile.match.test(v.name));
    return named || sameLang[0];
  }, [voicesAvailable]);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    setCharIdx(0);
  }, []);

  const speakFrom = useCallback((startChar = 0) => {
    if (!('speechSynthesis' in window)) {
      alert('Web Speech API niet beschikbaar in deze browser.');
      return;
    }
    window.speechSynthesis.cancel();

    const remaining = text.slice(startChar);
    const u = new SpeechSynthesisUtterance(remaining);
    u.rate = rate;
    u.lang = (VOICE_PROFILES.find(v => v.id === voiceId) || VOICE_PROFILES[0]).lang;
    const v = pickVoice(voiceId);
    if (v) u.voice = v;
    u.onstart = () => { setPlaying(true); setPaused(false); };
    u.onboundary = (ev) => {
      if (ev.name === 'word' || !ev.name) {
        setCharIdx(startChar + (ev.charIndex || 0));
      }
    };
    u.onend = () => {
      setPlaying(false);
      setPaused(false);
      setCharIdx(text.length);
    };
    u.onerror = (e) => {
      // 'interrupted' on cancel is normal; ignore
      if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('TTS error', e.error);
      }
    };
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  }, [text, rate, voiceId, pickVoice]);

  const play = useCallback(() => {
    if (paused && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setPaused(false);
      setPlaying(true);
    } else {
      speakFrom(charIdx);
    }
  }, [paused, charIdx, speakFrom]);

  const pause = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    setPaused(true);
    setPlaying(false);
  }, []);

  // When rate or voice changes during playback, restart from current position
  useEffect(() => {
    if (playing) {
      speakFrom(charIdx);
    }
    // eslint-disable-next-line
  }, [rate, voiceId]);

  // Cleanup on unmount
  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  // Click a word to jump there
  const onTokenClick = useCallback((tok) => {
    setCharIdx(tok.start);
    if (playing || paused) speakFrom(tok.start);
  }, [playing, paused, speakFrom]);

  // Determine current word/sentence
  const currentTokenIdx = useMemo(() => {
    if (!playing && !paused) return -1;
    let idx = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].start <= charIdx && tokens[i].end > charIdx && tokens[i].isWord) {
        return i;
      }
      if (tokens[i].start <= charIdx) idx = i;
    }
    return idx;
  }, [tokens, charIdx, playing, paused]);

  const currentSentence = currentTokenIdx >= 0 ? tokens[currentTokenIdx].sentenceIdx : -1;

  // progress percentage
  const progress = Math.min(100, Math.round((charIdx / Math.max(1, text.length)) * 100));

  // Tweak-driven styles
  const highlightMode = tweaks.highlightMode || 'word'; // 'word' | 'sentence' | 'both'
  const accent = tweaks.accent || '#a7f3d0';
  const sentenceTint = tweaks.sentenceTint || '#ecfdf5';
  const fontFamily = tweaks.font === 'dyslexic' ? '"Lexend", "Atkinson Hyperlegible", system-ui, sans-serif'
                   : tweaks.font === 'sans' ? '"Geist", system-ui, sans-serif'
                   : '"Source Serif 4", Georgia, serif';
  const fontSize = tweaks.fontSize || 22;
  const lineH = tweaks.lineHeight || 1.7;
  const colWidth = tweaks.colWidth || 720;
  const bgPaper = tweaks.paper === 'cream' ? '#fbf6e9'
                : tweaks.paper === 'dark' ? '#13211a'
                : tweaks.paper === 'mint' ? '#f0faf5'
                : '#ffffff';
  const inkColor = tweaks.paper === 'dark' ? '#e8efe9' : '#0f1f17';

  // Reading ruler vertical position
  const [rulerY, setRulerY] = useState(null);
  useEffect(() => {
    if (!tweaks.ruler) return;
    const onMove = (e) => {
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      setRulerY(e.clientY - r.top);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [tweaks.ruler]);

  return (
    <div className="reader-shell" style={{background: bgPaper, color: inkColor}}>
      <ReaderToolbar
        doc={doc}
        playing={playing}
        paused={paused}
        rate={rate}
        setRate={setRate}
        voiceId={voiceId}
        setVoiceId={setVoiceId}
        play={play}
        pause={pause}
        stop={stop}
        progress={progress}
        onClose={onClose}
        voicesAvailable={voicesAvailable}
      />

      <div className="reader-stage" ref={containerRef}>
        {tweaks.ruler && rulerY != null && (
          <>
            <div className="reader-ruler" style={{top: rulerY}}></div>
            <div className="reader-ruler-mask" style={{height: Math.max(0, rulerY - 30)}}></div>
            <div className="reader-ruler-mask" style={{top: rulerY + 30, bottom: 0}}></div>
          </>
        )}

        <div
          className="read-flow"
          style={{
            fontFamily,
            fontSize,
            lineHeight: lineH,
            maxWidth: colWidth,
            color: inkColor,
            ['--hl-word']: accent,
            ['--hl-sentence']: sentenceTint,
          }}
        >
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 13, color: tweaks.paper === 'dark' ? '#9ec3ad' : 'var(--muted)',
            marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap'
          }}>
            <span>{doc.subject}</span>
            <span>·</span>
            <span>{doc.teacher}</span>
            <span>·</span>
            <span>{doc.minutes} min</span>
          </div>
          <h1 style={{
            fontSize: '1.4em', fontWeight: 600, margin: '0 0 24px',
            letterSpacing: '-0.01em', lineHeight: 1.2
          }}>{doc.title}</h1>

          <p style={{margin: 0}}>
            {tokens.map((tok, i) => {
              if (tok.text === '\n\n') return <br key={i} />;
              if (tok.isSpace) {
                if (tok.text.includes('\n\n')) return <span key={i} style={{display:'block', height: '0.7em'}}></span>;
                return <span key={i}>{tok.text}</span>;
              }
              const isCurrent = i === currentTokenIdx && tok.isWord;
              const inSentence = (highlightMode !== 'word') && tok.sentenceIdx === currentSentence && currentSentence >= 0;
              const cls =
                'tok' +
                (isCurrent && (highlightMode === 'word' || highlightMode === 'both') ? ' tok-word' : '') +
                (inSentence ? ' tok-sentence' : '');
              return (
                <span
                  key={i}
                  className={cls}
                  onClick={tok.isWord ? () => onTokenClick(tok) : undefined}
                  data-tok={i}
                >{tok.text}</span>
              );
            })}
          </p>


        </div>
      </div>

      <ReaderStyle/>
    </div>
  );
}

function ReaderToolbar({ doc, playing, paused, rate, setRate, voiceId, setVoiceId, play, pause, stop, progress, onClose, voicesAvailable }) {
  const profile = VOICE_PROFILES.find(v => v.id === voiceId) || VOICE_PROFILES[0];

  return (
    <div className="reader-bar">
      <button className="btn btn-ghost btn-icon" onClick={onClose} title="Sluiten">
        <Icon name="arrowLeft" size={18}/>
      </button>
      <div className="reader-bar-title">
        <div className="reader-bar-doc">{doc.title}</div>
        <div className="reader-bar-meta">
          {playing ? <span className="row" style={{gap: 6, color: 'var(--primary)'}}><span className="live-dot"></span> Voorlezen</span>
           : paused ? <span className="row" style={{gap: 6, color: 'var(--muted)'}}>Gepauzeerd</span>
           : <span style={{color: 'var(--muted)'}}>Klaar om te starten</span>}
          <span style={{color: 'var(--muted-2)'}}>·</span>
          <span style={{color: 'var(--muted)'}}>{progress}%</span>
        </div>
      </div>

      <div className="row" style={{gap: 8}}>
        <div className="reader-controls">
          {!playing
            ? <button className="reader-play" onClick={play} title="Afspelen (spatie)">
                <Icon name="play" size={18}/>
              </button>
            : <button className="reader-play" onClick={pause} title="Pauzeren (spatie)">
                <Icon name="pause" size={18}/>
              </button>}
          <button className="btn btn-ghost btn-icon" onClick={stop} title="Stoppen">
            <Icon name="stop" size={16}/>
          </button>
        </div>

        <div className="reader-divider"></div>

        <div className="reader-select">
          <label>Snelheid</label>
          <div className="row" style={{gap: 4}}>
            {[0.75, 1.0, 1.25, 1.5].map(r => (
              <button key={r}
                className={'btn btn-sm ' + (rate === r ? 'btn-primary' : 'btn-ghost')}
                onClick={() => setRate(r)}
                style={{fontVariantNumeric: 'tabular-nums'}}
              >{r}×</button>
            ))}
          </div>
        </div>

        <div className="reader-divider"></div>

        <div className="reader-select">
          <label>Stem</label>
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="reader-voice-select"
          >
            <optgroup label="Nederlands">
              <option value="nl-lotte">Lotte (NL)</option>
              <option value="nl-daan">Daan (NL)</option>
            </optgroup>
            <optgroup label="English">
              <option value="en-olivia">Olivia (UK)</option>
              <option value="en-aaron">Aaron (US)</option>
            </optgroup>
            <optgroup label="Andere">
              <option value="de-anna">Anna (DE)</option>
              <option value="fr-amelie">Amélie (FR)</option>
              <option value="es-monica">Mónica (ES)</option>
            </optgroup>
          </select>
        </div>
      </div>

      <div className="reader-progress">
        <div style={{width: `${progress}%`}}></div>
      </div>
    </div>
  );
}

function ReaderStyle() {
  return (
    <style>{`
      .reader-shell {
        position: fixed; inset: 0;
        z-index: 100;
        display: flex; flex-direction: column;
        background: #fff;
        animation: readerIn .25s ease-out;
      }
      @keyframes readerIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .reader-bar {
        position: relative;
        display: grid;
        grid-template-columns: 40px 1fr auto;
        gap: 14px;
        align-items: center;
        padding: 12px 20px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        z-index: 5;
      }
      .reader-bar-title { min-width: 0; }
      .reader-bar-doc {
        font-weight: 600; font-size: 14px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .reader-bar-meta {
        display: flex; align-items: center; gap: 8px;
        font-size: 12px; color: var(--muted);
        margin-top: 1px;
      }
      .reader-controls {
        display: flex; align-items: center; gap: 4px;
      }
      .reader-play {
        appearance: none; border: 0;
        width: 40px; height: 40px;
        border-radius: 50%;
        background: var(--primary);
        color: #fff;
        display: grid; place-items: center;
        cursor: pointer;
        box-shadow: 0 4px 12px -4px rgba(6,78,59,.35);
        transition: transform .12s, background .15s;
      }
      .reader-play:hover { background: #053a2c; transform: scale(1.04); }
      .reader-play:active { transform: scale(0.96); }
      .reader-divider {
        width: 1px; height: 26px; background: var(--border);
      }
      .reader-select {
        display: flex; flex-direction: column; gap: 2px;
      }
      .reader-select label {
        font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
        color: var(--muted-2); text-transform: uppercase;
      }
      .reader-voice-select {
        appearance: none;
        background: var(--surface);
        border: 1px solid var(--border-strong);
        padding: 5px 26px 5px 10px;
        border-radius: 8px;
        font-size: 12.5px;
        cursor: pointer;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none' stroke='%236b7d72' stroke-width='1.4' stroke-linecap='round'%3e%3cpath d='M1 1l4 4 4-4'/%3e%3c/svg%3e");
        background-repeat: no-repeat;
        background-position: right 8px center;
      }

      .reader-progress {
        position: absolute; left: 0; right: 0; bottom: -1px;
        height: 2px; background: transparent;
      }
      .reader-progress > div {
        height: 100%;
        background: linear-gradient(90deg, var(--accent), var(--primary));
        transition: width .18s linear;
      }

      .reader-stage {
        position: relative;
        flex: 1;
        overflow-y: auto;
        padding: 56px 28px 120px;
        display: flex;
        justify-content: center;
      }
      .read-flow {
        position: relative;
        z-index: 1;
      }
      .read-flow p { margin: 0; }

      .tok { transition: background-color .12s, color .12s; border-radius: 3px; padding: 0 1px; }
      .tok-sentence { background: var(--hl-sentence); }
      .tok-word {
        background: var(--hl-word);
        box-shadow: 0 0 0 2px var(--hl-word);
        border-radius: 4px;
      }
      .read-flow .tok[data-tok]:hover { cursor: pointer; outline: 1px dashed rgba(0,0,0,.18); outline-offset: 1px; }

      .reader-ruler {
        position: absolute;
        left: 0; right: 0;
        height: 60px;
        margin-top: -30px;
        background: rgba(16,185,129,.08);
        border-top: 1px solid rgba(16,185,129,.35);
        border-bottom: 1px solid rgba(16,185,129,.35);
        pointer-events: none;
        z-index: 0;
      }
      .reader-ruler-mask {
        position: absolute;
        left: 0; right: 0;
        background: rgba(255,255,255,.55);
        backdrop-filter: blur(0.4px);
        pointer-events: none;
        z-index: 0;
      }
      .reader-ruler-mask:first-of-type { top: 0; }
    `}</style>
  );
}

window.Reader = Reader;
window.tokenize = tokenize;
