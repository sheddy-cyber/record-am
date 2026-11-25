// ============================================================
// RECORD AM - voice-command Edge Function
//
// Keeps the speech/LLM provider key on the server. The app calls this when no
// key is configured on the device (the recommended setup).
//
//   supabase secrets set GROQ_API_KEY=gsk_...
//   supabase functions deploy voice-command
//
// JWT verification is on (the Supabase default), so only signed-in Record Am
// users can call it.
//
// POST { task: 'transcribe', audio: <base64>, mimeType?: string, prompt?: string } → { text }
// POST { task: 'parse', system: string, text: string }                          → { result }
// ============================================================

// deno-lint-ignore-file no-explicit-any
const GROQ = 'https://api.groq.com/openai/v1';
const STT_MODEL = 'whisper-large-v3-turbo';
const PARSE_MODEL = 'openai/gpt-oss-20b';
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // ~30 s of speech at 32 kbps is far below this

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return json({ error: 'Voice service is not configured (GROQ_API_KEY missing).' }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  try {
    if (body.task === 'transcribe') {
      if (typeof body.audio !== 'string' || !body.audio) return json({ error: 'Missing audio.' }, 400);
      const bytes = decodeBase64(body.audio);
      if (bytes.byteLength > MAX_AUDIO_BYTES) return json({ error: 'Recording is too long.' }, 413);

      const form = new FormData();
      form.append('file', new Blob([bytes], { type: body.mimeType || 'audio/m4a' }), 'speech.m4a');
      form.append('model', STT_MODEL);
      form.append('language', 'en');
      form.append('temperature', '0');
      form.append('response_format', 'json');
      if (typeof body.prompt === 'string') form.append('prompt', body.prompt.slice(0, 900));

      const res = await fetch(`${GROQ}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) return json({ error: `Transcription failed (${res.status}).` }, 502);
      const out = await res.json();
      return json({ text: String(out.text ?? '').trim() });
    }

    if (body.task === 'parse') {
      if (typeof body.text !== 'string' || typeof body.system !== 'string') {
        return json({ error: 'Missing text or system prompt.' }, 400);
      }
      const res = await fetch(`${GROQ}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: PARSE_MODEL,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: body.system.slice(0, 20000) },
            { role: 'user', content: body.text.slice(0, 2000) },
          ],
        }),
      });
      if (!res.ok) return json({ error: `Parsing failed (${res.status}).` }, 502);
      const out = await res.json();
      return json({ result: out.choices?.[0]?.message?.content ?? '{}' });
    }

    return json({ error: 'Unknown task.' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || 'Voice service error.' }, 500);
  }
});
