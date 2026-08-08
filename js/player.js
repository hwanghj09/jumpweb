import {
  WALK_SPEED,
  RUN_SPEED,
  ACCEL_GROUND,
  ACCEL_AIR,
  FRICTION,
  GRAVITY,
  MAX_FALL_SPEED,
  JUMP_VELOCITY,
  JAB_DURATION,
  JAB_RANGE,
  PLAYER_W,
  PLAYER_H,
  RESPAWN_INVULN,
} from './constants.js';
import { moveAndCollide, aabbOverlap } from './collision.js';

export class Player {
  constructor(x, y) {
    this.spawnX = x;
    this.spawnY = y;
    this.reset();
  }

  reset() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.w = PLAYER_W;
    this.h = PLAYER_H;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = 1;
    this.state = 'idle';
    this.jabTimer = 0;
    this.invuln = RESPAWN_INVULN;
    this.ridingPlatform = null;
    this.animTime = 0;
    this.running = false;
  }

  respawn() {
    this.reset();
  }

  getJabHitbox() {
    const hh = this.h - 12;
    return this.facing >= 0
      ? { x: this.x + this.w, y: this.y + 6, w: JAB_RANGE, h: hh }
      : { x: this.x - JAB_RANGE, y: this.y + 6, w: JAB_RANGE, h: hh };
  }

  update(dt, input, platforms, enemies) {
    if (this.invuln > 0) this.invuln -= dt;

    let dir = 0;
    if (input.isDown('ArrowLeft') || input.isDown('KeyA')) dir -= 1;
    if (input.isDown('ArrowRight') || input.isDown('KeyD')) dir += 1;
    this.running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const maxSpeed = this.running ? RUN_SPEED : WALK_SPEED;
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;

    if (dir !== 0) {
      this.facing = dir;
      this.vx += dir * accel * dt;
      this.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.vx));
    } else if (this.onGround) {
      const fric = FRICTION * dt;
      if (Math.abs(this.vx) <= fric) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * fric;
    }

    if (input.pressed('Space') && this.onGround) {
      this.vy = -JUMP_VELOCITY;
      this.onGround = false;
    }

    if (input.pressed('KeyX') && this.jabTimer <= 0) {
      this.jabTimer = JAB_DURATION;
    }
    if (this.jabTimer > 0) {
      this.jabTimer -= dt;
      const hb = this.getJabHitbox();
      for (const e of enemies) {
        if (e.stunTimer <= 0 && aabbOverlap(hb, e)) {
          e.applyPush(this.facing);
        }
      }
    }

    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

    if (this.ridingPlatform) {
      this.x += this.ridingPlatform.dx;
      this.y += this.ridingPlatform.dy;
    }

    moveAndCollide(this, platforms, dt);

    if (!this.onGround) this.state = 'jump';
    else if (this.jabTimer > 0) this.state = 'jab';
    else if (Math.abs(this.vx) > 5) this.state = this.running ? 'run' : 'walk';
    else this.state = 'idle';
    this.animTime += dt;
  }
}
