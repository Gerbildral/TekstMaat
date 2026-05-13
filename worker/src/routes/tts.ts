/**
 * TTS routes: /api/tts (POST) en /api/tts/voices (GET)
 * Proxy naar Inworld TTS API — API key blijft server-side
 */

import type { Env, AuthUser } from '../index';
import { errorResponse, corsHeaders } from '../utils/responses';

const INWORLD_BASE = 'https://api.inworld.ai';
const STREAM_ENDPOINT = `${INWORLD_BASE}/tts/v1/voice:stream`;
const VOICES_ENDPOINT = `${INWORLD_BASE}/tts/v1/voices`;
const DEFAULT_MODEL = 'inworld-tts-2';
const SAMPLE_RATE = 24000;

export async function handleTTS(
  request: Request,
  env: Env,
  user: AuthUser,
  path: string
): Promise<Response> {
  if (!env.INWORLD_API_KEY) {
    return errorResponse('TTS niet geconfigureerd', 503, env);
  }

  // GET /api/tts/voices — lijst van beschikbare stemmen
  if (request.method === 'GET' && path === '/tts/voices') {
    return listVoices(env);
  }

  // POST /api/tts — tekst naar spraak streamen
  if (request.method === 'POST' && path === '/tts') {
    return synthesize(request, env);
  }

  return errorResponse('Route niet gevonden', 404, env);
}

async function listVoices(env: Env): Promise<Response> {
  const res = await fetch(VOICES_ENDPOINT, {
    headers: { 'Authorization': `Basic ${env.INWORLD_API_KEY}` },
  });

  if (!res.ok) {
    console.error('Inworld voices fout:', res.status, await res.text());
    return errorResponse('Kon stemmen niet ophalen', 502, env);
  }

  const data: any = await res.json();
  return new Response(JSON.stringify(data.voices ?? []), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

async function synthesize(request: Request, env: Env): Promise<Response> {
  let body: { text?: string; voiceId?: string; speakingRate?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Ongeldige request body', 400, env);
  }

  const text = body.text?.trim().slice(0, 2000);
  if (!text) return errorResponse('Tekst is verplicht', 400, env);

  // Inworld speakingRate: 0.5–1.5 (anders dan browser TTS max 2.0)
  const speakingRate = Math.max(0.5, Math.min(1.5, body.speakingRate ?? 1.0));
  const voiceId = body.voiceId || 'Ashley';

  const inworldRes = await fetch(STREAM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${env.INWORLD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceId,
      modelId: DEFAULT_MODEL,
      audioConfig: {
        audioEncoding: 'LINEAR16',   // raw 16-bit PCM, geen codec nodig in browser
        sampleRateHertz: SAMPLE_RATE,
        speakingRate,
      },
      timestampType: 'WORD',
      timestampTransportStrategy: 'SYNC', // timestamps en audio samen per chunk
      applyTextNormalization: 'ON',
    }),
  });

  if (!inworldRes.ok) {
    const err = await inworldRes.text();
    console.error('Inworld TTS fout:', inworldRes.status, err);
    return errorResponse('TTS service niet beschikbaar', 502, env);
  }

  // Stream de NDJSON response direct door — Worker buffert niets
  return new Response(inworldRes.body, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      ...corsHeaders(env),
    },
  });
}
