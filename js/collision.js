export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveAxis(entity, platforms, axis) {
  for (const p of platforms) {
    if (!aabbOverlap(entity, p)) continue;
    if (axis === 'x') {
      // Resolve toward the side with the smaller penetration rather than by
      // entity.vx's sign — a moving platform carries the entity via a direct
      // position offset (ridingPlatform.dx in player.js/enemy.js), so vx can
      // be 0 (or read the wrong sign) even while the entity is overlapping
      // the platform, which left the old sign-check unable to resolve at all.
      const overlapFromLeft = entity.x + entity.w - p.x;
      const overlapFromRight = p.x + p.w - entity.x;
      if (overlapFromLeft < overlapFromRight) entity.x = p.x - entity.w;
      else entity.x = p.x + p.w;
      entity.vx = 0;
    } else {
      // Resolve toward the side with the smaller penetration rather than by
      // entity.vy's sign. A moving platform carries the entity via a direct
      // position offset (see ridingPlatform.dy in player.js), so vy can still
      // read as "falling" even while the entity is being pushed up into a
      // platform above — with the old vy-sign check that misread as landing
      // and snapped the entity on top of (through) the block, which is what
      // looked like a sideways teleport when the next frame's x-resolution
      // reacted to the now-wrong position.
      const overlapFromTop = entity.y + entity.h - p.y;
      const overlapFromBottom = p.y + p.h - entity.y;
      if (overlapFromTop < overlapFromBottom) {
        entity.y = p.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
        entity.ridingPlatform = p.moving ? p : null;
      } else {
        entity.y = p.y + p.h;
        entity.vy = 0;
      }
    }
  }
}

export function moveAndCollide(entity, platforms, dt) {
  entity.x += entity.vx * dt;
  resolveAxis(entity, platforms, 'x');

  entity.y += entity.vy * dt;
  entity.onGround = false;
  entity.ridingPlatform = null;
  resolveAxis(entity, platforms, 'y');
}

export function lineOfSightBlocked(x1, y1, x2, y2, platforms) {
  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const p of platforms) {
      if (px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h) return true;
    }
  }
  return false;
}
