# jumpweb 서버 — 배포 가이드

이 서버 하나가 두 가지 역할을 합니다.

1. **PvP 매칭/중계** — 1:1 매칭, 3선승제 스코어, 두 플레이어의 위치를 서로 중계 (`js/net.js`, `server.js`)
2. **커스텀 맵 공유** — 맵 에디터에서 업로드한 맵을 저장하고, 다른 사람이 게임의 '커스텀 맵' 메뉴에서 내려받아 플레이할 수 있게 함 (`js/customServerMaps.js`, `customMaps.js`)

둘 다 같은 Node.js 프로세스 하나(기본 포트 `8080`)에서 돌아갑니다. WebSocket은 `/ws`, REST API는 `/api/custom-maps`에 붙습니다.

---

## 0. 배포 형태 한눈에 보기

```
[사용자 브라우저] --https(443)--> [nginx] --+--> 정적 파일 (index.html, js/, editor.html ...)
                                             +--> /ws       --> 127.0.0.1:8080 (Node, WebSocket)
                                             +--> /api/...  --> 127.0.0.1:8080 (Node, REST)
```

- nginx가 80/443을 받아서 도메인/HTTPS를 처리하고, 정적 파일은 nginx가 직접 서빙합니다.
- Node 서버(`server.js`)는 **외부에 직접 노출하지 않고** localhost:8080에서만 돌립니다. nginx가 내부적으로 그쪽으로 프록시합니다.
- Node 프로세스는 pm2 또는 systemd로 "항상 켜져 있게" 만듭니다.

---

## 0-1. ⚠️ 지금 이 코드에 실제로 반영된 배포 방식

위 0번은 "정적 파일 + 백엔드를 한 서버에서 같이 서빙"하는 **일반적인** 구성입니다. 하지만 지금 `js/serverConfig.js`에는 **프론트와 백엔드를 분리하는 구성**이 이미 하드코딩되어 있습니다:

- **프론트(게임 화면)**: GitHub Pages — `.github/workflows/deploy-pages.yml`이 `main` 브랜치에 push될 때마다 `index.html`, `editor.html`, `js/`, `images/`, `custom-stages/`만 골라서 자동 배포합니다 (`server/`는 배포 대상에서 제외됨).
- **백엔드(멀티플레이/커스텀맵 서버)**: `https://pghs.zstrit.com/sy/` — 이 경로 밑에서 Node 서버가 돈다고 가정하고 클라이언트 코드가 고정되어 있습니다 (`wss://pghs.zstrit.com/sy/ws`, `https://pghs.zstrit.com/sy/api/custom-maps`).

**해야 할 일 두 가지:**

**A. GitHub Pages 켜기**
1. GitHub 저장소 → Settings → Pages
2. "Build and deployment" → Source를 **GitHub Actions**로 선택 (기본값인 "Deploy from a branch"가 아님)
3. `main`에 push하면 Actions 탭에서 `Deploy to GitHub Pages` 워크플로우가 돌고, 끝나면 `https://<GitHub 사용자명>.github.io/<저장소명>/`로 접속 가능

**B. `pghs.zstrit.com` 서버에 백엔드 올리기**
`pghs.zstrit.com`은 이미 다른 용도로 쓰이고 있을 수 있으니, 아래 1~4번(Node 설치, `server/` 배포, systemd 등록)은 그대로 따라 하되 **nginx는 5번 예시 전체로 덮어쓰지 말고**, 이미 있는 `pghs.zstrit.com` 서버 블록 안에 이 두 `location`만 추가하세요:

```nginx
    location /sy/ws {
        proxy_pass http://127.0.0.1:8080/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
    }

    location /sy/api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
```

`nginx -t && systemctl reload nginx` 후 확인:

```bash
curl https://pghs.zstrit.com/sy/api/custom-maps    # []
```

이 두 `location`만 있으면 되고, `/sy/` 경로에 정적 파일을 놓을 필요는 없습니다 (정적 파일은 GitHub Pages가 서빙). REST API는 이미 `Access-Control-Allow-Origin: *`를 응답하므로 GitHub Pages(다른 도메인)에서 호출해도 CORS 문제가 없습니다.

다른 도메인/경로를 쓰고 싶다면 `js/serverConfig.js`의 `PROD_HTTP_BASE`, `PROD_WS_URL` 두 줄만 바꾸면 됩니다.

> 아래 1~11번은 "정적 파일+백엔드를 한 서버에서 같이 서빙"하는 **대안** 구성 설명입니다. 지금처럼 프론트/백엔드를 분리해서 쓴다면 2~4번(Node 서버 설치·상시 실행)까지는 그대로 따라 하고, 5번 nginx 예시는 위 `location /sy/...` 두 블록으로 대체하면 됩니다.

---

## 1. 사전 준비

