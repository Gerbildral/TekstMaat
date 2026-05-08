// Voorlees-reader: toont PDF, DOCX of opgemaakte tekst in het document zelf.
// Woord-voor-woord highlight via Web Speech API boundary events.
// OCR-fallback via Tesseract.js voor gescande (afbeelding-)pagina's.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Tokenizer ────────────────────────────────────────────────────────────────
function tokenize(text) {
  const tokens = [];
  let sentenceIdx = 0;
  const re = /([\p{L}\p{N}][\p{L}\p{N}'\-]*)|(\s+)|([^\s])/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    const isWord = !!m[1];
    const isSpace = !!m[2];
    tokens.push({ text: t, start: m.index, end: m.index + t.length, isWord, isSpace, sentenceIdx });
    if (!isWord && /[.!?]/.test(t)) sentenceIdx++;
  }
  return tokens;
}

// ─── Stemprofielen ────────────────────────────────────────────────────────────
const VOICE_PROFILES = [
  { id: 'nl-lotte',  label: 'Lotte',  lang: 'nl-NL', match: /lotte|Xander|Microsoft/i },
  { id: 'nl-daan',   label: 'Daan',   lang: 'nl-NL', match: /daan|Frank|Microsoft/i },
  { id: 'en-olivia', label: 'Olivia', lang: 'en-GB', match: /olivia|Daniel|Kate/i },
  { id: 'en-aaron',  label: 'Aaron',  lang: 'en-US', match: /aaron|Alex|Samantha/i },
  { id: 'de-anna',   label: 'Anna',   lang: 'de-DE', match: /anna|Markus/i },
  { id: 'fr-amelie', label: 'Amélie', lang: 'fr-FR', match: /amelie|Thomas/i },
  { id: 'es-monica', label: 'Mónica', lang: 'es-ES', match: /monica|Diego/i },
];

// ─── PDF pagina-renderer ──────────────────────────────────────────────────────
// Rendert één PDF-pagina op een canvas en een overlay-canvas voor highlights.
function PDFPageCanvas({ page, containerWidth, onReady }) {
  const wrapRef    = useRef(null);
  const canvasRef  = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const availW  = Math.max(360, containerWidth - 56);
    const baseVP  = page.getViewport({ scale: 1 });
    const scale   = Math.min(availW / baseVP.width, 3);
    const vp      = page.getViewport({ scale });

    const canvas  = canvasRef.current;
    canvas.width  = vp.width;
    canvas.height = vp.height;

    const overlay  = overlayRef.current;
    overlay.width  = vp.width;
    overlay.height = vp.height;

    const ctx = canvas.getContext('2d');
    page.render({ canvasContext: ctx, viewport: vp }).promise.then(() => {
      onReady(overlay, vp);
    });
  }, [page, containerWidth]);

  return (
    <div ref={wrapRef} className="pdf-page-container">
      <canvas ref={canvasRef} className="pdf-canvas" />
      <canvas ref={overlayRef} className="pdf-overlay" />
    </div>
  );
}

