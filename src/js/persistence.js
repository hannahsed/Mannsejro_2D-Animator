// src/js/persistence.js
/**
 * CRASH-GUARD MULTI-PROJECT PERSISTENCE ENGINE
 * Double-buffered A/B storage with per-project integrity verification & library catalog.
 * Immune to sudden hardware power cuts.
 */

const DB_NAME = 'mannsejro-studio-guard';
const DB_VERSION = 3;
const STORE_SLOTS = 'project_slots';
const STORE_PROJECTS = 'projects_library';
const STORE_META = 'library_meta';

const SLOT_A = 'slot_a';
const SLOT_B = 'slot_b';
const META_KEY = 'guard_meta';
const CATALOG_META_KEY = 'catalog_meta';
const LS_CATALOG_KEY = 'mannsejro_project_manifest';
const LS_LAST_ACTIVE_KEY = 'mannsejro_last_active_project_id';

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
      if (!db.objectStoreNames.contains(STORE_SLOTS)) {
        db.createObjectStore(STORE_SLOTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      resolve(db);
      // Perform one-time background migration of legacy slot data to library if needed
      setTimeout(async () => {
        try {
          await migrateLegacySlotIfNeeded(db);
        } catch (err) {
          console.warn('[CrashGuard] Legacy migration check warning:', err);
        }
      }, 0);
    };
    request.onerror = () => reject(request.error || new Error('DB open failed'));
    request.onblocked = () => reject(new Error('DB open blocked'));
  });
}

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

export function cloneProjectFast(project) {
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
      p.width > 0 &&
      typeof p.height === 'number' &&
      p.height > 0 &&
      Array.isArray(p.layers) &&
      p.layers.length > 0 &&
      Array.isArray(p.frames) &&
      p.frames.length > 0
  );
}

/**
 * Migrates legacy project_slots into projects_library if library is currently empty.
 */
async function migrateLegacySlotIfNeeded(db) {
  if (!db.objectStoreNames.contains(STORE_PROJECTS) || !db.objectStoreNames.contains(STORE_SLOTS)) {
    return;
  }

  const existingCount = await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    } catch (e) {
      resolve(0);
    }
  });

  if (existingCount > 0) return; // Already populated

  // Read legacy slot data
  const legacyData = await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SLOTS, 'readonly');
      const store = tx.objectStore(STORE_SLOTS);
      const reqA = store.get(SLOT_A);
      reqA.onsuccess = () => {
        if (reqA.result?.project && isProjectStructurallySound(reqA.result.project)) {
          resolve(reqA.result.project);
          return;
        }
        const reqB = store.get(SLOT_B);
        reqB.onsuccess = () => {
          if (reqB.result?.project && isProjectStructurallySound(reqB.result.project)) {
            resolve(reqB.result.project);
          } else {
            resolve(null);
          }
        };
        reqB.onerror = () => resolve(null);
      };
      reqA.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });

  if (legacyData) {
    console.log('[CrashGuard] Migrated legacy session into project library:', legacyData.name);
    await saveProjectToLibrary(legacyData, true);
  }
}

/**
 * Saves a project into the multi-project system library.
 * Implements ping-pong A/B slotting per project for power-cut resilience.
 */
export async function saveProjectToLibrary(project, isCurrentActive = true, alreadyCloned = false) {
  if (!isProjectStructurallySound(project)) {
    throw new Error('Refusing to persist corrupted project state');
  }

  // Ensure project has a solid ID
  if (!project.id) {
    project.id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  const db = await getDB();
  const cloned = alreadyCloned ? project : cloneProjectFast(project);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_PROJECTS, STORE_META, STORE_SLOTS], 'readwrite');
      const projStore = tx.objectStore(STORE_PROJECTS);
      const metaStore = tx.objectStore(STORE_META);
      const slotStore = tx.objectStore(STORE_SLOTS);

      const req = projStore.get(project.id);
      req.onsuccess = () => {
        const existing = req.result || null;
        const nextSlot = existing?.activeSlot === 'slot_a' ? 'slot_b' : 'slot_a';
        const seq = (existing?.seq || 0) + 1;
        const now = Date.now();

        const record = {
          id: project.id,
          name: project.name || 'Untitled Animation',
          width: project.width,
          height: project.height,
          fps: project.fps || 24,
          backgroundColor: project.backgroundColor || '#ffffff',
          frameCount: Array.isArray(project.frames) ? project.frames.length : 1,
          layerCount: Array.isArray(project.layers) ? project.layers.length : 1,
          createdAt: existing?.createdAt || now,
          lastModified: now,
          activeSlot: nextSlot,
          seq,
          slot_a: nextSlot === 'slot_a' ? cloned : (existing?.slot_a || cloned),
          slot_b: nextSlot === 'slot_b' ? cloned : (existing?.slot_b || cloned),
          project: cloned,
        };

        projStore.put(record);

        if (isCurrentActive) {
          metaStore.put({
            id: CATALOG_META_KEY,
            lastActiveProjectId: project.id,
            lastModified: now,
          });
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem(LS_LAST_ACTIVE_KEY, project.id);
            } catch (e) {}
          }
        }

        try {
          updateLocalStorageManifestCache(record);
        } catch (e) {}

        slotStore.put({
          id: nextSlot,
          seq,
          savedAt: now,
          project: cloned,
        });
        slotStore.put({
          id: META_KEY,
          activeSlot: nextSlot,
          sequenceNumber: seq,
          lastUpdated: now,
        });
      };

      req.onerror = () => {
        const now = Date.now();
        const record = {
          id: project.id,
          name: project.name || 'Untitled Animation',
          width: project.width,
          height: project.height,
          fps: project.fps || 24,
          backgroundColor: project.backgroundColor || '#ffffff',
          frameCount: Array.isArray(project.frames) ? project.frames.length : 1,
          layerCount: Array.isArray(project.layers) ? project.layers.length : 1,
          createdAt: now,
          lastModified: now,
          activeSlot: 'slot_a',
          seq: 1,
          slot_a: cloned,
          slot_b: cloned,
          project: cloned,
        };
        projStore.put(record);
      };

      tx.oncomplete = () => resolve({ id: project.id, slot: 'persisted' });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    } catch (err) {
      reject(err);
    }
  });
}

