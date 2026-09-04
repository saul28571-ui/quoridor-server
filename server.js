// Adaptador seguro de IA para Animador3D
// La clave HF_TOKEN se configura solamente en Render.
import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const token = process.env.HF_TOKEN || '';
const model = process.env.HF_MODEL || 'HuggingFaceTB/SmolLM3-3B';
const allowed = process.env.ALLOWED_ORIGIN || '*';

const schema = `Responde SOLO con JSON válido, sin markdown, con este formato exacto:
{"events":[{"id":"enemy|coins|lives|jump|gameover|scene|controls|colors|base","label":"etiqueta en español","detail":"detalle corto en español"}]}
Convierte la idea del usuario en eventos de videojuego. Si no reconoces algo, devuelve base.`;

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST,OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseModel(data) {
  const text = Array.isArray(data)
    ? (data[0]?.generated_text || '')
    : (data?.generated_text || data?.choices?.[0]?.message?.content || '');
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Respuesta sin JSON');
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed.events)) throw new Error('events[] ausente');
  return {
    events: parsed.events.slice(0, 40).map((event, index) => ({
      id: String(event.id || `remote_${index}`).slice(0, 40),
      label: String(event.label || event.type || 'Evento IA').slice(0, 80),
      detail: String(event.detail || event.description || '').slice(0, 180)
    }))
  };
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
  try { body = JSON.parse(raw); }
  catch { return send(res, 400, { error: 'invalid JSON' }); }

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 4000) {
    return send(res, 400, { error: 'prompt required (max 4000 chars)' });
  }

  // Endpoint actual del router de Hugging Face.
  const url = `https://router.huggingface.co/hf-inference/models/${model}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: `${schema}\nIdea del usuario: ${prompt}`,
      parameters: { max_new_tokens: 400, return_full_text: false }
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return send(res, 502, {
      error: `Inference provider HTTP ${response.status}`,
      detail: String(result.error || '').slice(0, 240)
    });
  }

  try { return send(res, 200, parseModel(result)); }
  catch { return send(res, 502, { error: 'Provider response was not valid events JSON' }); }
}

http.createServer((req, res) =>
  handle(req, res).catch(() => send(res, 500, { error: 'adapter failure' }))
).listen(port, () => console.log(`IA adapter listening on port ${port}`));
