import http from 'node:http';
import { WebSocketServer } from 'ws';
import { randomInt, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
// Para pruebas locales. En producción usa siempre una variable de entorno.
const API_KEY = process.env.QUORIDOR_API_KEY || 'qrd_7F2m9K8x4P1v6L3';
const rooms = new Map();
const N = 9;

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 5; i++) value += chars[randomInt(chars.length)];
  return value;
}

function newRoom() {
  let id = code();
  while (rooms.has(id)) id = code();
  return {
    id,
    clients: [null, null],
    tokens: [randomUUID(), randomUUID()],
    names: ['Jugador 1', 'Jugador 2'],
    positions: [[4, 8], [4, 0]],
    walls: [10, 10],
    hWalls: [],
    vWalls: [],
    turn: 0,
    winner: null
  };
}

function send(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function state(room) {
  return {
    type: 'state', room: room.id, positions: room.positions,
    walls: room.walls, hWalls: room.hWalls, vWalls: room.vWalls,
    turn: room.turn, winner: room.winner,
    players: room.clients.filter(Boolean).length, names: room.names
  };
}

function broadcast(room) {
  const packet = state(room);
  for (const client of room.clients) if (client) send(client, packet);
}

function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
function inside(p) { return p[0] >= 0 && p[0] < N && p[1] >= 0 && p[1] < N; }
function key(w) { return `${w[0]},${w[1]}`; }

function blocked(room, a, b) {
  if (a[0] !== b[0]) {
    const x = Math.min(a[0], b[0]);
    const y = a[1];
    return room.vWalls.some(w => (w[0] === x && w[1] === y) || (w[0] === x && w[1] === y - 1));
  }
  const x = a[0];
  const y = Math.min(a[1], b[1]);
  return room.hWalls.some(w => (w[0] === x && w[1] === y) || (w[0] === x - 1 && w[1] === y));
}

function legalMoves(room, player) {
  const result = [];
  const current = room.positions[player];
  const enemy = room.positions[1 - player];
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const d of dirs) {
    const next = [current[0] + d[0], current[1] + d[1]];
    if (!inside(next) || blocked(room, current, next)) continue;
    if (same(next, enemy)) {
      const jump = [next[0] + d[0], next[1] + d[1]];
      if (inside(jump) && !blocked(room, next, jump)) result.push(jump);
      else for (const side of [[-d[1], d[0]], [d[1], -d[0]]]) {
        const diagonal = [next[0] + side[0], next[1] + side[1]];
        if (inside(diagonal) && !blocked(room, next, diagonal)) result.push(diagonal);
      }
    } else result.push(next);
  }
  return result;
}

function hasPath(room, player) {
  const goal = player === 0 ? 0 : 8;
  const queue = [room.positions[player]];
  const seen = new Set([key(queue[0])]);
  while (queue.length) {
    const current = queue.shift();
    if (current[1] === goal) return true;
    for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const next = [current[0] + d[0], current[1] + d[1]];
      if (inside(next) && !blocked(room, current, next) && !seen.has(key(next))) {
        seen.add(key(next)); queue.push(next);
      }
    }
  }
  return false;
}

function wallConflict(room, wall, orientation) {
  const [x, y] = wall;
  if (orientation === 'h') {
    if (room.hWalls.some(w => w[1] === y && Math.abs(w[0] - x) < 2)) return true;
    return room.vWalls.some(w => w[0] >= x && w[0] <= x + 1 && w[1] >= y && w[1] <= y + 1);
  }
  if (room.vWalls.some(w => w[0] === x && Math.abs(w[1] - y) < 2)) return true;
  return room.hWalls.some(w => w[0] >= x && w[0] <= x + 1 && w[1] >= y && w[1] <= y + 1);
}

function validWall(room, wall, orientation, player) {
  if (room.walls[player] <= 0 || wall[0] < 0 || wall[0] > 7 || wall[1] < 0 || wall[1] > 7) return false;
  if (wallConflict(room, wall, orientation)) return false;
  const list = orientation === 'h' ? room.hWalls : room.vWalls;
  list.push(wall);
  const valid = hasPath(room, 0) && hasPath(room, 1);
  list.pop();
  return valid;
}