function updateLocalStorageManifestCache(record) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_CATALOG_KEY);
    let catalog = raw ? JSON.parse(raw) : [];
    catalog = catalog.filter((item) => item.id !== record.id);
    catalog.unshift({
      id: record.id,
      name: record.name,
      width: record.width,
      height: record.height,
      fps: record.fps,
      frameCount: record.frameCount,
      layerCount: record.layerCount,
      lastModified: record.lastModified,
      createdAt: record.createdAt,
    });
    // Keep top 50 project metadata items in localStorage cache
    if (catalog.length > 50) catalog = catalog.slice(0, 50);
    localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(catalog));
  } catch (e) {}
}

/**
 * Returns a list of all saved projects sorted by lastModified descending.
 */
export async function listProjectsFromLibrary() {
  try {
    const db = await getDB();
    const lastActiveId = await getLastActiveProjectId(db);

    const records = await new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const items = records.map((r) => ({
      id: r.id,
      name: r.name || 'Untitled Animation',
      width: r.width || 1920,
      height: r.height || 1080,
      fps: r.fps || 24,
      backgroundColor: r.backgroundColor || '#ffffff',
      frameCount: r.frameCount || (r.project?.frames ? r.project.frames.length : 1),
      layerCount: r.layerCount || (r.project?.layers ? r.project.layers.length : 1),
      lastModified: r.lastModified || r.createdAt || Date.now(),
      createdAt: r.createdAt || Date.now(),
      isLastActive: r.id === lastActiveId,
    }));

    // Sort newest modified first
    items.sort((a, b) => b.lastModified - a.lastModified);

    // Synchronize localStorage cache
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(items));
      }
    } catch (e) {}

    return items;
  } catch (err) {
    console.warn('[CrashGuard] listProjectsFromLibrary error, using localStorage fallback:', err);
    return getProjectsFromLocalStorageCache();
  }
}

function getProjectsFromLocalStorageCache() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_CATALOG_KEY);
    const lastActiveId = localStorage.getItem(LS_LAST_ACTIVE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw);
    return items.map((it) => ({
      ...it,
      isLastActive: it.id === lastActiveId,
    })).sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  } catch (e) {
    return [];
  }
}

async function getLastActiveProjectId(db) {
  try {
    const fromMeta = await new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get(CATALOG_META_KEY);
      req.onsuccess = () => resolve(req.result?.lastActiveProjectId || null);
      req.onerror = () => resolve(null);
    });
    if (fromMeta) return fromMeta;
  } catch (e) {}

  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(LS_LAST_ACTIVE_KEY) || null;
  }
  return null;
}

/**
 * Loads a project by ID from projects_library.
 * If the active slot was interrupted by power loss, falls back to alternate slot automatically.
 */
export async function getProjectFromLibrary(projectId) {
  if (!projectId) return null;
  try {
    const db = await getDB();
    const record = await new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (!record) return null;

    // Check active slot
    const primarySlot = record.activeSlot === 'slot_b' ? record.slot_b : record.slot_a;
    if (primarySlot && isProjectStructurallySound(primarySlot)) {
      return primarySlot;
    }

    // Fallback to alternate slot
    const alternateSlot = record.activeSlot === 'slot_b' ? record.slot_a : record.slot_b;
    if (alternateSlot && isProjectStructurallySound(alternateSlot)) {
      console.warn(`[CrashGuard] Project ${projectId} primary slot damaged; restored from alternate slot.`);
      return alternateSlot;
    }

    if (record.project && isProjectStructurallySound(record.project)) {
      return record.project;
    }

    return null;
  } catch (err) {
    console.error(`[CrashGuard] Error loading project ${projectId}:`, err);
    return null;
  }
}

/**
 * Deletes a project from the library.
 */
