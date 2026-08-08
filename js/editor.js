import { TILE, PLAYER_W, PLAYER_H, ENEMY_W, ENEMY_H } from './constants.js';
import { getCustomStageEntries, saveCustomStage, deleteCustomStage } from './customLevels.js';

const CONE_W = 24;
const CONE_H = 28;
const DEFAULT_HINT = '방향키/A,D 이동 · Space 점프 · Shift 달리기 · Ctrl 웅크리기 · X 잽 · ESC 메뉴';
const KIND_TO_ARRAY = { platform: 'platforms', water: 'water', cone: 'cones', enemy: 'enemies' };

const clone = (o) => JSON.parse(JSON.stringify(o));

function defaultStage() {
  return {
    name: '새 맵',
    hint: DEFAULT_HINT,
    width: 20 * TILE,
    height: 16 * TILE,
    spawn: { x: 1 * TILE, y: 15 * TILE - PLAYER_H },
    goal: { x: 15 * TILE, y: 14 * TILE, w: TILE, h: TILE },
    platforms: [{ x: 0, y: 15 * TILE, w: 20 * TILE, h: TILE }],
    cones: [],
    enemies: [],
    water: [],
  };
}

let stage = defaultStage();
let editingId = null;
let tool = 'select';
let selected = null;
let zoom = 1;
let dragMode = null;
let dragStartCell = null;
let dragCurrentCell = null;
let mouseCell = { col: 0, row: 0 };
let statusTimer = null;
let movingAxis = 'x';
let undoStack = [];
let redoStack = [];
let moveDragSnapshotted = false;
let clipboard = null;
const MAX_UNDO = 50;

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const coordReadout = document.getElementById('coord-readout');
const nameInput = document.getElementById('stage-name');
const hintInput = document.getElementById('stage-hint');
const widthInput = document.getElementById('stage-width');
const heightInput = document.getElementById('stage-height');

function setStatus(msg) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.textContent = '';
  }, 5000);
}

function resizeCanvas() {
  canvas.width = stage.width;
  canvas.height = stage.height;
  canvas.style.width = `${stage.width * zoom}px`;
  canvas.style.height = `${stage.height * zoom}px`;
}

function eventToStageCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function toCell(x, y) {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

function placementRect(kind, col, row) {
  switch (kind) {
    case 'cone':
      return { x: col * TILE, y: row * TILE - CONE_H, w: CONE_W, h: CONE_H };
    case 'enemy':
      return { x: col * TILE, y: row * TILE - ENEMY_H, w: ENEMY_W, h: ENEMY_H };
    case 'spawn':
      return { x: col * TILE, y: row * TILE - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
    default:
      return { x: col * TILE, y: row * TILE, w: TILE, h: TILE };
  }
}

function rectFromCells(a, b) {
  const c0 = Math.min(a.col, b.col);
  const c1 = Math.max(a.col, b.col);
  const r0 = Math.min(a.row, b.row);
  const r1 = Math.max(a.row, b.row);
  return { x: c0 * TILE, y: r0 * TILE, w: (c1 - c0 + 1) * TILE, h: (r1 - r0 + 1) * TILE };
}

function rectDims(kind) {
  switch (kind) {
    case 'cone':
      return { w: CONE_W, h: CONE_H };
    case 'enemy':
      return { w: ENEMY_W, h: ENEMY_H };
    case 'spawn':
      return { w: PLAYER_W, h: PLAYER_H };
    default:
      return { w: TILE, h: TILE };
  }
}

function allObjects() {
  const list = [];
  stage.platforms.forEach((obj, index) => list.push({ kind: 'platform', obj, index }));
  stage.water.forEach((obj, index) => list.push({ kind: 'water', obj, index }));
  stage.cones.forEach((obj, index) => list.push({ kind: 'cone', obj, index }));
  stage.enemies.forEach((obj, index) => list.push({ kind: 'enemy', obj, index }));
  list.push({ kind: 'goal', obj: stage.goal, index: -1 });
  list.push({ kind: 'spawn', obj: stage.spawn, index: -1 });
  return list;
}

function hitTest(x, y) {
  const list = allObjects();
  for (let i = list.length - 1; i >= 0; i--) {
    const { kind, obj } = list[i];
    const dims = rectDims(kind);
    const w = obj.w != null ? obj.w : dims.w;
    const h = obj.h != null ? obj.h : dims.h;
    if (x >= obj.x && x <= obj.x + w && y >= obj.y && y <= obj.y + h) return list[i];
  }
  return null;
}

function isSelected(kind, index) {
  return !!selected && selected.kind === kind && selected.index === index;
}

function snapshotStage() {
  return JSON.stringify(stage);
}

function pushUndo() {
  undoStack.push(snapshotStage());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}

function restoreSnapshot(json) {
  stage = JSON.parse(json);
  if (!stage.water) stage.water = [];
  selected = null;
  syncMetaInputs();
  resizeCanvas();
  renderPropPanel();
  render();
}

function undo() {
  if (!undoStack.length) {
    setStatus('되돌릴 작업이 없습니다.');
    return;
  }
  redoStack.push(snapshotStage());
  restoreSnapshot(undoStack.pop());
  setStatus('실행 취소했습니다.');
}

function redo() {
  if (!redoStack.length) {
    setStatus('다시 실행할 작업이 없습니다.');
    return;
  }
  undoStack.push(snapshotStage());
  restoreSnapshot(redoStack.pop());
  setStatus('다시 실행했습니다.');
}

function deleteSelected() {
  if (!selected) return;
  if (selected.kind === 'goal' || selected.kind === 'spawn') {
    setStatus('스폰/골은 삭제할 수 없습니다.');
    return;
  }
  pushUndo();
  stage[KIND_TO_ARRAY[selected.kind]].splice(selected.index, 1);
  selected = null;
  renderPropPanel();
  render();
}

function selectedObjectData() {
  if (!selected) return null;
  const { kind, index } = selected;
  if (kind === 'goal' || kind === 'spawn') return null;
  const obj = kind === 'platform' || kind === 'water' ? stage[KIND_TO_ARRAY[kind]][index] : kind === 'cone' ? stage.cones[index] : stage.enemies[index];
  return { kind, data: clone(obj) };
}

function addFromClipboardData({ kind, data }, { atMouse = false } = {}) {
  let x;
  let y;
  if (atMouse) {
    x = mouseCell.col * TILE;
    y = kind === 'cone' ? mouseCell.row * TILE - CONE_H : kind === 'enemy' ? mouseCell.row * TILE - ENEMY_H : mouseCell.row * TILE;
  } else {
    x = data.x + TILE;
    y = data.y;
  }
  if (kind === 'platform' || kind === 'water') {
    stage[KIND_TO_ARRAY[kind]].push({ ...clone(data), x, y });
    selected = { kind, index: stage[KIND_TO_ARRAY[kind]].length - 1 };
  } else if (kind === 'cone') {
    stage.cones.push({ x, y });
    selected = { kind, index: stage.cones.length - 1 };
  } else if (kind === 'enemy') {
    const dx = x - data.x;
    const patrolMinX = Math.max(0, data.patrolMinX + dx);
    const patrolMaxX = patrolMinX + (data.patrolMaxX - data.patrolMinX);
    stage.enemies.push({ x, y, patrolMinX, patrolMaxX });
    selected = { kind, index: stage.enemies.length - 1 };
  }
}

function copySelected() {
  const picked = selectedObjectData();
  if (!picked) {
    setStatus(selected ? '스폰/골은 복사할 수 없습니다.' : '복사할 오브젝트를 먼저 선택하세요.');
    return;
  }
  clipboard = picked;
  setStatus('복사했습니다. Ctrl+V로 붙여넣으세요.');
}

function pasteClipboard() {
  if (!clipboard) {
    setStatus('붙여넣을 내용이 없습니다.');
    return;
  }
  pushUndo();
  addFromClipboardData(clipboard, { atMouse: true });
  renderPropPanel();
  render();
  setStatus('붙여넣었습니다.');
}

function duplicateSelected() {
  const picked = selectedObjectData();
  if (!picked) {
    setStatus(selected ? '스폰/골은 복제할 수 없습니다.' : '복제할 오브젝트를 먼저 선택하세요.');
    return;
  }
  clipboard = picked;
  pushUndo();
  addFromClipboardData(picked, { atMouse: false });
  renderPropPanel();
  render();
  setStatus('복제했습니다.');
}

function nudgeSelected(key) {
  if (!selected) return;
  if (selected.kind === 'goal' || selected.kind === 'spawn') {
    setStatus('스폰/골은 선택 도구로 드래그해서 옮기세요.');
    return;
  }
  const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  if (!dc && !dr) return;
  pushUndo();
  const { kind, index } = selected;
  const obj = kind === 'platform' || kind === 'water' ? stage[KIND_TO_ARRAY[kind]][index] : kind === 'cone' ? stage.cones[index] : stage.enemies[index];
  obj.x += dc * TILE;
  obj.y += dr * TILE;
  if (kind === 'enemy') {
    obj.patrolMinX += dc * TILE;
    obj.patrolMaxX += dc * TILE;
  }
  renderPropPanel();
  render();
}

function moveSelectedTo(cell) {
  const { kind, index } = selected;
  if (kind === 'platform' || kind === 'water') {
    const obj = stage[KIND_TO_ARRAY[kind]][index];
    obj.x = cell.col * TILE;
    obj.y = cell.row * TILE;
  } else if (kind === 'goal') {
    stage.goal.x = cell.col * TILE;
    stage.goal.y = cell.row * TILE;
  } else if (kind === 'cone') {
    const obj = stage.cones[index];
    obj.x = cell.col * TILE;
    obj.y = cell.row * TILE - CONE_H;
  } else if (kind === 'enemy') {
    const obj = stage.enemies[index];
    const newX = cell.col * TILE;
    const dx = newX - obj.x;
    obj.x = newX;
    obj.y = cell.row * TILE - ENEMY_H;
    obj.patrolMinX += dx;
    obj.patrolMaxX += dx;
  } else if (kind === 'spawn') {
    stage.spawn.x = cell.col * TILE;
    stage.spawn.y = cell.row * TILE - PLAYER_H;
  }
}

function onMouseDown(e) {
  const { x, y } = eventToStageCoords(e);
  const cell = toCell(x, y);
  mouseCell = cell;

  if (tool === 'select') {
    const hit = hitTest(x, y);
    selected = hit ? { kind: hit.kind, index: hit.index } : null;
    renderPropPanel();
    if (hit) {
      dragMode = 'move';
      moveDragSnapshotted = false;
    }
  } else if (tool === 'erase') {
    const hit = hitTest(x, y);
    if (hit && hit.kind !== 'goal' && hit.kind !== 'spawn') {
      pushUndo();
      stage[KIND_TO_ARRAY[hit.kind]].splice(hit.index, 1);
      if (selected && selected.kind === hit.kind && selected.index === hit.index) {
        selected = null;
        renderPropPanel();
      }
    }
  } else if (tool === 'platform' || tool === 'water' || tool === 'moving') {
    dragMode = 'rect';
    dragStartCell = cell;
    dragCurrentCell = cell;
  } else if (tool === 'cone') {
    pushUndo();
    const r = placementRect('cone', cell.col, cell.row);
    stage.cones.push({ x: r.x, y: r.y });
  } else if (tool === 'enemy') {
    pushUndo();
    const r = placementRect('enemy', cell.col, cell.row);
    const patrolMinX = Math.max(0, r.x - 3 * TILE);
    const patrolMaxX = Math.min(stage.width - ENEMY_W, r.x + 3 * TILE);
    stage.enemies.push({ x: r.x, y: r.y, patrolMinX, patrolMaxX });
  } else if (tool === 'spawn') {
    pushUndo();
    const r = placementRect('spawn', cell.col, cell.row);
    stage.spawn = { x: r.x, y: r.y };
  } else if (tool === 'goal') {
    pushUndo();
    const r = placementRect('goal', cell.col, cell.row);
    stage.goal = { x: r.x, y: r.y, w: r.w, h: r.h };
  }
  render();
}

function onMouseMove(e) {
  const { x, y } = eventToStageCoords(e);
  const cell = toCell(x, y);
  mouseCell = cell;
  coordReadout.textContent = `열 ${cell.col}, 행 ${cell.row} (x:${cell.col * TILE}, y:${cell.row * TILE})`;

  if (dragMode === 'rect') {
    dragCurrentCell = cell;
  } else if (dragMode === 'move' && selected) {
    if (!moveDragSnapshotted) {
      pushUndo();
      moveDragSnapshotted = true;
    }
    moveSelectedTo(cell);
  }
  render();
}

function onMouseUp() {
  if (dragMode === 'rect' && dragStartCell && dragCurrentCell) {
    const rect = rectFromCells(dragStartCell, dragCurrentCell);
    pushUndo();
    if (tool === 'platform') {
      stage.platforms.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    } else if (tool === 'water') {
      stage.water.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    } else if (tool === 'moving') {
      stage.platforms.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, moving: { axis: movingAxis, range: 2 * TILE, speed: 1 } });
    }
  }
  if (dragMode === 'move') renderPropPanel();
  dragMode = null;
  dragStartCell = null;
  dragCurrentCell = null;
  moveDragSnapshotted = false;
  render();
}

