import {
  CANVAS_W,
  CANVAS_H,
  FALL_DEATH_MARGIN,
  PVP_STATE_HZ,
  PVP_ROUND_END_DELAY,
  PVP_COUNTDOWN,
} from './constants.js';
import { Camera } from './camera.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Platform, Cone, Water } from './world.js';
import { STAGES } from './levels.js';
import { aabbOverlap } from './collision.js';
import {
  drawPlatform,
  drawCone,
  drawWater,
  drawGoal,
  drawPlayerSprite,
  drawEnemySprite,
  drawButton,
} from './renderer.js';
import { playerSheet, enemySheet } from './sprites.js';
import { spawnBurst, updateParticles, drawParticles } from './particles.js';
import { music } from './audio.js';
import { drawBackground } from './background.js';
import { Net } from './net.js';

// Online 1:1 race through one of the official jump-map stages (js/levels.js).
// Unlike PvpMatch (js/pvpGame.js) the map scrolls - each client keeps its own
// scrolling camera and simulates its own hazards/enemies locally; the
// opponent is only ever a relayed ghost, never physically interactive.
// Winning a heat means reaching the goal first, not pushing the other player
// out - so this uses 'finish' instead of 'ringout' (see js/net.js).
export class JumpRaceMatch {
  constructor() {
    this.net = new Net();
    this.camera = new Camera();
    this.phase = 'CONNECTING'; // CONNECTING | QUEUE | COUNTDOWN | ROUND | ROUND_END_WAIT | ROUND_END | MATCH_END | ERROR
    this.side = null;
    this.mapIndex = 0;
    this.pendingNextMap = 0;
    this.platforms = [];
    this.cones = [];
    this.enemies = [];
    this.water = [];
    this.goal = null;
    this.levelW = 0;
    this.levelH = 0;
    this.particles = [];
    this.myPlayer = null;
    this.oppPlayer = null;
    this.score = { p1: 0, p2: 0 };
    this.time = 0;
    this.countdown = 0;
    this.roundEndTimer = 0;
    this.roundLoser = null;
    this.matchOver = false;
    this.forfeited = false;
    this.errorMsg = '';
    this.stateSendAcc = 0;
    this.jabHitApplied = false;
    this.exitRequested = false;
    this.mouse = { x: -1, y: -1 };
    this.buttons = [];
    this._bindNet();
    this._begin();
  }

  _bindNet() {
    this.net.on('queued', () => {
      this.phase = 'QUEUE';
    });
    this.net.on('match_found', (msg) => {
      this.side = msg.side;
      this.score = { p1: 0, p2: 0 };
      this.matchOver = false;
      this.forfeited = false;
      this._startRound(msg.mapIndex);
    });
    this.net.on('state', (msg) => {
      if (!this.oppPlayer) return;
      this.oppPlayer.x = msg.x;
      this.oppPlayer.y = msg.y;
      this.oppPlayer.vx = msg.vx;
      this.oppPlayer.vy = msg.vy;
      this.oppPlayer.facing = msg.facing;
      this.oppPlayer.state = msg.state;
      this.oppPlayer.jabTimer = msg.jabTimer;
    });
    this.net.on('hit', (msg) => {
      if (this.myPlayer && this.phase === 'ROUND') {
        this.myPlayer.applyKnockback(msg.dir);
        music.playJabSfx();
      }
    });
    this.net.on('round_result', (msg) => {
      this.score = msg.score;
      this.roundLoser = msg.loser;
      this.matchOver = msg.matchOver;
      this.pendingNextMap = msg.nextMapIndex;
      this.phase = 'ROUND_END';
      this.roundEndTimer = PVP_ROUND_END_DELAY;
      if (this.roundLoser === this.side) music.playDeathSfx();
      else music.playClearSfx();
    });
    this.net.on('opponent_left', () => {
      this.forfeited = true;
      this.matchOver = true;
      this.phase = 'MATCH_END';
    });
    this.net.on('error', (msg) => {
      this.phase = 'ERROR';
      this.errorMsg = msg.message || '알 수 없는 오류가 발생했습니다.';
    });
    this.net.on('disconnected', () => {
      if (this.phase !== 'MATCH_END' && this.phase !== 'ERROR') {
        this.phase = 'ERROR';
        this.errorMsg = '서버와 연결이 끊어졌습니다.';
      }
    });
  }

  async _begin() {
    try {
      await this.net.connect();
      this.net.joinQueue('jumprace');
      this.phase = 'QUEUE';
    } catch {
      this.phase = 'ERROR';
      this.errorMsg = '서버에 연결할 수 없습니다.';
    }
  }

