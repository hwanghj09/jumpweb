import { drawPlayerSprite } from './renderer.js';
import { playerSheet } from './sprites.js';
import { JAB_DURATION } from './constants.js';

// Purely decorative loop for the title screen: two stickmen act out a
// sequence of short bouts (single jab, double jab, crouch stand-off,
// jump-taunt) below the menu buttons (y >= 460), then repeat. Each bout is
// visually distinct so the loop doesn't feel like the same clip on repeat.
const FEET_Y = 522;
const SCALE = 0.85;
const LEFT_HOME = 90;
const RIGHT_HOME = 870;
const FIXED_CAM = { x: 0, y: 0 };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function easeInOut(t) {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function jabTimerAt(elapsed) {
  return Math.max(0, JAB_DURATION - elapsed);
}

// Shared shape for "approach -> hold at clash (jab windows) -> retreat" bouts.
function standardPose(homeX, clashX, homeSide, t, timing) {
  const { approachEnd, jabWindows, retreatStart, retreatEnd } = timing;
  if (t < approachEnd) {
    return { x: lerp(homeX, clashX, easeInOut(t / approachEnd)), state: 'run', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
  }
  if (t < retreatStart) {
    const jw = jabWindows.find((w) => t >= w.start && t < w.end);
    if (jw) return { x: clashX, state: 'jab', facing: homeSide, jabTimer: jabTimerAt(t - jw.start), vy: 0, bob: 0 };
    return { x: clashX, state: 'idle', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
  }
  if (t < retreatEnd) {
    return { x: lerp(clashX, homeX, easeInOut((t - retreatStart) / (retreatEnd - retreatStart))), state: 'run', facing: -homeSide, jabTimer: 0, vy: 0, bob: 0 };
  }
  return { x: homeX, state: 'idle', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
}

// Bout 1 - quick single jab exchange.
const BOUT1_TOTAL = 3.4;
const BOUT1_TIMING = { approachEnd: 1.0, jabWindows: [{ start: 1.0, end: 1.0 + JAB_DURATION }], retreatStart: 1.5, retreatEnd: 2.6 };
function bout1(t) {
  return {
    left: standardPose(LEFT_HOME, 448, 1, t, BOUT1_TIMING),
    right: standardPose(RIGHT_HOME, 512, -1, t, BOUT1_TIMING),
  };
}

// Bout 2 - aggressive double jab, fighters stand closer together.
const BOUT2_TOTAL = 4.4;
const BOUT2_TIMING = {
  approachEnd: 0.9,
  jabWindows: [
    { start: 0.9, end: 0.9 + JAB_DURATION },
    { start: 1.3, end: 1.3 + JAB_DURATION },
  ],
  retreatStart: 1.9,
  retreatEnd: 3.1,
};
function bout2(t) {
  return {
    left: standardPose(LEFT_HOME, 460, 1, t, BOUT2_TIMING),
    right: standardPose(RIGHT_HOME, 500, -1, t, BOUT2_TIMING),
  };
}

// Bout 3 - both run in, stop for a crouched stand-off, then rush the last
// stretch into a jab and retreat.
const BOUT3_TOTAL = 4.2;
function bout3side(homeX, midX, clashX, homeSide, t) {
  if (t < 0.7) return { x: lerp(homeX, midX, easeInOut(t / 0.7)), state: 'run', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 1.6) return { x: midX, state: 'crouch', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 2.0) return { x: lerp(midX, clashX, easeInOut((t - 1.6) / 0.4)), state: 'run', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 2.0 + JAB_DURATION) return { x: clashX, state: 'jab', facing: homeSide, jabTimer: jabTimerAt(t - 2.0), vy: 0, bob: 0 };
  if (t < 2.5) return { x: clashX, state: 'idle', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 3.6) return { x: lerp(clashX, homeX, easeInOut((t - 2.5) / 1.1)), state: 'run', facing: -homeSide, jabTimer: 0, vy: 0, bob: 0 };
  return { x: homeX, state: 'idle', facing: homeSide, jabTimer: 0, vy: 0, bob: 0 };
}
function bout3(t) {
  return {
    left: bout3side(LEFT_HOME, 300, 448, 1, t),
    right: bout3side(RIGHT_HOME, 660, 512, -1, t),
  };
}

// Bout 4 - jab exchange, then the right fighter hops in place (taunt) while
// the left one just stands there before both retreat.
const BOUT4_TOTAL = 4.0;
function bout4left(t) {
  if (t < 0.9) return { x: lerp(LEFT_HOME, 448, easeInOut(t / 0.9)), state: 'run', facing: 1, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 0.9 + JAB_DURATION) return { x: 448, state: 'jab', facing: 1, jabTimer: jabTimerAt(t - 0.9), vy: 0, bob: 0 };
  if (t < 3.2) return { x: 448, state: 'idle', facing: 1, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 3.6) return { x: lerp(448, LEFT_HOME, easeInOut((t - 3.2) / 0.4)), state: 'run', facing: -1, jabTimer: 0, vy: 0, bob: 0 };
  return { x: LEFT_HOME, state: 'idle', facing: 1, jabTimer: 0, vy: 0, bob: 0 };
}
function bout4right(t) {
  if (t < 0.9) return { x: lerp(RIGHT_HOME, 512, easeInOut(t / 0.9)), state: 'run', facing: -1, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 0.9 + JAB_DURATION) return { x: 512, state: 'jab', facing: -1, jabTimer: jabTimerAt(t - 0.9), vy: 0, bob: 0 };
  if (t < 1.4) return { x: 512, state: 'idle', facing: -1, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 1.7) return { x: 512, state: 'jump', facing: -1, jabTimer: 0, vy: -120, bob: 10 * easeInOut((t - 1.4) / 0.3) };
  if (t < 2.0) return { x: 512, state: 'jump', facing: -1, jabTimer: 0, vy: 120, bob: 10 * (1 - easeInOut((t - 1.7) / 0.3)) };
  if (t < 3.2) return { x: 512, state: 'idle', facing: -1, jabTimer: 0, vy: 0, bob: 0 };
  if (t < 3.6) return { x: lerp(512, RIGHT_HOME, easeInOut((t - 3.2) / 0.4)), state: 'run', facing: 1, jabTimer: 0, vy: 0, bob: 0 };
  return { x: RIGHT_HOME, state: 'idle', facing: -1, jabTimer: 0, vy: 0, bob: 0 };
}
function bout4(t) {
  return { left: bout4left(t), right: bout4right(t) };
}

const BOUTS = [
  { total: BOUT1_TOTAL, pose: bout1 },
  { total: BOUT2_TOTAL, pose: bout2 },
  { total: BOUT3_TOTAL, pose: bout3 },
  { total: BOUT4_TOTAL, pose: bout4 },
];
const CYCLE = BOUTS.reduce((sum, b) => sum + b.total, 0);

function renderFighter(ctx, pose, w, h, invert) {
  const feetY = FEET_Y - (pose.bob || 0);
  const player = { x: pose.x - w / 2, y: feetY - h, w, h, facing: pose.facing, state: pose.state, jabTimer: pose.jabTimer, animTime: pose.animTime, vy: pose.vy };
  ctx.save();
  ctx.translate(pose.x, feetY);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-pose.x, -feetY);
  if (invert) ctx.filter = 'invert(1)';
  drawPlayerSprite(ctx, player, playerSheet, FIXED_CAM);
  ctx.restore();
}

export function drawTitleFight(ctx, time) {
  let local = time % CYCLE;
  let bout = BOUTS[0];
  for (const b of BOUTS) {
    if (local < b.total) {
      bout = b;
      break;
    }
    local -= b.total;
  }

  const { left, right } = bout.pose(local);
  left.animTime = time;
  right.animTime = time;

  renderFighter(ctx, left, 18, 30, false);
  renderFighter(ctx, right, 18, 30, true);
}