- Linux 서버 한 대 (VPS든 자체 서버든). 아래 명령은 Ubuntu/Debian 기준입니다.
- Node.js 18 이상 (이 프로젝트는 20/22에서 테스트했습니다).
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt-get install -y nodejs
  node -v
  ```
- nginx: `sudo apt-get install -y nginx`
- (선택, 권장) 도메인 하나와 그 도메인이 서버 IP를 가리키는 DNS A 레코드.

## 2. 코드 올리기

로컬에서 리포지토리를 서버로 복사합니다. git을 쓰는 걸 권장합니다.

```bash
# 서버에서
sudo mkdir -p /var/www/jumpweb
sudo chown $USER:$USER /var/www/jumpweb
git clone <이 저장소 URL> /var/www/jumpweb
```

git을 안 쓴다면 `scp -r`로 프로젝트 폴더 전체를 `/var/www/jumpweb`에 복사해도 됩니다.

디렉터리 구조 확인:
```
/var/www/jumpweb/
  index.html, editor.html, style.css, js/, images/, custom-stages/   ← 정적 파일 (nginx가 서빙)
  server/                                                            ← Node 서버 (여기서 npm install & 실행)
```

## 3. Node 서버 설치 & 실행 확인

```bash
cd /var/www/jumpweb/server
npm install
PORT=8080 node server.js
```

`pvp server listening on :8080 (ws path /ws)`가 뜨면 정상입니다. 다른 터미널에서:

```bash
curl http://localhost:8080/                      # "jumpweb pvp server ok"
curl http://localhost:8080/api/custom-maps        # "[]"
```

확인됐으면 `Ctrl+C`로 끄고, 아래 4번에서 항상 실행되도록 등록합니다.

## 4. 항상 켜져 있게: systemd (권장)

`/etc/systemd/system/jumpweb-pvp.service` 파일을 만듭니다:

```ini
[Unit]
Description=jumpweb pvp/custom-map server
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/jumpweb/server
ExecStart=/usr/bin/node server.js
Environment=PORT=8080
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

`User=www-data`로 실행하려면 `server/data` 폴더(맵 저장 위치)에 그 사용자가 쓸 수 있어야 합니다:

```bash
sudo mkdir -p /var/www/jumpweb/server/data
sudo chown -R www-data:www-data /var/www/jumpweb/server
```

등록하고 시작:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jumpweb-pvp
sudo systemctl status jumpweb-pvp     # active (running) 확인
journalctl -u jumpweb-pvp -f          # 로그 보기
```

### 대안: pm2

systemd 대신 pm2를 쓰고 싶다면:

```bash
sudo npm install -g pm2
cd /var/www/jumpweb/server
pm2 start server.js --name jumpweb-pvp --env PORT=8080
pm2 save
pm2 startup   # 안내되는 명령을 그대로 실행하면 재부팅 후에도 자동 시작됨
```

## 5. nginx: 정적 파일 + 리버스 프록시

`/etc/nginx/sites-available/jumpweb`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/jumpweb;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8080/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

활성화:

```bash
sudo ln -s /etc/nginx/sites-available/jumpweb /etc/nginx/sites-enabled/jumpweb
sudo nginx -t
sudo systemctl reload nginx
```

이 시점에 `http://your-domain.com`으로 접속하면 게임이 열리고, `js/serverConfig.js`가 자동으로 같은 호스트의 `/ws`, `/api`를 사용하므로 별도 설정 없이 PvP·커스텀 맵이 동작합니다.

## 6. HTTPS (권장) — Let's Encrypt

브라우저에서 `wss://`(암호화된 WebSocket)를 쓰려면, 또 사이트를 `https://`로 열려면 인증서가 필요합니다. HTTP로만 운영해도 기능은 동작하지만(`ws://`), 실제 서비스라면 HTTPS를 권장합니다.

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

certbot이 nginx 설정을 자동으로 `listen 443 ssl`로 바꿔주고 인증서 갱신 크론도 등록합니다. 이후 `js/serverConfig.js`는 페이지가 `https://`면 자동으로 `wss://`를 사용하므로 클라이언트 코드는 손댈 필요가 없습니다.

## 7. 방화벽

nginx가 80/443만 열고, Node의 8080은 외부에 노출하지 않습니다.

