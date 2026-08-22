# 버그 분석 리포트 — jumpweb

작성일: 2026-08-22
범위: 물리/충돌 엔진(`js/collision.js`, `js/player.js`, `js/enemy.js`), PvP/점프레이스 서버(`server/server.js`)

수정 현황: 확정 버그 1~3 모두 수정 완료(`node --check`로 구문 검증). 부록 항목은 의도된 설계인지 확인이 필요해 미수정.

---

## 버그 1. x축 충돌 해소가 `vx === 0`일 때 동작하지 않음 — ✅ 수정 완료

### 요약
정지 상태(`vx === 0`)인 엔티티가 수평 이동 발판에 겹쳐도 `resolveAxis`의 x축 분기가 전혀 실행되지 않아 위치 보정이 일어나지 않는다.

### 심각도
**High** — 물리 엔진의 핵심 충돌 해소 로직이 흔한 상태(정지)에서 무력화됨. `78267e8`에서 y축은 같은 종류의 문제를 침투량 비교 방식으로 고쳤지만 x축에는 적용되지 않았다.

### 재현 절차
1. 플레이어가 이동키를 놓아 마찰로 `vx = 0`이 된 상태로 정지(`js/player.js:119-123`).
2. 그 옆에서 x축으로 이동하는 발판(`moving:{axis:'x'}`, 예: `js/levels.js`의 8스테이지 발판)이 다가와 플레이어와 겹친다.
3. `resolveAxis('x')`가 호출되지만 `entity.vx > 0`, `entity.vx < 0` 두 조건 모두 거짓이라 `entity.x`가 전혀 보정되지 않는다.

### 기대 동작 vs 실제 동작
- 기대: 발판과 겹치면 침투량이 작은 쪽으로 밀려나야 한다(y축과 동일).
- 실제: `vx === 0`이면 겹친 채로 그대로 유지되어, 발판이 플레이어를 파묻거나 그냥 통과한다.

### 근본 원인
```js
// js/collision.js:8-11
if (axis === 'x') {
  if (entity.vx > 0) entity.x = p.x - entity.w;
  else if (entity.vx < 0) entity.x = p.x + p.w;
  entity.vx = 0;
}
```
`entity.vx`의 부호로만 밀어낼 방향을 판단하는데, 이동 발판은 속도가 아니라 직접 좌표 오프셋(`ridingPlatform.dx`)으로 캐리되므로 `vx`가 실제 겹침 방향과 무관할 수 있다. `vx === 0`이면 두 분기 모두 스킵된다. y축(12-31행)은 이미 `overlapFromTop`/`overlapFromBottom` 비교 방식으로 고쳐져 있어 동일한 클래스의 버그가 x축에만 남아있는 상태로 확인됨(코드 직접 확인).

### 영향 범위
싱글/멀티 플레이 공통. 수평 이동 발판이 있는 모든 스테이지 및 커스텀 맵에서 플레이어·적 모두에게 발생 가능.

### 제안 해결 방안
y축과 동일하게 침투량 비교로 변경:
```js
if (axis === 'x') {
  const overlapFromLeft = entity.x + entity.w - p.x;
  const overlapFromRight = p.x + p.w - entity.x;
  if (overlapFromLeft < overlapFromRight) entity.x = p.x - entity.w;
  else entity.x = p.x + p.w;
  entity.vx = 0;
}
```

### 참고
`js/collision.js:5-16`

---

## 버그 2. 적(Enemy)이 이동 발판의 이동량을 전달받지 못함 — ✅ 수정 완료

### 요약
`Player`는 `update()`에서 `ridingPlatform.dx/dy`를 자신의 좌표에 더해 발판과 함께 이동하지만, `Enemy`는 동일 처리가 없어 이동 발판 위에서 캐리되지 않는다.

### 심각도
**Medium** — 정식 스테이지(`js/levels.js`)의 적은 모두 고정 발판 위에 배치돼 있어 표면적으로는 드러나지 않지만, 에디터(`js/editor.js`)로 적을 이동 발판 위에 배치하면 바로 재현되는 엔진 차원의 기능 누락.

### 재현 절차
1. 커스텀 맵 에디터에서 x축 또는 y축 이동 발판 위에 적을 배치한다.
2. 발판이 이동하면 적은 자신의 순찰 속도(`ENEMY_PATROL_SPEED`)로만 움직이고 발판의 이동은 반영되지 않는다.
3. 수평 발판의 경우, 발판이 빠져나가면 다음 프레임에 AABB가 겹치지 않아 중력만 적용되어 적이 허공에서 떨어진다.

### 기대 동작 vs 실제 동작
- 기대: 적도 플레이어처럼 발판에 얹혀 함께 이동해야 한다.
- 실제: `Enemy.update()`에 `ridingPlatform.dx/dy` 반영 코드가 없어 발판과 분리되어 움직인다.

### 근본 원인
`js/collision.js`의 `resolveAxis`는 플레이어·적 구분 없이 착지 시 `entity.ridingPlatform = p.moving ? p : null`을 설정하지만(27행), 그 값을 실제로 좌표에 반영하는 코드는 `js/player.js:157-160`에만 있고 `js/enemy.js`의 `update()`(58-94행)에는 대응 코드가 없다(코드 직접 확인, 대칭성 결여).