function finishTurn(room) {
  room.turn = 1 - room.turn;
  broadcast(room);
}

function handle(ws, data) {
  if (API_KEY && data.apiKey !== API_KEY) return send(ws, { type: 'error', message: 'API key inválida' });
  if (data.type === 'create_room') {
    const room = newRoom(); rooms.set(room.id, room); room.clients[0] = ws; room.names[0] = String(data.name || 'Jugador 1').slice(0, 18); ws.room = room; ws.player = 0;
    send(ws, { type: 'room_created', room: room.id, player: 0, token: room.tokens[0] }); broadcast(room); return;
  }
  if (data.type === 'join_room') {
    const room = rooms.get(String(data.room || '').toUpperCase());
    if (!room) return send(ws, { type: 'error', message: 'La sala no existe' });
    if (room.clients.filter(Boolean).length >= 2 || room.clients[1]) return send(ws, { type: 'error', message: 'La sala está llena' });
    room.clients[1] = ws; room.names[1] = String(data.name || 'Jugador 2').slice(0, 18); ws.room = room; ws.player = 1;
    send(ws, { type: 'room_joined', room: room.id, player: 1, token: room.tokens[1] }); broadcast(room); return;
  }
  if (data.type === 'reconnect') {
    const room = rooms.get(String(data.room || '').toUpperCase());
    if (!room) return send(ws, { type: 'error', message: 'La sala no existe' });
    const player = room.tokens.indexOf(String(data.token || ''));
    if (player < 0) return send(ws, { type: 'error', message: 'Token de reconexión inválido' });
    if (room.clients[player] && room.clients[player] !== ws) {
      try { room.clients[player].close(); } catch {}
    }
    room.clients[player] = ws; ws.room = room; ws.player = player;
    send(ws, { type: 'reconnected', room: room.id, player, token: room.tokens[player] });
    broadcast(room); return;
  }
  const room = ws.room;
  if (!room) return send(ws, { type: 'error', message: 'Primero crea o únete a una sala' });
  if (data.type === 'rematch') {
    if (room.clients.filter(Boolean).length < 2) return send(ws, { type: 'error', message: 'Falta el segundo jugador' });
    room.positions = [[4, 8], [4, 0]];
    room.walls = [10, 10]; room.hWalls = []; room.vWalls = [];
    room.turn = 0; room.winner = null;
    broadcast(room); return;
  }
  if (data.type === 'move') {
    if (room.clients.filter(Boolean).length < 2 || room.turn !== ws.player || room.winner !== null) return;
    const destination = [Number(data.x), Number(data.y)];
    if (!legalMoves(room, ws.player).some(p => same(p, destination))) return send(ws, { type: 'error', message: 'Movimiento inválido' });
    room.positions[ws.player] = destination;
    if ((ws.player === 0 && destination[1] === 0) || (ws.player === 1 && destination[1] === 8)) room.winner = ws.player;
    else finishTurn(room);
    broadcast(room); return;
  }
  if (data.type === 'wall') {
    if (room.clients.filter(Boolean).length < 2 || room.turn !== ws.player || room.winner !== null) return;
    const wall = [Number(data.x), Number(data.y)]; const orientation = data.orientation === 'v' ? 'v' : 'h';
    if (!validWall(room, wall, orientation, ws.player)) return send(ws, { type: 'error', message: 'Pared inválida' });
    (orientation === 'h' ? room.hWalls : room.vWalls).push(wall); room.walls[ws.player]--; finishTurn(room); return;
  }
}

const httpServer = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Quoridor server online'); });
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on('connection', ws => {
  ws.on('message', raw => { try { handle(ws, JSON.parse(raw.toString())); } catch { send(ws, { type: 'error', message: 'Mensaje inválido' }); } });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (Number.isInteger(ws.player) && room.clients[ws.player] === ws) {
      room.clients[ws.player] = null;
      for (const client of room.clients) if (client) send(client, { type: 'opponent_left' });
    }
  });
});
httpServer.listen(PORT, '0.0.0.0', () => console.log(`Quoridor server escuchando en el puerto ${PORT}`));
