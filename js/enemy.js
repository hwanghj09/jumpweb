import {
  GRAVITY,
  MAX_FALL_SPEED,
  ENEMY_W,
  ENEMY_H,
  ENEMY_PATROL_SPEED,
  ENEMY_CHASE_MULT,
  ENEMY_SIGHT_RANGE,
  ENEMY_SIGHT_HEIGHT,
  ENEMY_ALERT_TIME,
  ENEMY_LOSE_TIME,
  JUMP_VELOCITY,
  JAB_PUSH,
} from './constants.js';
import { moveAndCollide, lineOfSightBlocked } from './collision.js';

export class Enemy {
  constructor(def) {
    this.x = def.x;
    this.y = def.y;
    this.w = ENEMY_W;
    this.h = ENEMY_H;
    this.patrolMinX = def.patrolMinX;
    this.patrolMaxX = def.patrolMaxX;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = 1;
    this.state = 'patrol';
    this.alertTimer = 0;
    this.loseTimer = 0;
    this.stunTimer = 0;
    this.pushVX = 0;
    this.animTime = 0;
    this.ridingPlatform = null;
  }

  applyPush(dir) {
    this.pushVX = dir * JAB_PUSH;
    this.stunTimer = 0.35;
    this.state = 'patrol';
    this.loseTimer = 0;
  }

  canSeePlayer(player, platforms) {
    const ecx = this.x + this.w / 2;
    const ecy = this.y + this.h / 2;
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    const dx = pcx - ecx;
    const dy = pcy - ecy;
    if (Math.hypot(dx, dy) > ENEMY_SIGHT_RANGE) return false;
    if (Math.abs(dy) > ENEMY_SIGHT_HEIGHT) return false;
    if (this.state === 'patrol' && Math.sign(dx) !== 0 && Math.sign(dx) !== this.facing) return false;
    return !lineOfSightBlocked(ecx, ecy, pcx, pcy, platforms);
  }

  update(dt, player, platforms) {
    this.animTime += dt;

    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.vx = this.pushVX;
      this.pushVX *= 0.9;
    } else {
      const canSee = this.canSeePlayer(player, platforms);
      if (this.state === 'patrol') {
        this.vx = ENEMY_PATROL_SPEED * this.facing;
        if (this.x <= this.patrolMinX) this.facing = 1;
        else if (this.x + this.w >= this.patrolMaxX) this.facing = -1;
        if (canSee) {
          this.state = 'alert';
          this.alertTimer = ENEMY_ALERT_TIME;
          this.vx = 0;
        }
      } else if (this.state === 'alert') {
        this.vx = 0;
        this.alertTimer -= dt;
        if (this.alertTimer <= 0) this.state = 'chase';
      } else if (this.state === 'chase') {
        const dir = player.x + player.w / 2 > this.x + this.w / 2 ? 1 : -1;
        this.facing = dir;
        this.vx = dir * ENEMY_PATROL_SPEED * ENEMY_CHASE_MULT;
        if (canSee) this.loseTimer = ENEMY_LOSE_TIME;
        else this.loseTimer -= dt;
        if (player.y + player.h < this.y - 10 && this.onGround) this.vy = -JUMP_VELOCITY * 0.85;
        if (this.loseTimer <= 0) this.state = 'patrol';
      }
    }

    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
    moveAndCollide(this, platforms, dt);
  }
}
