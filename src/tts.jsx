// TTS-engine abstractie
//
// Twee engines, zelfde interface:
//   WebSpeechEngine  — browser ingebouwd, direct klaar, lagere kwaliteit
//   PiperEngine      — neuraal (WASM), hoge kwaliteit, download vereist
//
// Later omschakelen naar externe Piper-server:
//   Vervang PiperEngine.load() + speak() door fetch-aanroepen naar de server.
//   De rest van de app hoeft dan niet te veranderen.

// ─── Beschikbare Piper-stemmen ────────────────────────────────────────────────
const PIPER_VOICES = [
  {
    id:       'nl-fenna',
    label:    'Fenna (NL)',
    lang:     'nl-NL',
    sizeMB:   63,
    modelUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx',
    cfgUrl:   'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx.json',
  },
  {
    id:       'nl-rdh',
    label:    'Rdh (NL)',
    lang:     'nl-NL',
    sizeMB:   63,
    modelUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/nl/nl_NL/rdh/medium/nl_NL-rdh-medium.onnx',
    cfgUrl:   'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/nl/nl_NL/rdh/medium/nl_NL-rdh-medium.onnx.json',
  },
  {
    id:       'en-hfc',
    label:    'Helen (EN)',
    lang:     'en-US',
    sizeMB:   65,
    modelUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx',
    cfgUrl:   'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx.json',
  },
];

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

// Proportionele schatting van woordtijdstippen op basis van audio-duur.
// Piper geeft geen boundary-events — dit is de WASM-benadering.
// Bij overstap naar externe server: vervang door echte timestamps uit API.
function estimateTimings(text, durationSec) {
  const timings = [];
  const re = /[\p{L}\p{N}']+/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    timings.push({
      charIdx: m.index,
      time: (m.index / Math.max(1, text.length)) * durationSec,
    });
  }
  return timings;
}

// Laad Piper-module eenmalig via ES module injection en zet globaal
let _piperModPromise = null;
function loadPiperModule() {
  if (window.PiperTTSClient) return Promise.resolve(window.PiperTTSClient);
  if (_piperModPromise)       return _piperModPromise;

  _piperModPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'module';
    // top-level await werkt in moderne browsers (Chrome 89+, Firefox 89+, Safari 15+)
    s.textContent = `
      try {
        const m = await import('https://cdn.jsdelivr.net/npm/@diffusion-studio/piper-web/+esm');
        window.PiperTTSClient = m.PiperTTSClient ?? m.default?.PiperTTSClient ?? m.default;
        window.dispatchEvent(new CustomEvent('_piperReady'));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('_piperError', { detail: String(err) }));
      }
    `;
    window.addEventListener('_piperReady', () => {
      window.PiperTTSClient
        ? resolve(window.PiperTTSClient)
        : reject(new Error('PiperTTSClient niet gevonden in module'));
    }, { once: true });
    window.addEventListener('_piperError', (e) => reject(new Error(e.detail)), { once: true });
    document.head.appendChild(s);
  });

  return _piperModPromise;
}

// Zet AudioBuffer / Blob / ArrayBuffer / TypedArray om naar AudioBuffer
async function toAudioBuffer(raw, ctx) {
  if (raw instanceof AudioBuffer) return raw;
  let ab;
  if (raw instanceof Blob)        ab = await raw.arrayBuffer();
  else if (raw instanceof ArrayBuffer) ab = raw;
  else if (ArrayBuffer.isView(raw))    ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  else throw new Error(`Onbekend audio-formaat van Piper: ${typeof raw}`);
  return ctx.decodeAudioData(ab);
}

// ─── PiperEngine ─────────────────────────────────────────────────────────────
class PiperEngine {
  constructor() {
    this._client      = null;
    this._voiceId     = null;
    this._audioCtx    = null;
    this._source      = null;
    this._rafId       = null;
    this._stopped     = true;
  }

  get engineId() { return 'piper'; }