```bash
sudo ufw allow 'Nginx Full'   # 80, 443
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

8080을 `ufw allow 8080`처럼 외부에 열지 마세요. nginx가 `127.0.0.1:8080`으로만 접근하면 충분합니다.

## 8. 배포 후 확인

```bash
curl -I https://your-domain.com/                       # 200
curl https://your-domain.com/api/custom-maps            # []
```

브라우저에서 사이트를 열고: 타이틀 화면 → **1:1 대결 (PVP)** 로 매칭 대기 화면이 뜨는지, **커스텀 맵**으로 목록(처음엔 비어있음)이 뜨는지, `editor.html`에서 맵을 만들고 **서버에 업로드**가 성공하는지 확인하세요.

## 9. 업데이트(재배포) 방법

```bash
cd /var/www/jumpweb
git pull
cd server
npm install                      # package.json이 바뀐 경우에만 필요
sudo systemctl restart jumpweb-pvp   # 또는: pm2 restart jumpweb-pvp
```

정적 파일(`js/*.js`, `index.html` 등)은 nginx가 그냥 디스크에서 읽어 서빙하므로 `git pull`만 하면 바로 반영됩니다. `server/server.js`나 `server/customMaps.js`를 바꿨을 때만 재시작이 필요합니다.

## 10. 데이터 백업

업로드된 커스텀 맵은 `server/data/custom-maps.json` 파일 하나에 저장됩니다(DB 없음). 이 파일을 지우면 업로드된 맵이 전부 사라지므로, 배포 스크립트나 `git clean`이 `server/data`를 건드리지 않게 주의하고, 주기적으로 백업하세요.

```bash
# 매일 새벽 백업 (crontab -e)
0 3 * * * cp /var/www/jumpweb/server/data/custom-maps.json /var/backups/jumpweb-custom-maps-$(date +%F).json
```

## 11. 로컬 개발/테스트

배포 서버 없이 내 컴퓨터에서 확인할 때:

```bash
cd server
npm install
node server.js                 # ws://localhost:8080/ws, http://localhost:8080/api/custom-maps
```

게임 정적 파일은 별도의 아무 HTTP 서버로 열면 됩니다 (예: `python -m http.server 5500`을 프로젝트 루트에서 실행 후 `http://localhost:5500`). `js/serverConfig.js`는 호스트가 `localhost`/`127.0.0.1`/`file:`이면 자동으로 `ws://localhost:8080`, `http://localhost:8080`을 사용합니다. 다른 호스트/포트를 쓰려면 URL에 `?ws=ws://호스트:포트/ws&api=http://호스트:포트`를 붙이세요.

---

## 프로토콜 / API 참고

- WebSocket 메시지 형식: `../js/net.js` 상단 주석 참고 (매칭, 상태 중계, 라운드 결과 등)
- REST API (`customMaps.js`):
  - `GET /api/custom-maps` → `[{ id, stage, createdAt }, ...]`
  - `POST /api/custom-maps` body `{ stage }` → `201 { id, ownerToken }` (이 `ownerToken`은 응답 한 번만 내려주며, 삭제할 때만 필요합니다. 클라이언트는 이걸 `localStorage`에 저장해 "내가 업로드한 맵" 목록을 관리합니다.)
  - `DELETE /api/custom-maps/:id` body `{ ownerToken }` (또는 헤더 `X-Owner-Token`) → 일치하면 `204`, 아니면 `403`

## 상수 동기화 주의

`server.js` 상단의 값들은 클라이언트 쪽 정의와 반드시 같아야 합니다:

- `PVP_MAP_COUNT` ↔ `js/constants.js`의 `PVP_ARENA_COUNT` (= `js/pvpMaps.js`의 `PVP_ARENAS.length`)
- `JUMPMAP_STAGE_COUNT` ↔ `js/levels.js`의 `STAGES.length` (멀티 점프맵 경주가 고르는 스테이지 개수)
- `ROUND_WINS` ↔ `js/constants.js`의 `PVP_ROUND_WINS` (두 모드 모두 3선승제 기준으로 공유)

`js/pvpMaps.js`의 아레나나 `js/levels.js`의 STAGES를 추가/삭제하면 여기 대응하는 값도 같이 수정하세요.

## 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| PvP 매칭이 "상대를 찾는 중..."에서 멈춤 | `/ws`가 프록시되지 않음 | nginx `location /ws` 블록의 `Upgrade`/`Connection` 헤더 확인, `sudo nginx -t` |
| 커스텀 맵 목록이 항상 비어있음 | `/api/custom-maps` 요청이 실패 | 브라우저 개발자도구 Network 탭에서 상태 코드 확인, nginx `location /api/` 확인 |
| `Mixed Content` 콘솔 에러 | 사이트는 https인데 ws://로 접속 시도 | HTTPS 적용 후엔 자동으로 wss:// 사용됨(7번 참고); CDN/캐시가 예전 HTML을 서빙하고 있는지 확인 |
| 서버 재부팅 후 안 뜸 | systemd/pm2 자동시작 미등록 | `systemctl enable jumpweb-pvp` 또는 `pm2 startup` 실행했는지 확인 |
| 업로드한 맵이 갑자기 다 사라짐 | `server/data/custom-maps.json` 삭제/초기화됨 | 10번 백업 섹션 참고, 배포 스크립트가 `server/data`를 지우지 않는지 확인 |
