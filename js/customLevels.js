const STORAGE_KEY = 'jumpweb_custom_stages';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getCustomStageEntries() {
  return readAll();
}

export function getCustomStages() {
  return readAll().map((entry) => entry.stage);
}

export function saveCustomStage(stage, id = null) {
  const list = readAll();
  if (id) {
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= 0) {
      list[idx] = { id, stage };
      writeAll(list);
      return id;
    }
  }
  const newId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  list.push({ id: newId, stage });
  writeAll(list);
  return newId;
}

export function deleteCustomStage(id) {
  writeAll(readAll().filter((e) => e.id !== id));
}
