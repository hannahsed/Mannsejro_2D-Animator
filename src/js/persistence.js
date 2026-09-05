// src/js/persistence.js
/**
 * CRASH-GUARD PERSISTENCE ENGINE
 * Double-buffered A/B storage with integrity verification.
 * Immune to sudden hardware power cuts.
 */

const DB_NAME = 'mannsejro-studio-guard';
const DB_VERSION = 2;
const STORE_NAME = 'project_slots';

const SLOT_A = 'slot_a';
const SLOT_B = 'slot_b';
const META_KEY = 'guard_meta';

let dbPromise = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable on this platform'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('DB open failed'));
    request.onblocked = () => reject(new Error('DB open blocked'));
  });
}

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function cloneProjectFast(project) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(project);
    } catch (e) {}
  }
  return JSON.parse(JSON.stringify(project));
}

/**
 * Validates project structural integrity before saving or restoring.
 */
export function isProjectStructurallySound(p) {
  return Boolean(
    p &&
      typeof p === 'object' &&
      typeof p.width === 'number' &&
      typeof p.height === 'number' &&
      Array.isArray(p.layers) &&
      p.layers.length > 0 &&
      Array.isArray(p.frames) &&
      p.frames.length > 0
  );
}

/**
 * Saves project using an atomic A/B Ping-Pong strategy.
 * If the computer dies during this write, the alternate slot is preserved.
 */
export async function atomicSaveProject(project) {
  if (!isProjectStructurallySound(project)) {
    throw new Error('Refusing to persist corrupted project state');
  }

  const db = await getDB();

  // 1. Read metadata to determine which slot to write to next
  const meta = await getGuardMetadata(db);
  const nextSlot = meta.activeSlot === SLOT_A ? SLOT_B : SLOT_A;
  const seq = (meta.sequenceNumber || 0) + 1;

  const payload = {
    id: nextSlot,
    seq,
    savedAt: Date.now(),
    project: cloneProjectFast(project),
  };

  // 2. Commit payload into the alternate slot
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  // 3. Update pointer only after the slot write completes
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      id: META_KEY,
      activeSlot: nextSlot,
      sequenceNumber: seq,
      lastUpdated: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { slot: nextSlot, seq };
}

function getGuardMetadata(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(META_KEY);
    req.onsuccess = () => resolve(req.result || { activeSlot: SLOT_B, sequenceNumber: 0 });
    req.onerror = () => resolve({ activeSlot: SLOT_B, sequenceNumber: 0 });
  });
}

function getSlotData(db, slotId) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(slotId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/**
 * Recovers latest valid state after a crash.
 * Checks the active slot first; if corrupted by a mid-write shutdown,
 * falls back to the alternate slot automatically.
 */
export async function loadLatestCrashResistantProject() {
  try {
    const db = await getDB();
    const meta = await getGuardMetadata(db);

    const primarySlotId = meta.activeSlot === SLOT_A ? SLOT_A : SLOT_B;
    const fallbackSlotId = primarySlotId === SLOT_A ? SLOT_B : SLOT_A;

    const primary = await getSlotData(db, primarySlotId);
    if (primary?.project && isProjectStructurallySound(primary.project)) {
      console.log(`[CrashGuard] Recovered latest project from ${primarySlotId} (Seq: ${primary.seq})`);
      return primary.project;
    }

    const fallback = await getSlotData(db, fallbackSlotId);
    if (fallback?.project && isProjectStructurallySound(fallback.project)) {
      console.warn(`[CrashGuard] Primary slot was damaged; successfully recovered fallback from ${fallbackSlotId}`);
      return fallback.project;
    }

    return null;
  } catch (err) {
    console.error('[CrashGuard] Recovery error:', err);
    return null;
  }
}

// Backward-compatible aliases
export const saveProjectToDisk = atomicSaveProject;
export const loadAutosavedProject = loadLatestCrashResistantProject;

/**
 * Saves an immutable rolling milestone snapshot.
 */
export async function createRollingCheckpoint(project) {
  try {
    const db = await getDB();
    const id = `checkpoint_${Date.now()}`;
    const payload = {
      id,
      timestamp: Date.now(),
      name: project.name || 'Untitled',
      project: JSON.parse(JSON.stringify(project)),
    };

    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(payload);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });

    // Prune: keep only the last 3 rolling snapshots to save space
    await pruneOldCheckpoints();
  } catch (err) {
    console.warn('[TimeMachine] Failed to create checkpoint:', err);
  }
}

async function pruneOldCheckpoints() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();
  req.onsuccess = () => {
    const items = (req.result || [])
      .filter((item) => item.id && item.id.startsWith('checkpoint_'))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (items.length > 3) {
      for (let i = 3; i < items.length; i++) {
        store.delete(items[i].id);
      }
    }
  };
}

