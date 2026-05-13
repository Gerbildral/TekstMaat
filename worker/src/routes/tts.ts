/**
 * TTS routes: /api/tts (POST) en /api/tts/voices (GET)
 * Proxy naar ElevenLabs API — API key blijft server-side
 *
 * Stemmen configureren via wrangler secret:
 *   wrangler secret put ELEVENLABS_VOICES
 *   Waarde: [{"id":"voiceId","name":"Juf Anne"},{"id":"voiceId2","name":"Meneer Jan"}]
 */

import type { Env, AuthUser } from '../index';
import { errorResponse, corsHeaders } from '../utils/responses';

const EL_BASE = 'https://api.elevenlabs.io';
// Streaming endpoint met karakter-level timestamps (character alignment)
const STREAM_URL = (voiceId: string) =>
  `${EL_BASE}/v1/text-to-speech/${voiceId}/stream/with-timestamps?output_format=pcm_24000`;
const MODEL = 'eleven_multilingual_v2'; // beste kwaliteit voor NL/EN/FR/DE

export async function handleTTS(
  request: Request,
  env: Env,
  _user: AuthUser,
  path: string
): Promise<Response> {
  if (!env.ELEVENLABS_API_KEY) {
    return errorResponse('TTS niet geconfigureerd', 503, env);
  }

  if (request.method === 'GET' && path === '/tts/voices') {
    return listVoices(env);
  }
  if (request.method === 'POST' && path === '/tts') {
    return synthesize(request, env);
  }

  return errorResponse('Route niet gevonden', 404, env);
}

function listVoices(env: Env): Response {
  // Stemmen komen uit env var ELEVENLABS_VOICES (JSON array)
  // Voorbeeld: [{"id":"21m00Tcm4TlvDq8ikWAM","name":"Juf Anne"},...]
  let voices: { id: string; name: string }[] = [];
  try {
    if (env.ELEVENLABS_VOICES) {
      voices = JSON.parse(env.ELEVENLABS_VOICES);
    }
  } catch {
    // Lege lijst als de env var ontbreekt of ongeldig is
  }

  return new Response(JSON.stringify(voices), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

async function synthesize(request: Request, env: Env): Promise<Response> {
  let body: { text?: string; voiceId?: string; speed?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Ongeldige request body', 400, env);
  }

  const text = body.text?.trim().slice(0, 5000);
  if (!text) return errorResponse('Tekst is verplicht', 400, env);

  // ElevenLabs speed range: ~0.7–1.2 (waarden buiten dit bereik klinken vervormd)
  const speed = Math.max(0.7, Math.min(1.2, body.speed ?? 1.0));
  const voiceId = body.voiceId;
  if (!voiceId) return errorResponse('Geen stem geselecteerd', 400, env);

  const elRes = await fetch(STREAM_URL(voiceId), {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
        speed,
      },
    }),
  });

  if (!elRes.ok) {
    const err = await elRes.text();
    console.error('ElevenLabs TTS fout:', elRes.status, err);
    return errorResponse(`TTS fout ${elRes.status}: ${err}`, 502, env);
  }

  // SSE stream direct doorsturen — Worker buffert niets
  return new Response(elRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...corsHeaders(env),
    },
  });
}