function strokeSelection(x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  ctx.restore();
}

function drawAxisArrow(cx, cy, axis) {
  ctx.fillStyle = '#2b6cb0';
  ctx.beginPath();
  if (axis === 'x') {
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy - 6);
    ctx.lineTo(cx + 8, cy + 6);
  } else {
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 6, cy + 8);
    ctx.lineTo(cx + 6, cy + 8);
  }
  ctx.closePath();
  ctx.fill();
}

function drawPlatformBox(p, sel) {
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = '#5c5c5c';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
  if (p.moving) drawAxisArrow(p.x + p.w / 2, p.y + p.h / 2, p.moving.axis);
  if (sel) strokeSelection(p.x, p.y, p.w, p.h);
}

function drawWaterBox(w, sel) {
  ctx.fillStyle = 'rgba(40,110,200,0.45)';
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = 'rgba(190,225,255,0.65)';
  ctx.fillRect(w.x, w.y, w.w, 4);
  if (sel) strokeSelection(w.x, w.y, w.w, w.h);
}

function drawConeIcon(c, sel) {
  const x = c.x;
  const y = c.y;
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(x - 2, y + CONE_H - 4, CONE_W + 4, 4);
  ctx.fillStyle = '#d3382c';
  ctx.beginPath();
  ctx.moveTo(x + CONE_W / 2, y);
  ctx.lineTo(x + CONE_W, y + CONE_H - 4);
  ctx.lineTo(x, y + CONE_H - 4);
  ctx.closePath();
  ctx.fill();
  if (sel) strokeSelection(x, y, CONE_W, CONE_H);
}

