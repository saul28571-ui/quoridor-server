// Animador3D IA - VERSION FINAL 2026-09-04
import http from 'node:http';
const VERSION='animador3d-final-v5';
const port=Number(process.env.PORT||8787), token=process.env.HF_TOKEN||'';
const model=process.env.HF_MODEL||'HuggingFaceTB/SmolLM3-3B';
const allowed=process.env.ALLOWED_ORIGIN||'*';
function send(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':allowed,'access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(data));}
function parse(text){const m=String(text||'').match(/\{[\s\S]*\}/);if(!m)throw Error('json');const x=JSON.parse(m[0]);if(!Array.isArray(x.events))throw Error('events');return {events:x.events.slice(0,40).map((e,i)=>({id:String(e.id||`remote_${i}`).slice(0,40),label:String(e.label||'Evento IA').slice(0,80),detail:String(e.detail||'').slice(0,180)}))};}
async function main(req,res){
 if(req.method==='OPTIONS')return send(res,204,{});
 if(req.method==='GET')return send(res,200,{ok:true,version:VERSION,configured:Boolean(token)});
 if(req.method!=='POST')return send(res,405,{error:'POST only',version:VERSION});
 if(!token)return send(res,503,{error:'HF_TOKEN missing',version:VERSION});
 let raw='';for await(const c of req){raw+=c;if(raw.length>12000)return send(res,413,{error:'request too large'});}
 let b;try{b=JSON.parse(raw)}catch{return send(res,400,{error:'invalid JSON',version:VERSION});}
 const prompt=String(b.prompt||'').trim();if(!prompt||prompt.length>4000)return send(res,400,{error:'prompt required',version:VERSION});
 const r=await fetch('https://router.huggingface.co/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'Devuelve SOLO JSON válido: {"events":[{"id":"enemy|coins|lives|jump|gameover|scene|controls|colors|base","label":"etiqueta en español","detail":"detalle corto en español"}]}.'},{role:'user',content:prompt}],max_tokens:400,temperature:0.2})});
 const x=await r.json().catch(()=>({}));if(!r.ok)return send(res,502,{error:`provider HTTP ${r.status}`,detail:JSON.stringify(x).slice(0,500),version:VERSION});
 try{return send(res,200,{...parse(x?.choices?.[0]?.message?.content||''),version:VERSION});}catch{return send(res,502,{error:'invalid model JSON',version:VERSION});}
}
http.createServer((q,s)=>main(q,s).catch(e=>send(s,502,{error:'provider connection failed',detail:String(e.message||'').slice(0,200),version:VERSION}))).listen(port,()=>console.log(VERSION));
