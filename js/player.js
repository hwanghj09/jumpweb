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
  PLAYER_CROUCH_H,
  CROUCH_SPEED,
  RESPAWN_INVULN,
  WATER_GRAVITY_MULT,
  WATER_MAX_FALL_MULT,
  WATER_SPEED,
  SWIM_IMPULSE,
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
    this.crouching = false;
    this.inWater = false;
    this.justJumped = false;
    this.justJabbed = false;
    this.justEnteredWater = false;
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

  update(dt, input, platforms, enemies, water = []) {
    this.justJumped = false;
    this.justJabbed = false;
    this.justEnteredWater = false;
    if (this.invuln > 0) this.invuln -= dt;

    const wasInWater = this.inWater;
    this.inWater = water.some((w) => aabbOverlap(this, w));
    if (this.inWater && !wasInWater) this.justEnteredWater = true;
    if (this.inWater) this.crouching = false;

    if (!this.inWater) {
      const wantsCrouch = input.isDown('ControlLeft') || input.isDown('ControlRight');
      let shouldCrouch = wantsCrouch && this.onGround;
      if (this.crouching && !shouldCrouch) {
        const standBox = { x: this.x, y: this.y + this.h - PLAYER_H, w: this.w, h: PLAYER_H };
        if (platforms.some((p) => aabbOverlap(standBox, p))) shouldCrouch = true;
      }
      if (shouldCrouch !== this.crouching) {
        const newH = shouldCrouch ? PLAYER_CROUCH_H : PLAYER_H;
        this.y += this.h - newH;
        this.h = newH;
        this.crouching = shouldCrouch;
      }
    }

    let dir = 0;
    if (input.isDown('ArrowLeft') || input.isDown('KeyA')) dir -= 1;
    if (input.isDown('ArrowRight') || input.isDown('KeyD')) dir += 1;
    this.running = !this.crouching && !this.inWater && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    const maxSpeed = this.inWater ? WATER_SPEED : this.crouching ? CROUCH_SPEED : this.running ? RUN_SPEED : WALK_SPEED;
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

    if (input.pressed('Space')) {
      if (this.inWater) {
        this.vy = -SWIM_IMPULSE;
        this.onGround = false;
        this.justJumped = true;
      } else if (this.onGround && !this.crouching) {
        this.vy = -JUMP_VELOCITY;
        this.onGround = false;
        this.justJumped = true;
      }
    }

    if (input.pressed('KeyX') && this.jabTimer <= 0) {
      this.jabTimer = JAB_DURATION;
      this.justJabbed = true;
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

    const gravity = this.inWater ? GRAVITY * WATER_GRAVITY_MULT : GRAVITY;
    const maxFall = this.inWater ? MAX_FALL_SPEED * WATER_MAX_FALL_MULT : MAX_FALL_SPEED;
    this.vy += gravity * dt;
    if (this.vy > maxFall) this.vy = maxFall;

    if (this.ridingPlatform) {
      this.x += this.ridingPlatform.dx;
      this.y += this.ridingPlatform.dy;
    }

    moveAndCollide(this, platforms, dt);

    if (this.inWater) this.state = 'jump';
    else if (!this.onGround) this.state = 'jump';
    else if (this.jabTimer > 0) this.state = 'jab';
    else if (this.crouching) this.state = 'crouch';
    else if (Math.abs(this.vx) > 5) this.state = this.running ? 'run' : 'walk';
    else this.state = 'idle';
    this.animTime += dt;
  }
}