function drawEnemyIcon(e, sel) {
  ctx.fillStyle = '#b5651d';
  ctx.fillRect(e.x, e.y, ENEMY_W, ENEMY_H);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(e.x + 0.5, e.y + 0.5, ENEMY_W - 1, ENEMY_H - 1);

  const midY = e.y + ENEMY_H / 2;
  ctx.strokeStyle = 'rgba(255,180,60,0.9)';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.patrolMinX + ENEMY_W / 2, midY);
  ctx.lineTo(e.patrolMaxX + ENEMY_W / 2, midY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,180,60,0.9)';
  [e.patrolMinX, e.patrolMaxX].forEach((px) => {
    ctx.fillRect(px + ENEMY_W / 2 - 1, midY - 6, 2, 12);
  });
  if (sel) strokeSelection(e.x, e.y, ENEMY_W, ENEMY_H);
}

function drawGoalIcon(g, sel) {
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(g.x + g.w / 2 - 2, g.y - TILE, 4, TILE + g.h);
  ctx.fillStyle = '#3ecf5b';
  ctx.beginPath();
  ctx.moveTo(g.x + g.w / 2 + 2, g.y - TILE);
  ctx.lineTo(g.x + g.w / 2 + 22, g.y - TILE + 8);
  ctx.lineTo(g.x + g.w / 2 + 2, g.y - TILE + 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(62,207,91,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(g.x, g.y, g.w, g.h);
  if (sel) strokeSelection(g.x, g.y - TILE, Math.max(g.w, 24), TILE + g.h);
}

function drawSpawnIcon(s, sel) {
  ctx.fillStyle = 'rgba(70,200,120,0.55)';
  ctx.fillRect(s.x, s.y, PLAYER_W, PLAYER_H);
  ctx.strokeStyle = '#2fae63';
  ctx.lineWidth = 2;
  ctx.strokeRect(s.x + 1, s.y + 1, PLAYER_W - 2, PLAYER_H - 2);
  ctx.fillStyle = '#0e3d20';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('P', s.x + PLAYER_W / 2, s.y + PLAYER_H / 2 + 3);
  ctx.textAlign = 'left';
  if (sel) strokeSelection(s.x, s.y, PLAYER_W, PLAYER_H);
}

function drawPreview() {
  if (dragMode === 'rect' && dragStartCell && dragCurrentCell) {
    const r = rectFromCells(dragStartCell, dragCurrentCell);
    ctx.fillStyle = tool === 'water' ? 'rgba(40,110,200,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (tool === 'moving') drawAxisArrow(r.x + r.w / 2, r.y + r.h / 2, movingAxis);
    return;
  }
  if (dragMode === 'move') return;
  if (tool === 'platform' || tool === 'water' || tool === 'moving') {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tool === 'water' ? '#286ec8' : '#ffffff';
    ctx.fillRect(mouseCell.col * TILE, mouseCell.row * TILE, TILE, TILE);
    ctx.globalAlpha = 1;
  } else if (tool === 'cone' || tool === 'enemy' || tool === 'spawn' || tool === 'goal') {
    const r = placementRect(tool, mouseCell.col, mouseCell.row);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = tool === 'cone' ? '#d3382c' : tool === 'enemy' ? '#b5651d' : tool === 'goal' ? '#3ecf5b' : '#46c878';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#bfe6ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= stage.width / TILE; c++) {
    ctx.beginPath();
    ctx.moveTo(c * TILE + 0.5, 0);
    ctx.lineTo(c * TILE + 0.5, stage.height);
    ctx.stroke();
  }
  for (let r = 0; r <= stage.height / TILE; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * TILE + 0.5);
    ctx.lineTo(stage.width, r * TILE + 0.5);
    ctx.stroke();
  }

  stage.water.forEach((w, i) => drawWaterBox(w, isSelected('water', i)));
  stage.platforms.forEach((p, i) => drawPlatformBox(p, isSelected('platform', i)));
  stage.cones.forEach((c, i) => drawConeIcon(c, isSelected('cone', i)));
  stage.enemies.forEach((e, i) => drawEnemyIcon(e, isSelected('enemy', i)));
  drawGoalIcon(stage.goal, isSelected('goal', -1));
  drawSpawnIcon(stage.spawn, isSelected('spawn', -1));

  drawPreview();
}

function renderPropPanel() {
  const panel = document.getElementById('prop-panel');
  if (!selected) {
    panel.innerHTML = '<div class="legend">오브젝트를 선택하면 여기에 속성이 표시됩니다.</div>';
    return;
  }
  const { kind, index } = selected;

  if (kind === 'platform' || kind === 'water') {
    const obj = stage[KIND_TO_ARRAY[kind]][index];
    panel.innerHTML = `
      <label>X (타일)</label><input type="number" id="p-x" value="${obj.x / TILE}">
      <label>Y (타일)</label><input type="number" id="p-y" value="${obj.y / TILE}">
      <label>가로 (타일)</label><input type="number" id="p-w" min="1" value="${obj.w / TILE}">
      <label>높이 (타일)</label><input type="number" id="p-h" min="1" value="${obj.h / TILE}">
      ${kind === 'platform' ? `<label><input type="checkbox" id="p-moving" ${obj.moving ? 'checked' : ''} style="width:auto;display:inline;margin-right:6px;">움직이는 발판</label>
      <div id="p-moving-fields" style="${obj.moving ? '' : 'display:none;'}">
        <label>축</label>
        <select id="p-axis">
          <option value="x" ${obj.moving && obj.moving.axis === 'x' ? 'selected' : ''}>가로(X)</option>
          <option value="y" ${obj.moving && obj.moving.axis === 'y' ? 'selected' : ''}>세로(Y)</option>
        </select>
        <label>범위 (타일)</label><input type="number" id="p-range" step="0.1" value="${obj.moving ? obj.moving.range / TILE : 2}">
        <label>속도</label><input type="number" id="p-speed" step="0.1" value="${obj.moving ? obj.moving.speed : 1}">
      </div>` : ''}
      <div class="btn-col"><button id="p-delete" class="danger">삭제</button></div>
    `;
    const applyRect = () => {
      pushUndo();
      obj.x = Number(document.getElementById('p-x').value) * TILE;
      obj.y = Number(document.getElementById('p-y').value) * TILE;
      obj.w = Math.max(1, Number(document.getElementById('p-w').value)) * TILE;
      obj.h = Math.max(1, Number(document.getElementById('p-h').value)) * TILE;
      render();
    };
    ['p-x', 'p-y', 'p-w', 'p-h'].forEach((id) => document.getElementById(id).addEventListener('change', applyRect));
    if (kind === 'platform') {
      const movingCb = document.getElementById('p-moving');
      const fields = document.getElementById('p-moving-fields');
      movingCb.addEventListener('change', () => {
        pushUndo();
        if (movingCb.checked) {
          obj.moving = obj.moving || { axis: 'x', range: 2 * TILE, speed: 1 };
          fields.style.display = '';
        } else {
          delete obj.moving;
          fields.style.display = 'none';
        }
        render();
      });
      const applyMoving = () => {
        if (!obj.moving) return;
        pushUndo();
        obj.moving.axis = document.getElementById('p-axis').value;
        obj.moving.range = Number(document.getElementById('p-range').value) * TILE;
        obj.moving.speed = Number(document.getElementById('p-speed').value);
      };
      ['p-axis', 'p-range', 'p-speed'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyMoving);
      });
    }
    document.getElementById('p-delete').addEventListener('click', deleteSelected);
  } else if (kind === 'cone') {
    const obj = stage.cones[index];
    panel.innerHTML = `
      <label>열 (X 타일)</label><input type="number" id="p-col" value="${obj.x / TILE}">
      <label>바닥 행 (Y 타일)</label><input type="number" id="p-row" value="${(obj.y + CONE_H) / TILE}">
      <div class="btn-col"><button id="p-delete" class="danger">삭제</button></div>
    `;
    const apply = () => {
      pushUndo();
      obj.x = Number(document.getElementById('p-col').value) * TILE;
      obj.y = Number(document.getElementById('p-row').value) * TILE - CONE_H;
      render();
    };
    document.getElementById('p-col').addEventListener('change', apply);
    document.getElementById('p-row').addEventListener('change', apply);
    document.getElementById('p-delete').addEventListener('click', deleteSelected);
  } else if (kind === 'enemy') {
    const obj = stage.enemies[index];
    panel.innerHTML = `
      <label>열 (X 타일)</label><input type="number" id="p-col" value="${obj.x / TILE}">
      <label>바닥 행 (Y 타일)</label><input type="number" id="p-row" value="${(obj.y + ENEMY_H) / TILE}">
      <label>순찰 최소 X (타일)</label><input type="number" id="p-min" value="${obj.patrolMinX / TILE}">
      <label>순찰 최대 X (타일)</label><input type="number" id="p-max" value="${obj.patrolMaxX / TILE}">
      <div class="btn-col"><button id="p-delete" class="danger">삭제</button></div>
    `;
    const apply = () => {
      pushUndo();
      obj.x = Number(document.getElementById('p-col').value) * TILE;
      obj.y = Number(document.getElementById('p-row').value) * TILE - ENEMY_H;
      obj.patrolMinX = Number(document.getElementById('p-min').value) * TILE;
      obj.patrolMaxX = Number(document.getElementById('p-max').value) * TILE;
      render();
    };
    ['p-col', 'p-row', 'p-min', 'p-max'].forEach((id) => document.getElementById(id).addEventListener('change', apply));
    document.getElementById('p-delete').addEventListener('click', deleteSelected);
  } else if (kind === 'spawn') {
    panel.innerHTML = `
      <label>열 (X 타일)</label><input type="number" id="p-col" value="${stage.spawn.x / TILE}">
      <label>바닥 행 (Y 타일)</label><input type="number" id="p-row" value="${(stage.spawn.y + PLAYER_H) / TILE}">
      <div class="legend hint">스폰 지점은 삭제할 수 없습니다.</div>
    `;
    const apply = () => {
      pushUndo();
      stage.spawn.x = Number(document.getElementById('p-col').value) * TILE;
      stage.spawn.y = Number(document.getElementById('p-row').value) * TILE - PLAYER_H;
      render();
    };
    document.getElementById('p-col').addEventListener('change', apply);
    document.getElementById('p-row').addEventListener('change', apply);
  } else if (kind === 'goal') {
    panel.innerHTML = `
      <label>열 (X 타일)</label><input type="number" id="p-col" value="${stage.goal.x / TILE}">
      <label>행 (Y 타일)</label><input type="number" id="p-row" value="${stage.goal.y / TILE}">
      <div class="legend hint">골 지점은 삭제할 수 없습니다.</div>
    `;
    const apply = () => {
      pushUndo();
      stage.goal.x = Number(document.getElementById('p-col').value) * TILE;
      stage.goal.y = Number(document.getElementById('p-row').value) * TILE;
      render();
    };
    document.getElementById('p-col').addEventListener('change', apply);
    document.getElementById('p-row').addEventListener('change', apply);
  }
}

