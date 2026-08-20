import { WebSocketServer } from 'ws';
import { randomInt, randomUUID } from 'node:crypto';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.QUORIDOR_API_KEY || 'qrd_7F2m9K8x4P1v6L3';
const TURN_SECONDS = Number(process.env.QUORIDOR_TURN_SECONDS || 30);
const rooms = new Map();
const tokens = new Map();
const statsFile = new URL('./stats.json', import.meta.url);
const stats = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile, 'utf8')) : {};
const N = 9;
function persistStats() { try { fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2)); } catch {} }
function code() { const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let v=''; for(let i=0;i<5;i++)v+=chars[randomInt(chars.length)]; return v; }
function newRoom() { let id=code(); while(rooms.has(id))id=code(); const now=Date.now(); return {id,clients:[],tokens:[null,null],names:['Jugador 1','Jugador 2'],positions:[[4,8],[4,0]],walls:[10,10],hWalls:[],vWalls:[],turn:0,winner:null,turnStartedAt:now,turnDeadline:now+TURN_SECONDS*1000,chat:[]}; }
function send(ws,m){if(ws?.readyState===1)ws.send(JSON.stringify(m));}
function remaining(room){return Math.max(0, Math.ceil((room.turnDeadline-Date.now())/1000));}
function state(room){return {type:'state',room:room.id,positions:room.positions,walls:room.walls,hWalls:room.hWalls,vWalls:room.vWalls,turn:room.turn,winner:room.winner,players:room.clients.filter(Boolean).length,names:room.names,turnSeconds:TURN_SECONDS,turnDeadline:room.turnDeadline,serverNow:Date.now(),remaining:remaining(room)};}
function broadcast(room){for(const c of room.clients)send(c,state(room));}
function same(a,b){return a[0]===b[0]&&a[1]===b[1];} function inside(p){return p[0]>=0&&p[0]<N&&p[1]>=0&&p[1]<N;} function key(w){return `${w[0]},${w[1]}`;}
function blocked(r,a,b){if(a[0]!==b[0]){const x=Math.min(a[0],b[0]),y=a[1];return r.vWalls.some(w=>(w[0]===x&&w[1]===y)||(w[0]===x&&w[1]===y-1));}const x=a[0],y=Math.min(a[1],b[1]);return r.hWalls.some(w=>(w[0]===x&&w[1]===y)||(w[0]===x-1&&w[1]===y));}
function legalMoves(r,player){const out=[],cur=r.positions[player],enemy=r.positions[1-player],dirs=[[0,-1],[0,1],[-1,0],[1,0]];for(const d of dirs){const n=[cur[0]+d[0],cur[1]+d[1]];if(!inside(n)||blocked(r,cur,n))continue;if(same(n,enemy)){const j=[n[0]+d[0],n[1]+d[1]];if(inside(j)&&!blocked(r,n,j))out.push(j);else for(const s of [[-d[1],d[0]],[d[1],-d[0]]]){const q=[n[0]+s[0],n[1]+s[1]];if(inside(q)&&!blocked(r,n,q))out.push(q);}}else out.push(n);}return out;}
function hasPath(r,pl){const goal=pl===0?0:8,q=[r.positions[pl]],seen=new Set([key(q[0])]);while(q.length){const c=q.shift();if(c[1]===goal)return true;for(const d of [[0,-1],[0,1],[-1,0],[1,0]]){const n=[c[0]+d[0],c[1]+d[1]];if(inside(n)&&!blocked(r,c,n)&&!seen.has(key(n))){seen.add(key(n));q.push(n);}}}return false;}
function wallConflict(r,w,o){const[x,y]=w;if(o==='h'){if(r.hWalls.some(a=>a[1]===y&&Math.abs(a[0]-x)<2))return true;return r.vWalls.some(a=>a[0]>=x&&a[0]<=x+1&&a[1]>=y&&a[1]<=y+1);}if(r.vWalls.some(a=>a[0]===x&&Math.abs(a[1]-y)<2))return true;return r.hWalls.some(a=>a[0]>=x&&a[0]<=x+1&&a[1]>=y&&a[1]<=y+1);}
function validWall(r,w,o,p){if(r.walls[p]<=0||w[0]<0||w[0]>7||w[1]<0||w[1]>7||wallConflict(r,w,o))return false;const list=o==='h'?r.hWalls:r.vWalls;list.push(w);const ok=hasPath(r,0)&&hasPath(r,1);list.pop();return ok;}
function nextTurn(r){r.turn=1-r.turn;r.turnStartedAt=Date.now();r.turnDeadline=r.turnStartedAt+TURN_SECONDS*1000;broadcast(r);}
function record(r, winner, reason='goal'){const name=r.names[winner]||`Jugador ${winner+1}`;const s=stats[name] ||= {games:0,wins:0,losses:0,timeoutWins:0};s.games++;s.wins++;s.reason=reason;const other=stats[r.names[1-winner]] ||= {games:0,wins:0,losses:0};other.games++;other.losses++;if(reason==='timeout')s.timeoutWins++;persistStats();}
function timeout(r){if(r.winner!==null||r.clients.filter(Boolean).length<2)return;r.winner=1-r.turn;record(r,r.winner,'timeout');broadcast(r);}
function reset(r){r.positions=[[4,8],[4,0]];r.walls=[10,10];r.hWalls=[];r.vWalls=[];r.turn=0;r.winner=null;r.turnStartedAt=Date.now();r.turnDeadline=r.turnStartedAt+TURN_SECONDS*1000;broadcast(r);}
function handle(ws,d){if(API_KEY&&d.apiKey!==API_KEY)return send(ws,{type:'error',message:'API key inválida'});
 if(d.type==='create_room'){const r=newRoom(),p=0;const t=randomUUID();r.tokens[p]=t;tokens.set(t,{room:r.id,player:p});r.clients[p]=ws;ws.room=r;ws.player=p;ws.token=t;r.names[p]=String(d.name||'Jugador 1').slice(0,24);send(ws,{type:'room_created',room:r.id,player:p,token:t});broadcast(r);return;}
 if(d.type==='join_room'){const r=rooms.get(String(d.room||'').toUpperCase());if(!r)return send(ws,{type:'error',message:'La sala no existe'});const p=r.clients[0]?1:0;if(r.clients[p])return send(ws,{type:'error',message:'La sala está llena'});const t=randomUUID();r.tokens[p]=t;tokens.set(t,{room:r.id,player:p});r.clients[p]=ws;ws.room=r;ws.player=p;ws.token=t;r.names[p]=String(d.name||`Jugador ${p+1}`).slice(0,24);send(ws,{type:'room_joined',room:r.id,player:p,token:t});broadcast(r);return;}
 if(d.type==='reconnect'){const hit=tokens.get(String(d.token||''));const r=hit&&rooms.get(hit.room);if(!r||String(d.room).toUpperCase()!==r.id)return send(ws,{type:'error',message:'Sesión no disponible'});const p=hit.player;r.clients[p]=ws;ws.room=r;ws.player=p;ws.token=d.token;send(ws,{type:'reconnected',room:r.id,player:p,token:d.token});broadcast(r);return;}
 const r=ws.room;if(!r)return send(ws,{type:'error',message:'Primero crea o únete a una sala'});
 if(d.type==='stats'){const ranking=Object.entries(stats).map(([name,s])=>({name,...s})).sort((a,b)=>b.wins-a.wins||b.games-a.games).slice(0,20);send(ws,{type:'stats',ranking});return;}
 if(d.type==='chat'){const text=String(d.text||'').trim().slice(0,80);if(text){const item={player:ws.player,text,at:Date.now()};r.chat.push(item);if(r.chat.length>30)r.chat.shift();for(const c of r.clients)send(c,{type:'chat',...item});}return;}
 if(d.type==='rematch'){if(r.clients.filter(Boolean).length>=1)reset(r);return;}
 if(r.winner!==null||r.clients.filter(Boolean).length<2||r.turn!==ws.player)return;
 if(Date.now()>=r.turnDeadline){timeout(r);return;}
 if(d.type==='move'){const dest=[Number(d.x),Number(d.y)];if(!legalMoves(r,ws.player).some(p=>same(p,dest)))return send(ws,{type:'error',message:'Movimiento inválido'});r.positions[ws.player]=dest;if((ws.player===0&&dest[1]===0)||(ws.player===1&&dest[1]===8)){r.winner=ws.player;record(r,ws.player);broadcast(r);}else nextTurn(r);return;}
 if(d.type==='wall'){const w=[Number(d.x),Number(d.y)],o=d.orientation==='v'?'v':'h';if(!validWall(r,w,o,ws.player))return send(ws,{type:'error',message:'Pared inválida'});(o==='h'?r.hWalls:r.vWalls).push(w);r.walls[ws.player]--;nextTurn(r);}
}
const wss=new WebSocketServer({port:PORT,path:'/ws'});wss.on('connection',ws=>{ws.on('message',raw=>{try{handle(ws,JSON.parse(raw.toString()));}catch{send(ws,{type:'error',message:'Mensaje inválido'});}});ws.on('close',()=>{const r=ws.room;if(!r)return;const p=ws.player;if(r.clients[p]===ws){r.clients[p]=null;for(const c of r.clients)send(c,{type:'opponent_left'});setTimeout(()=>{if(r.clients.every(c=>!c))rooms.delete(r.id);},120000);}});});
setInterval(()=>{for(const r of rooms.values()){if(r.winner===null&&r.clients.filter(Boolean).length>=2&&Date.now()>=r.turnDeadline)timeout(r);else if(r.clients.some(Boolean))broadcast(r);}},1000);
console.log(`Quoridor server escuchando en ws://localhost:${PORT}/ws`);
