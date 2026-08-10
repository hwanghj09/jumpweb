import { resolveHttpBase } from './serverConfig.js';

const OWNED_KEY = 'jumpweb_uploaded_maps';
let cached = [];

// Tracks which server-hosted maps THIS browser uploaded, so the editor can
// offer to delete them later. The server never exposes ownerToken through
// GET /api/custom-maps, so without this a browser would have no way to
// prove ownership of its own uploads.
export function getOwnedUploads() {
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOwnedUploads(list) {
  localStorage.setItem(OWNED_KEY, JSON.stringify(list));
}

export function trackOwnedUpload(id, ownerToken, name) {
  const list = getOwnedUploads();
  list.push({ id, ownerToken, name });
  saveOwnedUploads(list);
}

export function untrackOwnedUpload(id) {
  saveOwnedUploads(getOwnedUploads().filter((e) => e.id !== id));
}

export async function refreshServerCustomStages() {
  try {
    const res = await fetch(`${resolveHttpBase()}/api/custom-maps`, { cache: 'no-store' });
    if (!res.ok) return cached;
    const list = await res.json();
    cached = Array.isArray(list) ? list : [];
  } catch {
    // offline or server unreachable: keep whatever was last fetched successfully
  }
  return cached;
}

export function getCachedServerStages() {
  return cached.map((entry) => entry.stage);
}

export async function uploadCustomStage(stage) {
  const res = await fetch(`${resolveHttpBase()}/api/custom-maps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `업로드 실패 (HTTP ${res.status})`);
  return body; // { id, ownerToken }
}

export async function deleteServerStage(id, ownerToken) {
  const res = await fetch(`${resolveHttpBase()}/api/custom-maps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerToken }),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `삭제 실패 (HTTP ${res.status})`);
  }
}