function syncMetaInputs() {
  nameInput.value = stage.name;
  hintInput.value = stage.hint;
  widthInput.value = stage.width / TILE;
  heightInput.value = stage.height / TILE;
}

function sanitizeStageForSave(s) {
  return {
    name: s.name && s.name.trim() ? s.name.trim() : '이름 없는 맵',
    hint: s.hint || DEFAULT_HINT,
    width: s.width,
    height: s.height,
    spawn: { x: s.spawn.x, y: s.spawn.y },
    goal: { x: s.goal.x, y: s.goal.y, w: s.goal.w, h: s.goal.h },
    platforms: s.platforms.map((p) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      ...(p.moving ? { moving: { axis: p.moving.axis, range: p.moving.range, speed: p.moving.speed } } : {}),
    })),
    cones: s.cones.map((c) => ({ x: c.x, y: c.y })),
    enemies: s.enemies.map((e) => ({ x: e.x, y: e.y, patrolMinX: e.patrolMinX, patrolMaxX: e.patrolMaxX })),
    water: (s.water || []).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
  };
}

function normalizeImported(o) {
  return {
    name: o.name || '불러온 맵',
    hint: o.hint || DEFAULT_HINT,
    width: o.width || 20 * TILE,
    height: o.height || 16 * TILE,
    spawn: o.spawn || { x: TILE, y: 15 * TILE - PLAYER_H },
    goal: o.goal || { x: 15 * TILE, y: 14 * TILE, w: TILE, h: TILE },
    platforms: Array.isArray(o.platforms) ? o.platforms : [],
    cones: Array.isArray(o.cones) ? o.cones : [],
    enemies: Array.isArray(o.enemies) ? o.enemies : [],
    water: Array.isArray(o.water) ? o.water : [],
  };
}