  // Laad JS-module + stemmodel. onProgress({ phase, pct, sizeMB })
  async load(voiceId, onProgress) {
    if (this._voiceId === voiceId && this._client) return; // al geladen

    onProgress?.({ phase: 'module', pct: 0, sizeMB: 0 });
    const PiperTTSClient = await loadPiperModule();
    onProgress?.({ phase: 'module', pct: 100, sizeMB: 0 });

    const voice = PIPER_VOICES.find(v => v.id === voiceId);
    if (!voice) throw new Error(`Onbekende Piper-stem: ${voiceId}`);

    this._client = new PiperTTSClient();

    // Probeer met voortgangs-callback; niet alle versies ondersteunen dit
    const tryLoad = (withCb) => withCb
      ? this._client.loadVoice(voice.modelUrl, voice.cfgUrl,
          (pct) => onProgress?.({ phase: 'model', pct: Math.round(pct * 100), sizeMB: voice.sizeMB }))
      : this._client.loadVoice(voice.modelUrl, voice.cfgUrl);

    try {
      await tryLoad(true);
    } catch {
      await tryLoad(false);
    }

    this._voiceId = voiceId;
  }

  // Spreek text af vanaf startChar.
  // Omschakelen naar externe server: vervang de synthesize-aanroep door
  //   const res = await fetch('/api/tts', { method:'POST', body: JSON.stringify({ text, voice }) });
  //   const raw = await res.blob();
  async speak(text, startChar, { rate = 1.0, onStart, onBoundary, onEnd, onError } = {}) {
    if (!this._client) { onError?.(new Error('Piper niet geladen')); return; }

    this._stopInternal();
    this._stopped = false;

    try {
      const remaining = text.slice(startChar);
      const raw = await this._client.synthesize(remaining);

      const ctx = this._ctx();
      const buf = await toAudioBuffer(raw, ctx);

      const timings = estimateTimings(remaining, buf.duration / rate);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(ctx.destination);
      this._source = src;

      const t0 = ctx.currentTime;

      src.onended = () => {
        if (!this._stopped) { this._stopped = true; onEnd?.(); }
      };

      src.start();
      onStart?.();

      const track = () => {
        if (this._stopped) return;
        const elapsed = ctx.currentTime - t0;
        let hit = startChar;
        for (let i = timings.length - 1; i >= 0; i--) {
          if (timings[i].time <= elapsed) { hit = startChar + timings[i].charIdx; break; }
        }
        onBoundary?.(hit);
        this._rafId = requestAnimationFrame(track);
      };
      this._rafId = requestAnimationFrame(track);

    } catch (err) {
      onError?.(err);
    }
  }

  pause()   { this._ctx().suspend(); }
  resume()  { this._ctx().resume(); }
  stop()    { this._stopInternal(); }
  destroy() { this._stopInternal(); this._audioCtx?.close(); this._audioCtx = null; }

  _ctx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      this._audioCtx = new AudioContext();
    }
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
    return this._audioCtx;
  }

  _stopInternal() {
    this._stopped = true;
    cancelAnimationFrame(this._rafId);
    try { this._source?.stop(); } catch {}
    this._source = null;
  }
}

// ─── WebSpeechEngine ──────────────────────────────────────────────────────────
class WebSpeechEngine {
  get engineId() { return 'webspeech'; }
  load()         { return Promise.resolve(); }

  speak(text, startChar, { rate = 1.0, voiceProfile, voicesAvailable = [], onStart, onBoundary, onEnd, onError } = {}) {
    if (!('speechSynthesis' in window)) { onError?.(new Error('Web Speech niet beschikbaar')); return; }
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text.slice(startChar));
    u.rate = rate;

    if (voiceProfile) {
      u.lang = voiceProfile.lang;
      const sameLang = voicesAvailable.filter(v => v.lang.toLowerCase().startsWith(voiceProfile.lang.slice(0, 2)));
      const named    = sameLang.find(v => voiceProfile.match?.test(v.name));
      const picked   = named || sameLang[0];
      if (picked) u.voice = picked;
    }

    u.onstart    = () => onStart?.();
    u.onboundary = (ev) => { if (ev.name === 'word' || !ev.name) onBoundary?.(startChar + (ev.charIndex || 0)); };
    u.onend      = () => onEnd?.();
    u.onerror    = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') onError?.(e); };

    window.speechSynthesis.speak(u);
  }

  pause()   { window.speechSynthesis?.pause(); }
  resume()  { window.speechSynthesis?.resume(); }
  stop()    { window.speechSynthesis?.cancel(); }
  destroy() { this.stop(); }
}

Object.assign(window, { PiperEngine, WebSpeechEngine, PIPER_VOICES });