  _startRound(mapIndex) {
    this.mapIndex = mapIndex;
    const def = STAGES[mapIndex % STAGES.length];
    this.platforms = def.platforms.map((p) => new Platform(p));
    this.cones = def.cones.map((c) => new Cone(c));
    this.enemies = def.enemies.map((e) => new Enemy(e));
    this.water = (def.water || []).map((w) => new Water(w));
    this.goal = def.goal;
    this.levelW = def.width;
    this.levelH = def.height;
    this.myPlayer = new Player(def.spawn.x, def.spawn.y);
    this.oppPlayer = new Player(def.spawn.x, def.spawn.y);
    this.myPlayer.invuln = 0;
    this.oppPlayer.invuln = 0;
    this.camera.snap(this.myPlayer, this.levelW, this.levelH);
    this.particles = [];
    this.stateSendAcc = 0;
    this.jabHitApplied = false;
    this.time = 0;
    this.countdown = PVP_COUNTDOWN;
    this.phase = 'COUNTDOWN';
  }

  _respawnMyPlayer() {
    const cx = this.myPlayer.x + this.myPlayer.w / 2;
    const cy = this.myPlayer.y + this.myPlayer.h / 2;
    spawnBurst(this.particles, cx, cy);
    music.playDeathSfx();
    this.myPlayer.respawn();
    this.camera.snap(this.myPlayer, this.levelW, this.levelH);
  }

  setMouse(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  addButton(ctx, x, y, w, h, label, action, disabled = false) {
    const hover =
      !disabled &&
      this.mouse.x >= x &&
      this.mouse.x <= x + w &&
      this.mouse.y >= y &&
      this.mouse.y <= y + h;
    drawButton(ctx, { x, y, w, h, label }, hover, disabled);
    this.buttons.push({ x, y, w, h, action, disabled });
  }

  update(dt, input) {
    if (
      input.pressed('Escape') &&
      this.phase !== 'MATCH_END' &&
      this.phase !== 'ERROR' &&
      this.phase !== 'CONNECTING'
    ) {
      this.exitRequested = true;
      return;
    }

    switch (this.phase) {
      case 'COUNTDOWN':
        this.countdown -= dt;
        if (this.countdown <= 0) this.phase = 'ROUND';
        break;

      case 'ROUND': {
        this.time += dt;
        for (const p of this.platforms) p.update(dt, this.time);
        this.myPlayer.update(dt, input, this.platforms, this.enemies, this.water);
        if (this.myPlayer.justJumped) music.playJumpSfx();
        if (this.myPlayer.justJabbed) {
          this.jabHitApplied = false;
          music.playJabSfx();
        }
        if (this.myPlayer.justEnteredWater) music.playSplashSfx();
        if (this.myPlayer.jabTimer > 0 && !this.jabHitApplied) {
          const hb = this.myPlayer.getJabHitbox();
          if (aabbOverlap(hb, this.oppPlayer)) {
            this.jabHitApplied = true;
            this.net.sendHit(this.myPlayer.facing);
          }
        }
        for (const e of this.enemies) e.update(dt, this.myPlayer, this.platforms);
        updateParticles(this.particles, dt);
        this.oppPlayer.animTime += dt;

        this.stateSendAcc += dt;
        if (this.stateSendAcc >= 1 / PVP_STATE_HZ) {
          this.stateSendAcc = 0;
          this.net.sendState({
            x: this.myPlayer.x,
            y: this.myPlayer.y,
            vx: this.myPlayer.vx,
            vy: this.myPlayer.vy,
            facing: this.myPlayer.facing,
            state: this.myPlayer.state,
            jabTimer: this.myPlayer.jabTimer,
          });
        }

        if (this.myPlayer.invuln <= 0) {
          let died = this.cones.some((c) => aabbOverlap(this.myPlayer, c));
          if (!died) died = this.enemies.some((e) => e.stunTimer <= 0 && aabbOverlap(this.myPlayer, e));
          if (!died) died = this.myPlayer.y > this.levelH + FALL_DEATH_MARGIN;
          if (died) {
            this._respawnMyPlayer();
            break;
          }
        }

        if (aabbOverlap(this.myPlayer, this.goal)) {
          this.net.sendFinish();
          this.phase = 'ROUND_END_WAIT';
          break;
        }

        this.camera.follow(this.myPlayer, this.levelW, this.levelH, dt);
        break;
      }

      case 'ROUND_END_WAIT':
        break;

      case 'ROUND_END':
        this.roundEndTimer -= dt;
        if (this.roundEndTimer <= 0) {
          if (this.matchOver) this.phase = 'MATCH_END';
          else this._startRound(this.pendingNextMap);
        }
        break;

      default:
        break;
    }
  }

  destroy() {
    this.net.close();
  }

  draw(ctx) {
    this.buttons = [];
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time, this.camera.x);

    if (this.platforms.length && this.myPlayer && this.oppPlayer) {
      for (const p of this.platforms) drawPlatform(ctx, p, this.camera);
      for (const c of this.cones) drawCone(ctx, c, this.camera);
      for (const w of this.water) drawWater(ctx, w, this.camera);
      drawGoal(ctx, this.goal, this.camera);
      for (const e of this.enemies) drawEnemySprite(ctx, e, enemySheet, this.camera);

      ctx.save();
      ctx.filter = 'invert(1)';
      drawPlayerSprite(ctx, this.oppPlayer, playerSheet, this.camera);
      ctx.restore();
      this._drawTag(ctx, this.oppPlayer, '상대', '#e05a4e');

      drawPlayerSprite(ctx, this.myPlayer, playerSheet, this.camera);
      this._drawTag(ctx, this.myPlayer, '나', '#2b6cb0');

      drawParticles(ctx, this.particles, this.camera);
      this._drawHUD(ctx);
    }

    if (this.phase === 'CONNECTING') this._drawCenterMessage(ctx, '서버에 연결 중...');
    else if (this.phase === 'QUEUE') this._drawQueue(ctx);
    else if (this.phase === 'COUNTDOWN') this._drawCountdown(ctx);
    else if (this.phase === 'ROUND_END' || this.phase === 'ROUND_END_WAIT') this._drawRoundEnd(ctx);
    else if (this.phase === 'MATCH_END') this._drawMatchEnd(ctx);
    else if (this.phase === 'ERROR') this._drawError(ctx);
  }