function numExpr(n) {
  if (n === 0) return '0';
  if (Number.isInteger(n / TILE)) return `${n / TILE} * TILE`;
  return `${n}`;
}

function stageToCode(s) {
  const platformsCode = s.platforms
    .map((p) => {
      const base = `{ x: ${numExpr(p.x)}, y: ${numExpr(p.y)}, w: ${numExpr(p.w)}, h: ${numExpr(p.h)}`;
      if (p.moving) {
        return `${base}, moving: { axis: '${p.moving.axis}', range: ${numExpr(p.moving.range)}, speed: ${p.moving.speed} } }`;
      }
      return `${base} }`;
    })
    .join(',\n      ');
  const conesCode = s.cones.map((c) => `{ x: ${numExpr(c.x)}, y: ${numExpr(c.y)} }`).join(',\n      ');
  const enemiesCode = s.enemies
    .map((e) => `{ x: ${numExpr(e.x)}, y: ${numExpr(e.y)}, patrolMinX: ${numExpr(e.patrolMinX)}, patrolMaxX: ${numExpr(e.patrolMaxX)} }`)
    .join(',\n      ');
  const waterCode = (s.water || []).map((w) => `{ x: ${numExpr(w.x)}, y: ${numExpr(w.y)}, w: ${numExpr(w.w)}, h: ${numExpr(w.h)} }`).join(',\n      ');

  return `{
    name: '${s.name.replace(/'/g, "\\'")}',
    hint: '${s.hint.replace(/'/g, "\\'")}',
    width: ${numExpr(s.width)},
    height: ${numExpr(s.height)},
    spawn: { x: ${numExpr(s.spawn.x)}, y: ${numExpr(s.spawn.y)} },
    goal: { x: ${numExpr(s.goal.x)}, y: ${numExpr(s.goal.y)}, w: ${numExpr(s.goal.w)}, h: ${numExpr(s.goal.h)} },
    platforms: [
      ${platformsCode}
    ],
    cones: [${conesCode ? `\n      ${conesCode}\n    ` : ''}],
    enemies: [${enemiesCode ? `\n      ${enemiesCode}\n    ` : ''}],${
    waterCode
      ? `
    water: [
      ${waterCode}
    ],`
      : ''
  }
  }`;
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function refreshMapsList() {
  const ul = document.getElementById('maps-list');
  const entries = getCustomStageEntries();
  ul.innerHTML = '';
  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = entry.id === editingId ? 'active' : '';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = entry.stage.name;
    nameSpan.style.flex = '1';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    li.appendChild(nameSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.textContent = '✕';
    delBtn.title = '삭제';
    delBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      if (!confirm(`"${entry.stage.name}" 맵을 삭제할까요?`)) return;
      deleteCustomStage(entry.id);
      if (editingId === entry.id) resetToNewStage();
      refreshMapsList();
    });
    li.appendChild(delBtn);

    li.addEventListener('click', () => {
      stage = normalizeImported(clone(entry.stage));
      editingId = entry.id;
      selected = null;
      undoStack = [];
      redoStack = [];
      syncMetaInputs();
      resizeCanvas();
      renderPropPanel();
      render();
      refreshMapsList();
      updateEditingLabel();
      setStatus(`"${stage.name}" 불러왔습니다.`);
    });
    ul.appendChild(li);
  });
}

