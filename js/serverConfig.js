// Shared server-address resolution for both the PvP WebSocket (js/net.js) and
// the custom-map REST API (js/customServerMaps.js).
//
// The frontend (this static site) and the backend (server/) are hosted
// separately: the frontend deploys to GitHub Pages while the backend runs on
// its own server, so "same origin as the page" is NOT a valid assumption in
// production. The backend address below must match wherever server/ actually
// runs - see server/README.md.
//
// Override with a query string when testing against a different host, e.g.
// index.html?api=http://192.168.0.5:8080&ws=ws://192.168.0.5:8080/ws

const PROD_HTTP_BASE = 'https://pghs.zstrit.com/sy';
const PROD_WS_URL = 'wss://pghs.zstrit.com/sy/ws';

function isLocalHost() {
  const host = window.location.hostname;
  return window.location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
}

export function resolveHttpBase() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('api');
  if (override) return override.replace(/\/$/, '');
  if (isLocalHost()) return 'http://localhost:8080';
  return PROD_HTTP_BASE;
}

export function resolveWsUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('ws');
  if (override) return override;
  if (isLocalHost()) return 'ws://localhost:8080/ws';
  return PROD_WS_URL;
}
