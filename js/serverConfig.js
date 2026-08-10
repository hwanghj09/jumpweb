// Shared server-address resolution for both the PvP WebSocket (js/net.js) and
// the custom-map REST API (js/customServerMaps.js). Override with a query
// string when testing against a non-default host, e.g.
// index.html?api=http://192.168.0.5:8080&ws=ws://192.168.0.5:8080/ws

function isLocalHost() {
  const host = window.location.hostname;
  return window.location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
}

export function resolveHttpBase() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('api');
  if (override) return override.replace(/\/$/, '');
  if (isLocalHost()) return 'http://localhost:8080';
  return `${window.location.protocol}//${window.location.host}`;
}

export function resolveWsUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('ws');
  if (override) return override;
  if (isLocalHost()) return 'ws://localhost:8080/ws';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}