function updateEditingLabel() {
  const label = document.getElementById('editing-label');
  document.getElementById('btn-delete-map').disabled = !editingId;
  label.textContent = editingId ? `편집 중: ${stage.name} (저장됨)` : '새 맵 (아직 저장 안 됨)';
}

function resetToNewStage() {
  stage = defaultStage();
  editingId = null;
  selected = null;
  undoStack = [];
  redoStack = [];
  syncMetaInputs();
  resizeCanvas();
  renderPropPanel();
  render();
  updateEditingLabel();
}

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const movingAxisChoice = document.getElementById('moving-axis-choice');
const TOOL_KEYS = { 1: 'select', 2: 'erase', 3: 'platform', 4: 'moving', 5: 'water', 6: 'cone', 7: 'enemy', 8: 'spawn', 9: 'goal' };

function selectTool(name) {
  document.querySelectorAll('.tool-btn').forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
  tool = name;
  dragMode = null;
  dragStartCell = null;
  dragCurrentCell = null;
  movingAxisChoice.style.display = tool === 'moving' ? '' : 'none';
  if (tool !== 'select') {
    selected = null;
    renderPropPanel();
  }
  render();
}

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  const ctrlOrCmd = e.ctrlKey || e.metaKey;

  if (ctrlOrCmd && e.key.toLowerCase() === 's') {
    e.preventDefault();
    document.getElementById('btn-save-map').click();
    return;
  }
  if (typing) return;

  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
    e.preventDefault();
    deleteSelected();
    return;
  }
  if (ctrlOrCmd && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (ctrlOrCmd && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (ctrlOrCmd && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    copySelected();
    return;
  }
  if (ctrlOrCmd && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    pasteClipboard();
    return;
  }
  if (ctrlOrCmd && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
    return;
  }
  if (e.key === 'Escape') {
    if (dragMode) {
      dragMode = null;
      dragStartCell = null;
      dragCurrentCell = null;
      render();
    } else if (selected) {
      selected = null;
      renderPropPanel();
      render();
    }
    return;
  }
  if (ctrlOrCmd || e.altKey) return;

  if (TOOL_KEYS[e.key]) {
    e.preventDefault();
    selectTool(TOOL_KEYS[e.key]);
    return;
  }
  if (selected && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    nudgeSelected(e.key);
  }
});

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectTool(btn.dataset.tool));
});

document.querySelectorAll('.axis-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.axis-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    movingAxis = btn.dataset.axis;
    render();
  });
});

document.getElementById('zoom-select').addEventListener('change', (e) => {
  zoom = Number(e.target.value);
  resizeCanvas();
});

nameInput.addEventListener('change', () => {
  stage.name = nameInput.value || '이름 없는 맵';
});
hintInput.addEventListener('change', () => {
  stage.hint = hintInput.value;
});

