// WebSocket client for PvP matchmaking + relay.
// Protocol (JSON messages), matches server/server.js:
//   C->S queue_join {}
//   C->S queue_leave {}
//   C->S state {x,y,vx,vy,facing,anim}      (sent ~PVP_STATE_HZ times/sec while in a match)
//   C->S hit {dir}                          (my jab landed on opponent, dir is my facing)
//   C->S ringout {}                         (I fell out of the arena)
//   C->S ready {}                           (loaded the round's arena, ready for next round)
//   S->C queued {}
//   S->C match_found {side, mapIndex}       (side: 'p1' | 'p2')
//   S->C state {x,y,vx,vy,facing,anim}      (opponent's state, relayed)
//   S->C hit {dir}                          (opponent's jab landed on me, relayed)
//   S->C round_result {loser, score, matchOver, nextMapIndex}
//   S->C opponent_left {}
//   S->C error {message}

import { resolveWsUrl } from './serverConfig.js';

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.status = 'idle'; // idle | connecting | open | closed | error
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.status = 'connecting';
      const url = resolveWsUrl();
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        this.status = 'error';
        reject(err);
        return;
      }
      this.ws = ws;
      ws.addEventListener('open', () => {
        this.status = 'open';
        resolve();
      });
      ws.addEventListener('message', (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        const fn = this.handlers[msg.type];
        if (fn) fn(msg);
      });
      ws.addEventListener('close', () => {
        this.status = 'closed';
        const fn = this.handlers.disconnected;
        if (fn) fn();
      });
      ws.addEventListener('error', (err) => {
        this.status = 'error';
        reject(err);
      });
    });
  }

  send(type, data = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, ...data }));
  }

  joinQueue() {
    this.send('queue_join');
  }

  leaveQueue() {
    this.send('queue_leave');
  }

  sendState(state) {
    this.send('state', state);
  }

  sendHit(dir) {
    this.send('hit', { dir });
  }

  sendRingout() {
    this.send('ringout');
  }

  sendReady() {
    this.send('ready');
  }

  close() {
    if (this.ws) this.ws.close();
    this.ws = null;
    this.status = 'idle';
  }
}