  _drawTag(ctx, p, label, color) {
    const x = p.x - this.camera.x + p.w / 2;
    const y = p.y - this.camera.y - 14;
    ctx.fillStyle = color;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y);
  }

  _drawHUD(ctx) {
    const myWins = this.side === 'p1' ? this.score.p1 : this.score.p2;
    const oppWins = this.side === 'p1' ? this.score.p2 : this.score.p1;
    const def = STAGES[this.mapIndex % STAGES.length];
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CANVAS_W, 28);
    ctx.fillStyle = '#fff';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.hint, 10, 14);
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`나 ${myWins} : ${oppWins} 상대`, CANVAS_W / 2, 14);
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(def.name, CANVAS_W - 44, 14);
    ctx.textAlign = 'left';
  }

  _drawCenterMessage(ctx, text) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);
  }

  _drawQueue(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dots = '.'.repeat(1 + Math.floor(this.time * 2) % 3);
    ctx.fillText(`상대를 찾는 중${dots}`, CANVAS_W / 2, CANVAS_H / 2 - 30);
    this.time += 1 / 30;
    this.addButton(ctx, CANVAS_W / 2 - 90, CANVAS_H / 2 + 10, 180, 44, '취소', () => {
      this.net.leaveQueue();
      this.exitRequested = true;
    });
  }

  _drawCountdown(ctx) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = Math.ceil(this.countdown);
    ctx.fillText(n > 0 ? String(n) : '출발!', CANVAS_W / 2, CANVAS_H / 2);
  }

  _drawRoundEnd(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = this.roundLoser === this.side ? '#e05a4e' : '#3ecf5b';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = this.phase === 'ROUND_END_WAIT' ? '판정 중...' : this.roundLoser === this.side ? '2등 도착...' : '1등 도착!';
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);
  }

  _drawMatchEnd(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const myWins = this.side === 'p1' ? this.score.p1 : this.score.p2;
    const oppWins = this.side === 'p1' ? this.score.p2 : this.score.p1;
    const iWon = this.forfeited || myWins > oppWins;
    ctx.fillStyle = iWon ? '#3ecf5b' : '#e05a4e';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(iWon ? '경기 승리!' : '경기 패배...', CANVAS_W / 2, CANVAS_H / 2 - 90);
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.fillText(
      this.forfeited ? '상대방이 나갔습니다' : `최종 스코어 ${myWins} : ${oppWins}`,
      CANVAS_W / 2,
      CANVAS_H / 2 - 50
    );
    this.addButton(ctx, CANVAS_W / 2 - 230, CANVAS_H / 2, 200, 46, '다시하기', () => {
      this.score = { p1: 0, p2: 0 };
      this.matchOver = false;
      this.forfeited = false;
      this.platforms = [];
      this.myPlayer = null;
      this.oppPlayer = null;
      this.net.joinQueue('jumprace');
      this.phase = 'QUEUE';
    });
    this.addButton(ctx, CANVAS_W / 2 + 30, CANVAS_H / 2, 200, 46, '메인 메뉴', () => {
      this.exitRequested = true;
    });
  }

  _drawError(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#e05a4e';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.errorMsg, CANVAS_W / 2, CANVAS_H / 2 - 30);
    this.addButton(ctx, CANVAS_W / 2 - 90, CANVAS_H / 2 + 10, 180, 44, '메인 메뉴', () => {
      this.exitRequested = true;
    });
  }
}
