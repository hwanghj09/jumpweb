import { TILE } from './constants.js';

const CONE_H = 28;
const onTop = (rowTile) => rowTile * TILE - CONE_H;

const TUNNEL_CLEARANCE = 22;
const TUNNEL_THICKNESS = 40;
const ceilingAbove = (floorRowTile) => floorRowTile * TILE - TUNNEL_CLEARANCE - TUNNEL_THICKNESS;

const HINT = '방향키/A,D 이동 · Space 점프 · Shift 달리기 · Ctrl 웅크리기 · X 잽 · ESC 메뉴';

export const STAGES = [
  {
    name: 'STAGE 1 - 튜토리얼',
    hint: HINT,
    width: 32 * TILE,
    height: 16 * TILE,
    spawn: { x: 1 * TILE, y: 14 * TILE },
    goal: { x: 29 * TILE, y: 14 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 15 * TILE, w: 10 * TILE, h: TILE },
      { x: 12 * TILE, y: 15 * TILE, w: 8 * TILE, h: TILE },
      { x: 21 * TILE, y: 15 * TILE, w: 11 * TILE, h: TILE },
    ],
    cones: [],
    enemies: [],
  },
  {
    name: 'STAGE 2 - 원뿔 등장',
    hint: HINT,
    width: 34 * TILE,
    height: 16 * TILE,
    spawn: { x: 1 * TILE, y: 14 * TILE },
    goal: { x: 32 * TILE, y: 14 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 15 * TILE, w: 15 * TILE, h: TILE },
      { x: 16 * TILE, y: 15 * TILE, w: 18 * TILE, h: TILE },
    ],
    cones: [
      { x: 5 * TILE, y: onTop(15) },
      { x: 20 * TILE, y: onTop(15) },
      { x: 28 * TILE, y: onTop(15) },
    ],
    enemies: [],
  },
  {
    name: 'STAGE 3 - 장애물 캐릭터 등장',
    hint: HINT,
    width: 36 * TILE,
    height: 16 * TILE,
    spawn: { x: 1 * TILE, y: 14 * TILE },
    goal: { x: 34 * TILE, y: 14 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 15 * TILE, w: 18 * TILE, h: TILE },
      { x: 19 * TILE, y: 15 * TILE, w: 17 * TILE, h: TILE },
    ],
    cones: [{ x: 12 * TILE, y: onTop(15) }],
    enemies: [{ x: 25 * TILE, y: 15 * TILE - 30, patrolMinX: 22 * TILE, patrolMaxX: 30 * TILE }],
  },
  {
    name: 'STAGE 4 - 이동 발판',
    hint: HINT,
    width: 20 * TILE,
    height: 20 * TILE,
    spawn: { x: 1 * TILE, y: 18 * TILE },
    goal: { x: 15 * TILE, y: 5 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 19 * TILE, w: 5 * TILE, h: TILE },
      { x: 8 * TILE, y: 13 * TILE, w: 4 * TILE, h: TILE },
      { x: 12 * TILE, y: 6 * TILE, w: 6 * TILE, h: TILE },
      { x: 3 * TILE, y: 16 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'x', range: 2.5 * TILE, speed: 1.2 } },
      { x: 13 * TILE, y: 10 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'y', range: 3.5 * TILE, speed: 1.0 } },
    ],
    cones: [{ x: 9 * TILE, y: onTop(13) }],
    enemies: [],
  },
  {
    name: 'STAGE 5 - 종합 점프맵',
    hint: HINT,
    width: 24 * TILE,
    height: 26 * TILE,
    spawn: { x: 1 * TILE, y: 24 * TILE },
    goal: { x: 21 * TILE, y: 2 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 25 * TILE, w: 5 * TILE, h: TILE },
      { x: 7 * TILE, y: 21 * TILE, w: 5 * TILE, h: TILE },
      { x: 12 * TILE, y: 15 * TILE, w: 6 * TILE, h: TILE },
      { x: 16 * TILE, y: 9 * TILE, w: 6 * TILE, h: TILE },
      { x: 19 * TILE, y: 3 * TILE, w: 5 * TILE, h: TILE },
      { x: 5 * TILE, y: 23 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'x', range: 2.5 * TILE, speed: 1.2 } },
      { x: 13 * TILE, y: 18 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'y', range: 3 * TILE, speed: 1.0 } },
      { x: 18 * TILE, y: 12 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'x', range: 2 * TILE, speed: 1.3 } },
      { x: 21 * TILE, y: 6 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'y', range: 2.5 * TILE, speed: 1.1 } },
    ],
    cones: [
      { x: 9 * TILE, y: onTop(21) },
      { x: 18 * TILE, y: onTop(9) },
    ],
    enemies: [{ x: 14 * TILE, y: 15 * TILE - 30, patrolMinX: 12 * TILE, patrolMaxX: 17 * TILE }],
  },
  {
    name: 'STAGE 6 - 웅크리기 구간',
    hint: HINT,
    width: 30 * TILE,
    height: 16 * TILE,
    spawn: { x: 1 * TILE, y: 14 * TILE },
    goal: { x: 28 * TILE, y: 14 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 15 * TILE, w: 30 * TILE, h: TILE },
      { x: 8 * TILE, y: ceilingAbove(15), w: 6 * TILE, h: TUNNEL_THICKNESS },
      { x: 18 * TILE, y: ceilingAbove(15), w: 6 * TILE, h: TUNNEL_THICKNESS },
    ],
    cones: [{ x: 16 * TILE, y: onTop(15) }],
    enemies: [],
  },
  {
    name: 'STAGE 7 - 고난도 복합 구간',
    hint: HINT,
    width: 26 * TILE,
    height: 22 * TILE,
    spawn: { x: 1 * TILE, y: 19 * TILE },
    goal: { x: 23 * TILE, y: 7 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 20 * TILE, w: 8 * TILE, h: TILE },
      { x: 8 * TILE, y: 20 * TILE, w: 6 * TILE, h: TILE },
      { x: 8 * TILE, y: ceilingAbove(20), w: 6 * TILE, h: TUNNEL_THICKNESS },
      { x: 14 * TILE, y: 20 * TILE, w: 4 * TILE, h: TILE },
      { x: 19 * TILE, y: 18 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'x', range: 2 * TILE, speed: 1.2 } },
      { x: 22 * TILE, y: 17 * TILE, w: 4 * TILE, h: TILE },
      { x: 24 * TILE, y: 12 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'y', range: 3 * TILE, speed: 1.0 } },
      { x: 22 * TILE, y: 8 * TILE, w: 4 * TILE, h: TILE },
    ],
    cones: [
      { x: 15 * TILE, y: onTop(20) },
      { x: 23 * TILE, y: onTop(8) },
    ],
    enemies: [{ x: 16 * TILE, y: 20 * TILE - 30, patrolMinX: 14 * TILE, patrolMaxX: 18 * TILE }],
  },
  {
    name: 'STAGE 8 - 최종 관문',
    hint: HINT,
    width: 26 * TILE,
    height: 30 * TILE,
    spawn: { x: 1 * TILE, y: 28 * TILE },
    goal: { x: 19 * TILE, y: 2 * TILE, w: TILE, h: TILE },
    platforms: [
      { x: 0, y: 29 * TILE, w: 5 * TILE, h: TILE },
      { x: 5 * TILE, y: 29 * TILE, w: 5 * TILE, h: TILE },
      { x: 5 * TILE, y: ceilingAbove(29), w: 5 * TILE, h: TUNNEL_THICKNESS },
      { x: 10 * TILE, y: 29 * TILE, w: 5 * TILE, h: TILE },
      { x: 16 * TILE, y: 26 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'x', range: 2.2 * TILE, speed: 1.2 } },
      { x: 17 * TILE, y: 24 * TILE, w: 5 * TILE, h: TILE },
      { x: 19 * TILE, y: 20 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'y', range: 3.5 * TILE, speed: 1.0 } },
      { x: 17 * TILE, y: 17 * TILE, w: 6 * TILE, h: TILE },
      { x: 19 * TILE, y: 13 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'y', range: 3 * TILE, speed: 1.1 } },
      { x: 17 * TILE, y: 9 * TILE, w: 6 * TILE, h: TILE },
      { x: 19 * TILE, y: 5 * TILE, w: 3 * TILE, h: TILE, moving: { axis: 'y', range: 2.5 * TILE, speed: 1.0 } },
      { x: 17 * TILE, y: 3 * TILE, w: 6 * TILE, h: TILE },
    ],
    cones: [
      { x: 12 * TILE, y: onTop(29) },
      { x: 19 * TILE, y: onTop(24) },
      { x: 19 * TILE, y: onTop(9) },
    ],
    enemies: [
      { x: 12 * TILE, y: 29 * TILE - 30, patrolMinX: 10 * TILE, patrolMaxX: 15 * TILE },
      { x: 19 * TILE, y: 17 * TILE - 30, patrolMinX: 17 * TILE, patrolMaxX: 23 * TILE },
    ],
  },
];