### 영향 범위
커스텀 맵 제작 시 이동 발판 위에 적을 배치하는 경우. 현재 배포된 14개 정식 스테이지에는 해당 배치가 없어 즉시 체감되지는 않음.

### 제안 해결 방안
`js/enemy.js`의 `update()` 도입부(중력 적용 및 `moveAndCollide` 호출 전)에 다음을 추가:
```js
if (this.ridingPlatform) {
  this.x += this.ridingPlatform.dx;
  this.y += this.ridingPlatform.dy;
}
```

### 참고
`js/enemy.js:58-94` vs `js/player.js:157-162`

---

## 버그 3. 점프레이스/PvP 라운드가 이중 채점될 수 있는 레이스 컨디션 — ✅ 수정 완료

### 요약
`finishRound`는 매치 전체 종료 여부(`room.over`)만 가드하고, "이번 라운드가 이미 판정됨"을 막는 플래그가 없어 두 플레이어의 종료 메시지가 근접한 타이밍에 도착하면 한 라운드가 두 번 채점된다.

### 심각도
**High** — 점수 무결성이 깨지는 레이스 컨디션이며, 특히 점프레이스는 실력이 비슷한 두 플레이어의 동시 도착이 예외적 상황이 아니라 자연스럽게 발생하는 흔한 케이스.

### 재현 절차
1. 점프레이스에서 두 플레이어가 거의 동시에 골에 도달한다(`js/jumpRaceGame.js:246-249`, 도달 즉시 `net.sendFinish()` 전송 후 `phase = 'ROUND_END_WAIT'`).
2. 서버가 플레이어 A의 `finish`를 먼저 처리 → `finishRound(room, 'p1')` 실행. `matchOver`가 아직 false면 `room`은 `rooms`에서 삭제되지 않고 `room.over`도 계속 false로 남는다(`server/server.js:101-112`).
3. 플레이어 B가 A의 `round_result`를 받기 전에 이미 전송해둔 `finish` 메시지가 서버에 도착한다. `room.over`가 여전히 false이므로 `finishRound(room, 'p2')`가 그대로 실행되어 다시 채점된다.
4. 결과적으로 한 라운드에 대해 양쪽 점수가 모두 1점씩 오르고, `round_result`가 두 번 브로드캐스트되며 `nextMapIndex`도 두 번째 값으로 덮어써진다.

PvP의 `ringout` 경로(`server/server.js:149-153`)도 같은 함수를 공유하므로 동시 링아웃 시 동일하게 재현 가능.

### 기대 동작 vs 실제 동작
- 기대: 한 라운드는 정확히 한 번만 채점되어야 한다.
- 실제: 라운드 단위 가드가 없어 근접 타이밍의 두 메시지가 모두 유효하게 처리된다.

### 근본 원인
```js
// server/server.js:101-112
function finishRound(room, winnerSide) {
  if (!room || room.over) return;   // room.over는 매치 전체 종료 시에만 true
  ...
  if (matchOver) endRoom(room);      // 라운드만 끝난 경우 room은 그대로 유지됨
}
```
`room.over`는 매치 전체 종료 플래그일 뿐, 라운드 단위의 "이미 처리됨" 상태를 표현하지 못한다(코드 직접 확인).

### 영향 범위
PvP·점프레이스 온라인 대전 전체. 네트워크 지연이 있거나 두 플레이어의 실력이 비슷해 도착/링아웃 시점이 근접할수록 발생 빈도가 높아짐.

### 제안 해결 방안
라운드 단위 플래그를 추가해 최초 1건만 통과시킨다.
```js
function finishRound(room, winnerSide) {
  if (!room || room.over || !room.roundActive) return;
  room.roundActive = false;
  ...
}
```
`createRoom`과 다음 라운드 시작 시점(클라이언트에 `round_result` 전송 후 다음 카운트다운 시작 등)에 `room.roundActive = true`로 재설정.

### 참고
`server/server.js:101-159`

---

## 부록: 확신도 낮음 (추정, 미확정)

### 웅크린 채 발판 밖으로 나가는 순간 공중에서 강제로 일어섬
`js/player.js:88-101`에서 `shouldCrouch = wantsCrouch && this.onGround`로 계산되므로, 크라우치 키를 누른 채 발판 끝을 벗어나 `onGround`가 false가 되는 즉시 위쪽이 막혀있지 않다면 강제로 일어선다. 히트박스가 그 프레임에 18→30(`PLAYER_CROUCH_H`→`PLAYER_H`)으로 커지고 `y`가 순간 이동하지만, `moveAndCollide`가 같은 프레임에 재보정해 화면상 체감은 적을 수 있다.
이것이 의도된 설계(웅크린 채 공중에 뜰 수 없음)인지 놓친 엣지케이스인지는 레벨 디자인 의도를 알 수 없어 버그로 단정하지 않음. 계단식 지형에서 반복적으로 발이 뜨는 현상이 있는지 QA 확인 권장. 심각도: Low(추정).
