// Backend IA Animador3D para Render + Hugging Face Router
import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const token = process.env.HF_TOKEN || '';
const model = process.env.HF_MODEL || 'HuggingFaceTB/SmolLM3-3B';
const allowed = process.env.ALLOWED_ORIGIN || '*';

const system = `Eres un generador de eventos para un creador de videojuegos.
Devuelve ÚNICAMENTE JSON válido, sin markdown, con este formato:
{"events":[{"id":"enemy|coins|lives|jump|gameover|scene|controls|colors|base","label":"texto corto en español","detail":"detalle corto en español"}]}
Interpreta la idea del usuario y crea todos los eventos necesarios. Si no reconoces una instrucción, usa id base.`;

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST,OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function eventsFrom(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw Error('JSON ausente');
  const data = JSON.parse(match[0]);
  if (!Array.isArray(data.events)) throw Error('events ausente');
  return { events: data.events.slice(0, 40).map((e, i) => ({
    id: String(e.id || `remote_${i}`).slice(0, 40),
    label: String(e.label || 'Evento IA').slice(0, 80),
    detail: String(e.detail || '').slice(0, 180)
  })) };
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!token) return send(res, 503, { error: 'Backend is not configured: set HF_TOKEN server-side' });

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 12000) return send(res, 413, { error: 'request too large' });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid JSON' }); }
  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 4000) return send(res, 400, { error: 'prompt required (max 4000 chars)' });

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 400,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) return send(res, 502, {
    error: `Inference provider HTTP ${response.status}`,
    detail: String(result.error || result.message || '').slice(0, 240)
  });

  const text = result?.choices?.[0]?.message?.content || result?.choices?.[0]?.text || '';
  try { return send(res, 200, eventsFrom(text)); }
  catch { return send(res, 502, { error: 'Provider response was not valid events JSON' }); }
}

http.createServer((req, res) => handle(req, res).catch((err) => send(res, 502, {
  error: 'AI provider connection failed',
  detail: String(err?.message || '').slice(0, 180)
}))).listen(port, () => console.log(`Animador3D IA listening on port ${port}`));
