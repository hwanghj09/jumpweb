import {
  CANVAS_W,
  CANVAS_H,
  PVP_ARENA_COUNT,
  PVP_RINGOUT_MARGIN,
  PVP_STATE_HZ,
  PVP_ROUND_END_DELAY,
  PVP_COUNTDOWN,
} from './constants.js';
import { Player } from './player.js';
import { Platform } from './world.js';
import { aabbOverlap } from './collision.js';
import { drawPlatform, drawPlayerSprite, drawButton } from './renderer.js';
import { drawBackground } from './background.js';
import { playerSheet } from './sprites.js';
import { music } from './audio.js';
import { Net } from './net.js';
import { PVP_ARENAS } from './pvpMaps.js';

const FIXED_CAM = { x: 0, y: 0 };
const HINT = '방향키/A,D 이동 · Space 점프 · Shift 달리기 · X 잽(상대를 밀쳐냄) · ESC 나가기';

export class PvpMatch {
  constructor() {
    this.net = new Net();
    this.phase = 'CONNECTING'; // CONNECTING | QUEUE | COUNTDOWN | ROUND | ROUND_END_WAIT | ROUND_END | MATCH_END | ERROR
    this.side = null;
    this.mapIndex = 0;
    this.pendingNextMap = 0;
    this.platforms = [];
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
      this.net.joinQueue();
      this.phase = 'QUEUE';
    } catch {
      this.phase = 'ERROR';
      this.errorMsg = '서버에 연결할 수 없습니다.';
    }
  }

  _startRound(mapIndex) {
    this.mapIndex = mapIndex;
    const arena = PVP_ARENAS[mapIndex % PVP_ARENA_COUNT];
    this.platforms = arena.platforms.map((p) => new Platform(p));
    const mySpawn = this.side === 'p1' ? arena.spawnP1 : arena.spawnP2;
    const oppSpawn = this.side === 'p1' ? arena.spawnP2 : arena.spawnP1;
    this.myPlayer = new Player(mySpawn.x, mySpawn.y);
    this.oppPlayer = new Player(oppSpawn.x, oppSpawn.y);
    this.myPlayer.invuln = 0;
    this.oppPlayer.invuln = 0;
    this.jabHitApplied = false;
    this.stateSendAcc = 0;
    this.time = 0;
    this.countdown = PVP_COUNTDOWN;
    this.phase = 'COUNTDOWN';
  }

  _isRingedOut(p) {
    return (
      p.x + p.w < -PVP_RINGOUT_MARGIN ||
      p.x > CANVAS_W + PVP_RINGOUT_MARGIN ||
      p.y > CANVAS_H + PVP_RINGOUT_MARGIN
    );
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
        this.myPlayer.update(dt, input, this.platforms, [], []);
        if (this.myPlayer.justJumped) music.playJumpSfx();
        if (this.myPlayer.justJabbed) {
          this.jabHitApplied = false;
          music.playJabSfx();
        }
        if (this.myPlayer.jabTimer > 0 && !this.jabHitApplied) {
          const hb = this.myPlayer.getJabHitbox();
          if (aabbOverlap(hb, this.oppPlayer)) {
            this.jabHitApplied = true;
            this.net.sendHit(this.myPlayer.facing);
          }
        }
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

        if (this._isRingedOut(this.myPlayer)) {
          music.playDeathSfx();
          this.net.sendRingout();
          this.phase = 'ROUND_END_WAIT';
        }
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
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);

    if (this.platforms.length && this.myPlayer && this.oppPlayer) {
      for (const p of this.platforms) drawPlatform(ctx, p, FIXED_CAM);

      ctx.save();
      ctx.filter = 'invert(1)';
      drawPlayerSprite(ctx, this.oppPlayer, playerSheet, FIXED_CAM);
      ctx.restore();
      this._drawTag(ctx, this.oppPlayer, 'OPP', '#e05a4e');

      drawPlayerSprite(ctx, this.myPlayer, playerSheet, FIXED_CAM);
      this._drawTag(ctx, this.myPlayer, 'YOU', '#2b6cb0');

      this._drawScoreHUD(ctx);
    }

    if (this.phase === 'CONNECTING') this._drawCenterMessage(ctx, '서버에 연결 중...');
    else if (this.phase === 'QUEUE') this._drawQueue(ctx);
    else if (this.phase === 'COUNTDOWN') this._drawCountdown(ctx);
    else if (this.phase === 'ROUND_END' || this.phase === 'ROUND_END_WAIT') this._drawRoundEnd(ctx);
    else if (this.phase === 'MATCH_END') this._drawMatchEnd(ctx);
    else if (this.phase === 'ERROR') this._drawError(ctx);
  }

  _drawTag(ctx, p, label, color) {
    const x = p.x - FIXED_CAM.x + p.w / 2;
    const y = p.y - FIXED_CAM.y - 14;
    ctx.fillStyle = color;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y);
  }

  _drawScoreHUD(ctx) {
    const myWins = this.side === 'p1' ? this.score.p1 : this.score.p2;
    const oppWins = this.side === 'p1' ? this.score.p2 : this.score.p1;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CANVAS_W, 28);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`YOU ${myWins} : ${oppWins} OPP`, CANVAS_W / 2, 14);
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(HINT, 10, 14);
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
    ctx.fillText(n > 0 ? String(n) : 'FIGHT!', CANVAS_W / 2, CANVAS_H / 2);
  }

  _drawRoundEnd(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = this.roundLoser === this.side ? '#e05a4e' : '#3ecf5b';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = this.phase === 'ROUND_END_WAIT' ? '판정 중...' : this.roundLoser === this.side ? 'ROUND LOSE' : 'ROUND WIN';
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
    ctx.fillText(iWon ? 'YOU WIN THE MATCH' : 'YOU LOSE THE MATCH', CANVAS_W / 2, CANVAS_H / 2 - 90);
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
      this.net.joinQueue();
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