// ─── PDF document-viewer ──────────────────────────────────────────────────────
function PDFDocumentViewer({ fileData, charIdx, playing, paused, accent, onTextReady, containerWidth }) {
  const [pages,     setPages]     = useState([]);   // [{page, vp, textItems}]
  const [loadState, setLoadState] = useState('loading');
  const [ocrPages,  setOcrPages]  = useState([]);   // indices van pagina's die OCR nodig hebben
  const charMapRef  = useRef([]);  // [{start, end, pageIdx, bbox:{x,y,w,h}}]
  const overlaysRef = useRef({});  // pageIdx → overlay canvas element
  const viewportsRef= useRef({});  // pageIdx → viewport
  const prevHitRef  = useRef(null);

  // Laad PDF
  useEffect(() => {
    if (!fileData) return;
    if (typeof pdfjsLib === 'undefined') { setLoadState('error'); return; }
    let cancelled = false;

    (async () => {
      try {
        setLoadState('loading');
        const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
        if (cancelled) return;

        const pageList = [];
        const noTextPages = [];
        let fullText = '';
        let pos = 0;
        const charMap = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc   = await page.getTextContent();
          const items = tc.items.filter(it => it.str && it.str.trim());

          pageList.push({ page, textItems: items });

          if (items.length === 0) {
            noTextPages.push(i - 1);
          } else {
            items.forEach(item => {
              charMap.push({ start: pos, end: pos + item.str.length, pageIdx: i - 1, item });
              fullText += (fullText ? ' ' : '') + item.str;
              pos += item.str.length + 1;
            });
          }
        }

        if (cancelled) return;
        charMapRef.current = charMap;
        setPages(pageList);
        setOcrPages(noTextPages);
        setLoadState('ready');
        if (fullText.trim()) onTextReady(fullText);
        else if (noTextPages.length) setLoadState('ocr');
      } catch (err) {
        console.error('PDF fout:', err);
        if (!cancelled) setLoadState('error');
      }
    })();

    return () => { cancelled = true; };
  }, [fileData]);

  // Teken highlight op overlay-canvas
  useEffect(() => {
    // Wis vorige highlight
    if (prevHitRef.current) {
      const { canvas, bbox } = prevHitRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(bbox.x - 4, bbox.y - 4, bbox.w + 8, bbox.h + 8);
      prevHitRef.current = null;
    }
    if (!playing && !paused) return;

    const map = charMapRef.current;
    if (!map.length) return;

    // Vind het meest passende item voor de huidige charIdx
    let hit = null;
    for (let i = 0; i < map.length; i++) {
      if (map[i].start <= charIdx && charIdx < map[i].end) { hit = map[i]; break; }
    }
    if (!hit) {
      for (let i = map.length - 1; i >= 0; i--) {
        if (map[i].start <= charIdx) { hit = map[i]; break; }
      }
    }
    if (!hit) return;

    const canvas = overlaysRef.current[hit.pageIdx];
    const vp     = viewportsRef.current[hit.pageIdx];
    if (!canvas || !vp) return;

    // Bereken bounding box in canvas-coördinaten
    const item = hit.item;
    const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
    const [a, b] = tx;
    const fontSize = Math.sqrt(a * a + b * b);
    const x = tx[4];
    const y = tx[5] - fontSize;
    const w = item.width * vp.scale;
    const h = fontSize * 1.15;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = hexToRgba(accent, 0.55);
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 1, w + 4, h + 2, 3);
    ctx.fill();

    prevHitRef.current = { canvas, bbox: { x: x - 2, y: y - 1, w: w + 4, h: h + 2 } };

    // Scroll pagina in beeld
    const pageEl = canvas.closest('.pdf-page-container');
    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [charIdx, playing, paused, accent]);

  const handlePageReady = useCallback((pageIdx, overlayCanvas, vp) => {
    overlaysRef.current[pageIdx] = overlayCanvas;
    viewportsRef.current[pageIdx] = vp;
  }, []);

  if (loadState === 'loading') {
    return (
      <div className="doc-status">
        <div className="spinner" />
        <span>PDF laden…</span>
      </div>
    );
  }
  if (loadState === 'error') {
    return (
      <div className="doc-status" style={{ color: 'var(--danger)' }}>
        Kan dit bestand niet openen. Controleer of het een geldig PDF- of Word-document is.
      </div>
    );
  }

  return (
    <div className="pdf-pages-wrap">
      {pages.map(({ page }, i) => (
        <PDFPageCanvas
          key={i}
          page={page}
          containerWidth={containerWidth}
          onReady={(overlayCanvas, vp) => handlePageReady(i, overlayCanvas, vp)}
        />
      ))}

      {ocrPages.length > 0 && (
        <OCRRunner
          pages={pages}
          ocrPageIndices={ocrPages}
          onTextFound={(text) => { onTextReady(text); setLoadState('ready'); }}
        />
      )}
    </div>
  );
}