export async function deleteProjectFromLibrary(projectId) {
  if (!projectId) return false;
  try {
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      store.delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Update localStorage cache
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_CATALOG_KEY);
        if (raw) {
          const items = JSON.parse(raw).filter((it) => it.id !== projectId);
          localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(items));
        }
        if (localStorage.getItem(LS_LAST_ACTIVE_KEY) === projectId) {
          localStorage.removeItem(LS_LAST_ACTIVE_KEY);
        }
      } catch (e) {}
    }

    // If last active project was deleted, find next most recent
    const remaining = await listProjectsFromLibrary();
    if (remaining.length > 0) {
      const nextActive = remaining[0].id;
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({
        id: CATALOG_META_KEY,
        lastActiveProjectId: nextActive,
        lastModified: Date.now(),
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_LAST_ACTIVE_KEY, nextActive);
      }
    }

    return true;
  } catch (err) {
    console.error(`[CrashGuard] Error deleting project ${projectId}:`, err);
    return false;
  }
}

/**
 * Loads the latest valid project from the system (most recently active or modified).
 */
export async function loadLatestProject() {
  try {
    const db = await getDB();
    const lastActiveId = await getLastActiveProjectId(db);

    if (lastActiveId) {
      const activeProj = await getProjectFromLibrary(lastActiveId);
      if (activeProj && isProjectStructurallySound(activeProj)) {
        return activeProj;
      }
    }

    // If no active pointer or invalid, pick the newest project from the library
    const list = await listProjectsFromLibrary();
    if (list.length > 0) {
      for (const item of list) {
        const proj = await getProjectFromLibrary(item.id);
        if (proj && isProjectStructurallySound(proj)) {
          return proj;
        }
      }
    }

    // Fallback to legacy slots
    return await loadLatestCrashResistantProject();
  } catch (err) {
    console.warn('[CrashGuard] loadLatestProject fallback:', err);
    return await loadLatestCrashResistantProject();
  }
}

/**
 * Saves project using atomic A/B Ping-Pong strategy.
 * Also persists into multi-project library.
 */
export async function atomicSaveProject(project, alreadyCloned = false) {
  if (!isProjectStructurallySound(project)) {
    throw new Error('Refusing to persist corrupted project state');
  }

  // 1. Save into multi-project system library
  const result = await saveProjectToLibrary(project, true, alreadyCloned);
  return result;
}

function getGuardMetadata(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SLOTS, 'readonly');
    const store = tx.objectStore(STORE_SLOTS);
    const req = store.get(META_KEY);
    req.onsuccess = () => resolve(req.result || { activeSlot: SLOT_B, sequenceNumber: 0 });
    req.onerror = () => resolve({ activeSlot: SLOT_B, sequenceNumber: 0 });
  });
}

function getSlotData(db, slotId) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SLOTS, 'readonly');
    const store = tx.objectStore(STORE_SLOTS);
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
export const loadAutosavedProject = loadLatestProject;

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
      project: cloneProjectFast(project),
    };

    await new Promise((resolve) => {
      const tx = db.transaction(STORE_SLOTS, 'readwrite');
      tx.objectStore(STORE_SLOTS).put(payload);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });

    await pruneOldCheckpoints();
  } catch (err) {
    console.warn('[TimeMachine] Failed to create checkpoint:', err);
  }
}

/**
 * TIER 3: Rolling 60-Second Checkpoint Vault
 * Automatically archives snapshots every 60 seconds into a ring buffer.
 */
export async function saveRolling60sCheckpoint(project) {
  if (!project || !project.id) return;
  try {
    const db = await getDB();
    const id = `cp_${project.id}_${Date.now()}`;
    const payload = {
      id,
      projectId: project.id,
      timestamp: Date.now(),
      name: project.name || 'Untitled',
      project: cloneProjectFast(project),
    };

    await new Promise((resolve) => {
      const tx = db.transaction(STORE_SLOTS, 'readwrite');
      tx.objectStore(STORE_SLOTS).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    await pruneOldRollingCheckpoints(db, project.id);
  } catch (err) {
    console.warn('[CrashGuard] Failed to save rolling checkpoint:', err);
  }
}

async function pruneOldRollingCheckpoints(db, projectId) {
  try {
    const tx = db.transaction(STORE_SLOTS, 'readwrite');
    const store = tx.objectStore(STORE_SLOTS);
    const req = store.getAll();
    req.onsuccess = () => {
      const cps = (req.result || [])
        .filter(r => r.projectId === projectId && typeof r.id === 'string' && r.id.startsWith('cp_'))
        .sort((a, b) => b.timestamp - a.timestamp);

      // Keep newest 10 checkpoints
      if (cps.length > 10) {
        for (let i = 10; i < cps.length; i++) {
          store.delete(cps[i].id);
        }
      }
    };
  } catch (_) {}
}

async function pruneOldCheckpoints() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_SLOTS, 'readwrite');
    const store = tx.objectStore(STORE_SLOTS);
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
  } catch (e) {}
}


