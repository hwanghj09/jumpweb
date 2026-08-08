const FOLDER_URL = 'custom-stages/';
const FOLDER_IMPORT_PREFIX = '../custom-stages/';
const MANIFEST_NAME = 'manifest.json';

let cached = [];

function extractFilenames(html) {
  const names = new Set();
  for (const m of html.matchAll(/href="([^"#?]+\.(?:js|json))"/gi)) {
    const name = decodeURIComponent(m[1]).split('/').pop();
    if (name && name !== MANIFEST_NAME) names.add(name);
  }
  return [...names];
}

async function listFromDirectoryIndex() {
  try {
    const res = await fetch(FOLDER_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return extractFilenames(await res.text());
  } catch {
    return null;
  }
}

async function listFromManifest() {
  try {
    const res = await fetch(`${FOLDER_URL}${MANIFEST_NAME}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.filter((f) => typeof f === 'string' && /\.(js|json)$/.test(f)) : [];
  } catch {
    return [];
  }
}

async function loadStageFile(file) {
  if (file.endsWith('.json')) {
    const res = await fetch(`${FOLDER_URL}${encodeURIComponent(file)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  const mod = await import(`${FOLDER_IMPORT_PREFIX}${encodeURIComponent(file)}?v=${Date.now()}`);
  return mod.default;
}

function isValidStage(o) {
  return !!o && typeof o.width === 'number' && typeof o.height === 'number' && !!o.spawn && !!o.goal;
}

function normalizeStage(o) {
  return {
    name: o.name || '이름 없는 맵',
    hint: o.hint || '',
    width: o.width,
    height: o.height,
    spawn: o.spawn,
    goal: o.goal,
    platforms: Array.isArray(o.platforms) ? o.platforms : [],
    cones: Array.isArray(o.cones) ? o.cones : [],
    enemies: Array.isArray(o.enemies) ? o.enemies : [],
    water: Array.isArray(o.water) ? o.water : [],
  };
}

export async function refreshFolderStages() {
  let files = await listFromDirectoryIndex();
  if (!files || !files.length) files = await listFromManifest();

  const stages = [];
  for (const file of files) {
    try {
      const data = await loadStageFile(file);
      if (!isValidStage(data)) {
        console.warn(`custom-stages/${file}: 필수 필드(width/height/spawn/goal)가 없어 건너뜁니다.`);
        continue;
      }
      stages.push(normalizeStage(data));
    } catch (err) {
      console.warn(`custom-stages/${file}을 불러오지 못했습니다.`, err);
    }
  }
  cached = stages;
  return cached;
}

export function getCachedFolderStages() {
  return cached;
}
