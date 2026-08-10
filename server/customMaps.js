import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'custom-maps.json');

const MAX_MAPS = 500;
const MAX_ARRAY_LEN = 500;
const MAX_BODY_BYTES = 200 * 1024;
const MIN_DIM = 320; // 10 tiles * 32px
const MAX_DIM = 8000; // ~250 tiles * 32px

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

const maps = load();

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(maps));
}

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidStage(stage) {
  if (!stage || typeof stage !== 'object') return false;
  if (!isFiniteNum(stage.width) || stage.width < MIN_DIM || stage.width > MAX_DIM) return false;
  if (!isFiniteNum(stage.height) || stage.height < MIN_DIM || stage.height > MAX_DIM) return false;
  if (!stage.spawn || !isFiniteNum(stage.spawn.x) || !isFiniteNum(stage.spawn.y)) return false;
  if (!stage.goal || !isFiniteNum(stage.goal.x) || !isFiniteNum(stage.goal.y) || !isFiniteNum(stage.goal.w) || !isFiniteNum(stage.goal.h))
    return false;
  for (const key of ['platforms', 'water']) {
    const arr = stage[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr) || arr.length > MAX_ARRAY_LEN) return false;
    if (!arr.every((o) => isFiniteNum(o.x) && isFiniteNum(o.y) && isFiniteNum(o.w) && isFiniteNum(o.h))) return false;
  }
  if (stage.cones !== undefined) {
    if (!Array.isArray(stage.cones) || stage.cones.length > MAX_ARRAY_LEN) return false;
    if (!stage.cones.every((c) => isFiniteNum(c.x) && isFiniteNum(c.y))) return false;
  }
  if (stage.enemies !== undefined) {
    if (!Array.isArray(stage.enemies) || stage.enemies.length > MAX_ARRAY_LEN) return false;
    if (!stage.enemies.every((e) => isFiniteNum(e.x) && isFiniteNum(e.y) && isFiniteNum(e.patrolMinX) && isFiniteNum(e.patrolMaxX)))
      return false;
  }
  return true;
}

function sanitizeStage(stage) {
  const name = typeof stage.name === 'string' && stage.name.trim() ? stage.name.trim().slice(0, 40) : '이름 없는 맵';
  const hint = typeof stage.hint === 'string' ? stage.hint.slice(0, 200) : '';
  return {
    name,
    hint,
    width: stage.width,
    height: stage.height,
    spawn: { x: stage.spawn.x, y: stage.spawn.y },
    goal: { x: stage.goal.x, y: stage.goal.y, w: stage.goal.w, h: stage.goal.h },
    platforms: (stage.platforms || []).map((p) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      ...(p.moving && isFiniteNum(p.moving.range) && isFiniteNum(p.moving.speed) && (p.moving.axis === 'x' || p.moving.axis === 'y')
        ? { moving: { axis: p.moving.axis, range: p.moving.range, speed: p.moving.speed } }
        : {}),
    })),
    cones: (stage.cones || []).map((c) => ({ x: c.x, y: c.y })),
    enemies: (stage.enemies || []).map((e) => ({ x: e.x, y: e.y, patrolMinX: e.patrolMinX, patrolMaxX: e.patrolMaxX })),
    water: (stage.water || []).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
  };
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function isCustomMapsPath(pathname) {
  return pathname === '/api/custom-maps' || pathname.startsWith('/api/custom-maps/');
}

export async function handleCustomMapsRequest(req, res, pathname) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Owner-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const id = pathname.split('/')[3]; // /api/custom-maps/<id>

  if (req.method === 'GET' && !id) {
    sendJson(
      res,
      200,
      maps.map(({ id, stage, createdAt }) => ({ id, stage, createdAt }))
    );
    return;
  }

  if (req.method === 'POST' && !id) {
    if (maps.length >= MAX_MAPS) {
      sendJson(res, 429, { message: '업로드 가능한 맵 저장 공간이 가득 찼습니다.' });
      return;
    }
    let body;
    try {
      body = await readJsonBody(req, MAX_BODY_BYTES);
    } catch {
      sendJson(res, 413, { message: '요청 본문이 너무 크거나 JSON 형식이 아닙니다.' });
      return;
    }
    if (!isValidStage(body.stage)) {
      sendJson(res, 400, { message: '맵 데이터가 올바르지 않습니다.' });
      return;
    }
    const entry = {
      id: crypto.randomUUID(),
      ownerToken: crypto.randomBytes(16).toString('hex'),
      stage: sanitizeStage(body.stage),
      createdAt: Date.now(),
    };
    maps.push(entry);
    persist();
    sendJson(res, 201, { id: entry.id, ownerToken: entry.ownerToken });
    return;
  }

  if (req.method === 'DELETE' && id) {
    let body = {};
    try {
      body = await readJsonBody(req, 4096);
    } catch {
      // missing/invalid body is fine; the token may arrive via header instead
    }
    const token = body.ownerToken || req.headers['x-owner-token'];
    const idx = maps.findIndex((m) => m.id === id);
    if (idx === -1) {
      sendJson(res, 404, { message: '해당 맵을 찾을 수 없습니다.' });
      return;
    }
    if (!token || maps[idx].ownerToken !== token) {
      sendJson(res, 403, { message: '이 맵을 삭제할 권한이 없습니다.' });
      return;
    }
    maps.splice(idx, 1);
    persist();
    res.writeHead(204);
    res.end();
    return;
  }

  sendJson(res, 404, { message: 'Not found' });
}