// Zet hex-kleur (#aabbcc) om naar rgba-string
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── OCR-runner voor gescande pagina's ───────────────────────────────────────
function OCRRunner({ pages, ocrPageIndices, onTextFound }) {
  const [status, setStatus] = useState('Tekst herkennen (OCR)…');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof Tesseract === 'undefined') {
      setStatus('Tesseract.js niet beschikbaar — tekst kan niet worden herkend.');
      return;
    }
    let cancelled = false;

    (async () => {
      let allText = '';
      for (let idx = 0; idx < ocrPageIndices.length; idx++) {
        if (cancelled) return;
        const pageIdx = ocrPageIndices[idx];
        const { page } = pages[pageIdx];
        const vp = page.getViewport({ scale: 2 });

        // Render pagina naar een tijdelijk canvas voor OCR
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width  = vp.width;
        tempCanvas.height = vp.height;
        const ctx = tempCanvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        setStatus(`Pagina ${pageIdx + 1} herkennen…`);
        setProgress(Math.round((idx / ocrPageIndices.length) * 100));

        const result = await Tesseract.recognize(tempCanvas, 'nld+eng', {
          logger: m => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100));
            }
          }
        });
        allText += (allText ? '\n\n' : '') + result.data.text;
      }
      if (!cancelled && allText.trim()) {
        onTextFound(allText);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="doc-status" style={{ flexDirection: 'column', gap: 10 }}>
      <div className="spinner" />
      <span style={{ fontWeight: 500 }}>{status}</span>
      {progress > 0 && progress < 100 && (
        <div className="progress-bar" style={{ width: 240 }}>
          <div style={{ width: `${progress}%` }} />
        </div>
      )}
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        Dit document bevat gescande afbeeldingen. Tekst wordt automatisch herkend.
      </span>
    </div>
  );
}