document.getElementById('btn-apply-size').addEventListener('click', () => {
  const newW = Math.max(10, Math.round(Number(widthInput.value))) * TILE;
  const newH = Math.max(10, Math.round(Number(heightInput.value))) * TILE;
  const outOfBounds =
    [...stage.platforms, ...stage.water].some((o) => o.x + o.w > newW || o.y + o.h > newH) ||
    stage.cones.some((c) => c.x + CONE_W > newW || c.y + CONE_H > newH) ||
    stage.enemies.some((en) => en.x + ENEMY_W > newW || en.y + ENEMY_H > newH) ||
    stage.goal.x + stage.goal.w > newW ||
    stage.goal.y + stage.goal.h > newH ||
    stage.spawn.x + PLAYER_W > newW ||
    stage.spawn.y + PLAYER_H > newH;
  if (outOfBounds && !confirm('크기를 줄이면 일부 오브젝트가 화면 밖으로 벗어날 수 있습니다. 계속하시겠습니까?')) return;
  pushUndo();
  stage.width = newW;
  stage.height = newH;
  resizeCanvas();
  render();
  setStatus('맵 크기를 적용했습니다.');
});

document.getElementById('btn-new-map').addEventListener('click', () => {
  if (!confirm('현재 편집 중인 맵 내용을 지우고 새 맵을 시작할까요? 저장하지 않은 변경사항은 사라집니다.')) return;
  resetToNewStage();
  setStatus('새 맵을 시작했습니다.');
});

document.getElementById('btn-save-map').addEventListener('click', () => {
  const cleanStage = sanitizeStageForSave(stage);
  editingId = saveCustomStage(clone(cleanStage), editingId);
  refreshMapsList();
  updateEditingLabel();
  setStatus(`"${cleanStage.name}" 저장 완료. 게임의 스테이지 선택에서 바로 플레이할 수 있습니다.`);
});

document.getElementById('btn-delete-map').addEventListener('click', () => {
  if (!editingId) return;
  if (!confirm(`"${stage.name}" 맵을 삭제할까요?`)) return;
  deleteCustomStage(editingId);
  resetToNewStage();
  refreshMapsList();
  setStatus('삭제했습니다.');
});

document.getElementById('btn-gen-code').addEventListener('click', () => {
  const code = `${stageToCode(sanitizeStageForSave(stage))},`;
  document.getElementById('export-code').value = code;
  setStatus('코드를 생성했습니다. levels.js의 STAGES 배열 안에 붙여넣으세요.');
});

document.getElementById('btn-copy-code').addEventListener('click', async () => {
  const ta = document.getElementById('export-code');
  if (!ta.value) {
    setStatus('먼저 코드를 생성하세요.');
    return;
  }
  try {
    await navigator.clipboard.writeText(ta.value);
    setStatus('클립보드에 복사했습니다.');
  } catch {
    ta.select();
    setStatus('클립보드 접근이 차단되어 텍스트를 선택했습니다. Ctrl+C로 복사하세요.');
  }
});

document.getElementById('btn-download-js').addEventListener('click', () => {
  const clean = sanitizeStageForSave(stage);
  const code = `import { TILE } from '../js/constants.js';\n\nexport default ${stageToCode(clean)};\n`;
  download(`${(clean.name || 'stage').replace(/\s+/g, '_')}.js`, code);
  setStatus('다운로드했습니다. 이 파일을 프로젝트의 custom-stages 폴더에 넣으면 게임이 자동으로 스테이지에 추가합니다.');
});

document.getElementById('btn-download-json').addEventListener('click', () => {
  const clean = sanitizeStageForSave(stage);
  download(`${(clean.name || 'stage').replace(/\s+/g, '_')}.json`, JSON.stringify(clean, null, 2));
  setStatus('다운로드했습니다. 이 파일도 custom-stages 폴더에 넣으면 게임이 자동으로 인식합니다.');
});

document.getElementById('import-json-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      stage = normalizeImported(JSON.parse(reader.result));
      editingId = null;
      selected = null;
      undoStack = [];
      redoStack = [];
      syncMetaInputs();
      resizeCanvas();
      renderPropPanel();
      render();
      updateEditingLabel();
      setStatus('JSON 맵을 불러왔습니다. (아직 저장되지 않음)');
    } catch (err) {
      setStatus(`JSON을 읽는 중 오류가 발생했습니다: ${err.message}`);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-export-all').addEventListener('click', () => {
  const entries = getCustomStageEntries();
  if (!entries.length) {
    setStatus('저장된 맵이 없습니다.');
    return;
  }
  const code = entries.map((entry) => `  ${stageToCode(sanitizeStageForSave(entry.stage))}`).join(',\n');
  document.getElementById('export-code').value = `[\n${code},\n]\n`;
  setStatus(`저장된 맵 ${entries.length}개를 코드로 내보냈습니다.`);
});

syncMetaInputs();
resizeCanvas();
refreshMapsList();
updateEditingLabel();
renderPropPanel();
render();
