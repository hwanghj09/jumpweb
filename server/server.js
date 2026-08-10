import http from 'node:http';
import { WebSocketServer } from 'ws';
import { handleCustomMapsRequest, isCustomMapsPath } from './customMaps.js';

// Must match PVP_ARENA_COUNT in js/constants.js and js/pvpMaps.js (PVP_ARENAS.length).
const MAP_COUNT = 5;
// Must match PVP_ROUND_WINS in js/constants.js.
const ROUND_WINS = 2;

const PORT = process.env.PORT || 8080;
const HEARTBEAT_MS = 30000;

const httpServer = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (isCustomMapsPath(pathname)) {
    handleCustomMapsRequest(req, res, pathname).catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: '서버 오류가 발생했습니다.' }));
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('jumpweb pvp server ok');
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

let nextClientId = 1;
const queue = [];
const rooms = new Map();
let nextRoomId = 1;

function send(ws, type, data = {}) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ type, ...data }));
}

function randomMapIndex(excluding = -1) {
  if (MAP_COUNT <= 1) return 0;
  let idx;
  do {
    idx = Math.floor(Math.random() * MAP_COUNT);
  } while (idx === excluding);
  return idx;
}

function removeFromQueue(client) {
  const i = queue.indexOf(client);
  if (i !== -1) queue.splice(i, 1);
}

function tryMatchmake() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    createRoom(a, b);
  }
}

function createRoom(a, b) {
  const roomId = nextRoomId++;
  const mapIndex = randomMapIndex();
  const room = { id: roomId, p1: a, p2: b, score: { p1: 0, p2: 0 }, mapIndex, over: false };
  rooms.set(roomId, room);
  a.room = room;
  a.side = 'p1';
  b.room = room;
  b.side = 'p2';
  send(a.ws, 'match_found', { side: 'p1', mapIndex });
  send(b.ws, 'match_found', { side: 'p2', mapIndex });
}

function opponentOf(client) {
  const room = client.room;
  if (!room) return null;
  return client.side === 'p1' ? room.p2 : room.p1;
}

function endRoom(room) {
  room.over = true;
  rooms.delete(room.id);
  if (room.p1.room === room) room.p1.room = null;
  if (room.p2.room === room) room.p2.room = null;
}

function handleMessage(client, msg) {
  switch (msg.type) {
    case 'queue_join': {
      if (client.room) client.room = null;
      if (!queue.includes(client)) queue.push(client);
      send(client.ws, 'queued');
      tryMatchmake();
      break;
    }
    case 'queue_leave': {
      removeFromQueue(client);
      break;
    }
    case 'state': {
      const opp = opponentOf(client);
      if (!opp) break;
      send(opp.ws, 'state', {
        x: msg.x,
        y: msg.y,
        vx: msg.vx,
        vy: msg.vy,
        facing: msg.facing,
        state: msg.state,
        jabTimer: msg.jabTimer,
      });
      break;
    }
    case 'hit': {
      const opp = opponentOf(client);
      if (!opp) break;
      send(opp.ws, 'hit', { dir: msg.dir });
      break;
    }
    case 'ringout': {
      const room = client.room;
      if (!room || room.over) break;
      const loserSide = client.side;
      const winnerSide = loserSide === 'p1' ? 'p2' : 'p1';
      room.score[winnerSide] += 1;
      const matchOver = room.score[winnerSide] >= ROUND_WINS;
      const nextMapIndex = randomMapIndex(room.mapIndex);
      room.mapIndex = nextMapIndex;
      const payload = { loser: loserSide, score: { ...room.score }, matchOver, nextMapIndex };
      send(room.p1.ws, 'round_result', payload);
      send(room.p2.ws, 'round_result', payload);
      if (matchOver) endRoom(room);
      break;
    }
    default:
      break;
  }
}

wss.on('connection', (ws) => {
  const client = { id: nextClientId++, ws, room: null, side: null, isAlive: true };
  ws._client = client;
  ws.on('pong', () => {
    client.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    try {
      handleMessage(client, msg);
    } catch (err) {
      send(ws, 'error', { message: '서버 오류가 발생했습니다.' });
    }
  });

  ws.on('close', () => {
    removeFromQueue(client);
    const room = client.room;
    if (room && !room.over) {
      const opp = opponentOf(client);
      if (opp) send(opp.ws, 'opponent_left');
      endRoom(room);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const client = ws._client;
    if (client && client.isAlive === false) {
      ws.terminate();
      continue;
    }
    if (client) client.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

httpServer.listen(PORT, () => {
  console.log(`pvp server listening on :${PORT} (ws path /ws)`);
});