// ─── DOCX-viewer ──────────────────────────────────────────────────────────────
function DocxDocumentViewer({ fileData, charIdx, playing, paused, highlightMode, accent, sentenceTint, fontFamily, fontSize, lineH, bgPaper, inkColor, onTextReady }) {
  const [tokens,    setTokens]    = useState([]);
  const [loadState, setLoadState] = useState('loading');

  useEffect(() => {
    if (!fileData) return;
    if (typeof mammoth === 'undefined') { setLoadState('error'); return; }

    mammoth.convertToHtml({ arrayBuffer: fileData })
      .then(result => {
        const div = document.createElement('div');
        div.innerHTML = result.value;
        const text = div.textContent || '';
        setTokens(tokenize(text));
        setLoadState('ready');
        onTextReady(text);
      })
      .catch(() => setLoadState('error'));
  }, [fileData]);

  if (loadState === 'loading') {
    return <div className="doc-status"><div className="spinner" /><span>Document laden…</span></div>;
  }
  if (loadState === 'error') {
    return <div className="doc-status" style={{ color: 'var(--danger)' }}>Kan dit document niet openen.</div>;
  }

  const curTokIdx = (() => {
    if (!playing && !paused) return -1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].start <= charIdx && tokens[i].end > charIdx && tokens[i].isWord) return i;
    }
    return -1;
  })();
  const curSentence = curTokIdx >= 0 ? tokens[curTokIdx].sentenceIdx : -1;

  return (
    <div className="doc-page-wrap">
      <div className="doc-page" style={{ background: bgPaper, color: inkColor }}>
        <div className="read-flow" style={{ fontFamily, fontSize, lineHeight: lineH, '--hl-word': accent, '--hl-sentence': sentenceTint }}>
          <p style={{ margin: 0 }}>
            {tokens.map((tok, i) => {
              if (tok.isSpace) {
                if (tok.text.includes('\n\n')) return <span key={i} style={{ display: 'block', height: '0.8em' }} />;
                return <span key={i}>{tok.text}</span>;
              }
              const isCurrent = i === curTokIdx && tok.isWord;
              const inSentence = highlightMode !== 'word' && tok.sentenceIdx === curSentence && curSentence >= 0;
              const cls = 'tok' +
                (isCurrent && highlightMode !== 'sentence' ? ' tok-word' : '') +
                (inSentence ? ' tok-sentence' : '');
              return <span key={i} className={cls}>{tok.text}</span>;
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Tekst-viewer (opgemaakte demo-teksten) ───────────────────────────────────
function TextDocumentViewer({ doc, tokens, curTokIdx, curSentence, highlightMode, accent, sentenceTint, fontFamily, fontSize, lineH, colWidth, bgPaper, inkColor, onTokenClick }) {
  return (
    <div className="doc-page-wrap" style={{ maxWidth: colWidth }}>
      <div className="doc-page" style={{ background: bgPaper, color: inkColor }}>
        <div
          className="read-flow"
          style={{ fontFamily, fontSize, lineHeight: lineH, color: inkColor, '--hl-word': accent, '--hl-sentence': sentenceTint }}
        >
          <div className="doc-meta">
            <span>{doc.subject}</span>
            <span>·</span>
            <span>{doc.teacher}</span>
            <span>·</span>
            <span>{doc.minutes} min</span>
          </div>
          <h1 className="doc-title">{doc.title}</h1>
          <p style={{ margin: 0 }}>
            {tokens.map((tok, i) => {
              if (tok.isSpace) {
                if (tok.text.includes('\n\n')) return <span key={i} style={{ display: 'block', height: '0.8em' }} />;
                return <span key={i}>{tok.text}</span>;
              }
              const isCurrent = i === curTokIdx && tok.isWord;
              const inSentence = highlightMode !== 'word' && tok.sentenceIdx === curSentence && curSentence >= 0;
              const cls = 'tok' +
                (isCurrent && highlightMode !== 'sentence' ? ' tok-word' : '') +
                (inSentence ? ' tok-sentence' : '');
              return (
                <span key={i} className={cls} onClick={tok.isWord ? () => onTokenClick(tok) : undefined}
                  data-tok={i}>{tok.text}</span>
              );
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Hoofd-Reader ─────────────────────────────────────────────────────────────
function Reader({ doc, onClose, tweaks }) {
  const fileType = doc.fileType || 'text';

  // TTS-tekst: voor 'text' direct beschikbaar, voor pdf/docx aangeleverd via callback
  const [ttsText, setTtsText] = useState(fileType === 'text' ? (doc.body || '') : '');
  const tokens = useMemo(() => tokenize(ttsText), [ttsText]);

  const [playing,  setPlaying]  = useState(false);
  const [paused,   setPaused]   = useState(false);
  const [charIdx,  setCharIdx]  = useState(0);
  const [rate,     setRate]     = useState(1.0);
  const [voiceId,  setVoiceId]  = useState(() => {
    const m = VOICE_PROFILES.find(v => v.lang === doc.lang);
    return (m || VOICE_PROFILES[0]).id;
  });
  const [voicesAvailable, setVoicesAvailable] = useState([]);
  const stageRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(900);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoicesAvailable(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.onvoiceschanged = update;
  }, []);

  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver(([e]) => setStageWidth(e.contentRect.width));
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  const pickVoice = useCallback((profileId) => {
    const profile = VOICE_PROFILES.find(v => v.id === profileId) || VOICE_PROFILES[0];
    const sameLang = voicesAvailable.filter(v => v.lang.toLowerCase().startsWith(profile.lang.slice(0, 2).toLowerCase()));
    if (!sameLang.length) return null;
    return sameLang.find(v => profile.match.test(v.name)) || sameLang[0];
  }, [voicesAvailable]);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false); setPaused(false); setCharIdx(0);
  }, []);

  const speakFrom = useCallback((startChar = 0) => {
    if (!('speechSynthesis' in window)) { alert('Web Speech API niet beschikbaar in deze browser.'); return; }
    if (!ttsText) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(ttsText.slice(startChar));
    u.rate = rate;
    u.lang = (VOICE_PROFILES.find(v => v.id === voiceId) || VOICE_PROFILES[0]).lang;
    const v = pickVoice(voiceId);
    if (v) u.voice = v;
    u.onstart   = () => { setPlaying(true); setPaused(false); };
    u.onboundary = (ev) => {
      if (ev.name === 'word' || !ev.name) setCharIdx(startChar + (ev.charIndex || 0));
    };
    u.onend   = () => { setPlaying(false); setPaused(false); setCharIdx(ttsText.length); };
    u.onerror = (e) => {
      if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') console.warn('TTS fout:', e.error);
    };
    window.speechSynthesis.speak(u);
  }, [ttsText, rate, voiceId, pickVoice]);

  const play = useCallback(() => {
    if (paused && 'speechSynthesis' in window) {
      window.speechSynthesis.resume(); setPaused(false); setPlaying(true);
    } else {
      speakFrom(charIdx);
    }
  }, [paused, charIdx, speakFrom]);

  const pause = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    setPaused(true); setPlaying(false);
  }, []);

  // Herstart bij tempo- of stemwijziging tijdens afspelen
  useEffect(() => { if (playing) speakFrom(charIdx); }, [rate, voiceId]);

  // Stop bij sluiten
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

  // Start TTS automatisch zodra de PDF/DOCX-tekst beschikbaar komt
  const handleTextReady = useCallback((text) => {
    setTtsText(text);
  }, []);

  // Klik op woord → spring naar die positie
  const onTokenClick = useCallback((tok) => {
    setCharIdx(tok.start);
    if (playing || paused) speakFrom(tok.start);
  }, [playing, paused, speakFrom]);

  // Huidige token & zin (voor tekst-viewer)
  const curTokIdx = useMemo(() => {
    if (!playing && !paused) return -1;
    let idx = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].start <= charIdx && tokens[i].end > charIdx && tokens[i].isWord) return i;
      if (tokens[i].start <= charIdx) idx = i;
    }
    return idx;
  }, [tokens, charIdx, playing, paused]);
  const curSentence = curTokIdx >= 0 ? tokens[curTokIdx].sentenceIdx : -1;

  const progress = Math.min(100, Math.round((charIdx / Math.max(1, ttsText.length)) * 100));

  // Tweaks
  const highlightMode = tweaks.highlightMode || 'word';
  const accent        = tweaks.accent        || '#a7f3d0';
  const sentenceTint  = tweaks.sentenceTint  || '#ecfdf5';
  const fontFamily    = tweaks.font === 'dyslexic' ? '"Lexend","Atkinson Hyperlegible",system-ui,sans-serif'
                      : tweaks.font === 'sans' ? '"Geist",system-ui,sans-serif'
                      : '"Source Serif 4",Georgia,serif';
  const fontSize = tweaks.fontSize  || 22;
  const lineH    = tweaks.lineHeight || 1.7;
  const colWidth = tweaks.colWidth  || 720;
  const bgPaper  = tweaks.paper === 'cream' ? '#fbf6e9'
                 : tweaks.paper === 'dark'  ? '#13211a'
                 : tweaks.paper === 'mint'  ? '#f0faf5' : '#ffffff';
  const inkColor = tweaks.paper === 'dark' ? '#e8efe9' : '#0f1f17';

  // Leesliniaal
  const [rulerY, setRulerY] = useState(null);
  useEffect(() => {
    if (!tweaks.ruler) return;
    const onMove = (e) => {
      const r = stageRef.current?.getBoundingClientRect();
      if (r) setRulerY(e.clientY - r.top);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [tweaks.ruler]);

  const stageBg = fileType === 'text' ? bgPaper : 'var(--bg)';

  return (
    <div className="reader-shell" style={{ background: stageBg }}>
      <ReaderToolbar
        doc={doc} playing={playing} paused={paused} rate={rate} setRate={setRate}
        voiceId={voiceId} setVoiceId={setVoiceId} play={play} pause={pause} stop={stop}
        progress={progress} onClose={onClose} canPlay={!!ttsText} fileType={fileType}
      />

      <div className="reader-stage" ref={stageRef} style={{ background: stageBg }}>
        {tweaks.ruler && rulerY != null && (
          <>
            <div className="reader-ruler" style={{ top: rulerY }} />
            <div className="reader-ruler-mask" style={{ height: Math.max(0, rulerY - 30) }} />
            <div className="reader-ruler-mask" style={{ top: rulerY + 30, bottom: 0 }} />
          </>
        )}

        {fileType === 'text' && (
          <TextDocumentViewer
            doc={doc} tokens={tokens} curTokIdx={curTokIdx} curSentence={curSentence}
            highlightMode={highlightMode} accent={accent} sentenceTint={sentenceTint}
            fontFamily={fontFamily} fontSize={fontSize} lineH={lineH} colWidth={colWidth}
            bgPaper={bgPaper} inkColor={inkColor} onTokenClick={onTokenClick}
          />
        )}

        {fileType === 'pdf' && (
          <PDFDocumentViewer
            fileData={doc.fileData}
            charIdx={charIdx} playing={playing} paused={paused}
            highlightMode={highlightMode} accent={accent}
            onTextReady={handleTextReady}
            containerWidth={stageWidth}
          />
        )}

        {fileType === 'docx' && (
          <DocxDocumentViewer
            fileData={doc.fileData}
            charIdx={charIdx} playing={playing} paused={paused}
            highlightMode={highlightMode} accent={accent} sentenceTint={sentenceTint}
            fontFamily={fontFamily} fontSize={fontSize} lineH={lineH}
            bgPaper={bgPaper} inkColor={inkColor}
            onTextReady={handleTextReady}
          />
        )}
      </div>

      <ReaderStyle />
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function ReaderToolbar({ doc, playing, paused, rate, setRate, voiceId, setVoiceId, play, pause, stop, progress, onClose, canPlay, fileType }) {
  return (
    <div className="reader-bar">
      <button className="btn btn-ghost btn-icon" onClick={onClose} title="Sluiten">
        <Icon name="arrowLeft" size={18} />
      </button>

      <div className="reader-bar-title">
        <div className="reader-bar-doc">{doc.title}</div>
        <div className="reader-bar-meta">
          {playing
            ? <span className="row" style={{ gap: 6, color: 'var(--primary)' }}><span className="live-dot" />Voorlezen</span>
            : paused
              ? <span className="row" style={{ gap: 6, color: 'var(--muted)' }}>Gepauzeerd</span>
              : !canPlay
                ? <span style={{ color: 'var(--muted)' }}>
                    {fileType === 'pdf' ? 'PDF laden…' : fileType === 'docx' ? 'Document laden…' : 'Klaar'}
                  </span>
                : <span style={{ color: 'var(--muted)' }}>Klaar om te starten</span>}
          <span style={{ color: 'var(--muted-2)' }}>·</span>
          <span style={{ color: 'var(--muted)' }}>{progress}%</span>
          {fileType !== 'text' && (
            <>
              <span style={{ color: 'var(--muted-2)' }}>·</span>
              <span className="chip" style={{ fontSize: 11, padding: '1px 7px' }}>
                {fileType.toUpperCase()}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="reader-controls">
          {!playing
            ? <button className="reader-play" onClick={play} disabled={!canPlay} title="Afspelen (spatie)">
                <Icon name="play" size={18} />
              </button>
            : <button className="reader-play" onClick={pause} title="Pauzeren (spatie)">
                <Icon name="pause" size={18} />
              </button>}
          <button className="btn btn-ghost btn-icon" onClick={stop} title="Stoppen">
            <Icon name="stop" size={16} />
          </button>
        </div>

        <div className="reader-divider" />

        <div className="reader-select">
          <label>Snelheid</label>
          <div className="row" style={{ gap: 4 }}>
            {[0.75, 1.0, 1.25, 1.5].map(r => (
              <button key={r}
                className={'btn btn-sm ' + (rate === r ? 'btn-primary' : 'btn-ghost')}
                onClick={() => setRate(r)}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >{r}×</button>
            ))}
          </div>
        </div>

        <div className="reader-divider" />

        <div className="reader-select">
          <label>Stem</label>
          <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="reader-voice-select">
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
        <div style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

// ─── Stijlen ──────────────────────────────────────────────────────────────────
function ReaderStyle() {
  return (
    <style>{`
      .reader-shell {
        position: fixed; inset: 0;
        z-index: 100;
        display: flex; flex-direction: column;
        animation: readerIn .25s ease-out;
      }
      @keyframes readerIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Toolbar */
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
        flex: 0 0 auto;
      }
      .reader-bar-title { min-width: 0; }
      .reader-bar-doc { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .reader-bar-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin-top: 1px; }
      .reader-controls { display: flex; align-items: center; gap: 4px; }
      .reader-play {
        appearance: none; border: 0;
        width: 40px; height: 40px; border-radius: 50%;
        background: var(--primary); color: #fff;
        display: grid; place-items: center; cursor: pointer;
        box-shadow: 0 4px 12px -4px rgba(6,78,59,.35);
        transition: transform .12s, background .15s;
      }
      .reader-play:hover:not(:disabled) { background: #053a2c; transform: scale(1.04); }
      .reader-play:active:not(:disabled) { transform: scale(0.96); }
      .reader-play:disabled { opacity: .45; cursor: not-allowed; }
      .reader-divider { width: 1px; height: 26px; background: var(--border); }
      .reader-select { display: flex; flex-direction: column; gap: 2px; }
      .reader-select label { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--muted-2); text-transform: uppercase; }
      .reader-voice-select {
        appearance: none; background: var(--surface); border: 1px solid var(--border-strong);
        padding: 5px 26px 5px 10px; border-radius: 8px; font-size: 12.5px; cursor: pointer;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none' stroke='%236b7d72' stroke-width='1.4' stroke-linecap='round'%3e%3cpath d='M1 1l4 4 4-4'/%3e%3c/svg%3e");
        background-repeat: no-repeat; background-position: right 8px center;
      }
      .reader-progress {
        position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
      }
      .reader-progress > div {
        height: 100%; background: linear-gradient(90deg, var(--accent), var(--primary));
        transition: width .18s linear;
      }

      /* Scroll-gebied */
      .reader-stage {
        position: relative; flex: 1; overflow-y: auto;
        padding: 48px 28px 120px;
        display: flex; flex-direction: column; align-items: center;
      }

      /* Tekst-document pagina (demo-teksten + DOCX) */
      .doc-page-wrap { width: 100%; }
      .doc-page {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,.06), 0 20px 60px -20px rgba(0,0,0,.08);
        padding: 56px 72px 72px;
        min-height: 400px;
      }
      .doc-meta {
        display: flex; gap: 8px; font-family: var(--font-ui);
        font-size: 12px; color: var(--muted); margin-bottom: 18px;
      }
      .doc-title {
        font-size: 1.35em; font-weight: 600; margin: 0 0 28px;
        letter-spacing: -0.01em; line-height: 1.2;
      }
      .read-flow p { margin: 0; }

      /* Woord/zin highlight in tekst-viewer */
      .tok { transition: background-color .1s, color .1s; border-radius: 3px; padding: 0 1px; }
      .tok-sentence { background: var(--hl-sentence); }
      .tok-word { background: var(--hl-word); box-shadow: 0 0 0 2px var(--hl-word); border-radius: 4px; }
      .read-flow .tok[data-tok]:hover { cursor: pointer; outline: 1px dashed rgba(0,0,0,.18); outline-offset: 1px; }

      /* PDF-pagina's */
      .pdf-pages-wrap {
        width: 100%; display: flex; flex-direction: column; align-items: center; gap: 20px;
      }
      .pdf-page-container {
        position: relative; display: inline-block;
        box-shadow: 0 2px 8px rgba(0,0,0,.10), 0 20px 60px -20px rgba(0,0,0,.12);
        border-radius: 2px; overflow: hidden;
        border: 1px solid rgba(0,0,0,.06);
      }
      .pdf-canvas  { display: block; }
      .pdf-overlay {
        position: absolute; inset: 0;
        pointer-events: none;
      }

      /* Laad- en OCR-status */
      .doc-status {
        display: flex; align-items: center; gap: 14px;
        padding: 48px 24px; color: var(--muted); font-size: 14px;
      }
      .ocr-status {
        display: flex; flex-direction: column; align-items: center; gap: 10px;
        padding: 32px 24px; color: var(--muted); font-size: 13.5px; text-align: center;
        background: var(--surface-2); border: 1px solid var(--border);
        border-radius: var(--radius); margin-top: 8px; width: 100%;
      }

      /* Spinner */
      .spinner {
        width: 18px; height: 18px; border-radius: 50%;
        border: 2px solid var(--border-strong);
        border-top-color: var(--primary);
        animation: spin .7s linear infinite;
        flex: 0 0 18px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Leesliniaal */
      .reader-ruler {
        position: absolute; left: 0; right: 0; height: 60px; margin-top: -30px;
        background: rgba(16,185,129,.08);
        border-top: 1px solid rgba(16,185,129,.35);
        border-bottom: 1px solid rgba(16,185,129,.35);
        pointer-events: none; z-index: 2;
      }
      .reader-ruler-mask {
        position: absolute; left: 0; right: 0;
        background: rgba(255,255,255,.55); backdrop-filter: blur(0.4px);
        pointer-events: none; z-index: 2;
      }
    `}</style>
  );
}

window.Reader = Reader;
window.tokenize = tokenize;
