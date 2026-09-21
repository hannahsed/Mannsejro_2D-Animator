// src/js/storage/binaryTileStore.js
/**
 * PRODUCTION BINARY TILE & VRAM STORAGE ENGINE
 * Replaces Base64 strings with native Blobs and ImageBitmaps.
 * Zero main-thread PNG encoding during active drawing.
 */

const DB_NAME = 'mannsejro_binary_vault';
const DB_VERSION = 1;
const TILE_STORE = 'binary_tiles';
const MAX_VRAM_TILES = 300; // Limits in-memory ImageBitmaps (~75MB VRAM max)

let dbPromise = null;

function getBinaryDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TILE_STORE)) {
          // Key format: projectId::frameId::layerId::coords
          db.createObjectStore(TILE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

class VRAMTileCache {
  constructor(maxEntries = MAX_VRAM_TILES) {
    this.max = maxEntries;
    this.map = new Map(); // key -> { bitmap: ImageBitmap, lastAccess: number }
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    entry.lastAccess = performance.now();
    return entry.bitmap;
  }

  set(key, bitmap) {
    if (this.map.has(key)) {
      const old = this.map.get(key);
      if (old.bitmap !== bitmap) {
        if (typeof old.bitmap.close === 'function') {
          old.bitmap.close(); // Explicitly free GPU texture memory
        }
      }
    } else if (this.map.size >= this.max) {
      this.evictLRU();
    }
    this.map.set(key, { bitmap, lastAccess: performance.now() });
  }

  delete(key) {
    const entry = this.map.get(key);
    if (entry) {
      if (typeof entry.bitmap.close === 'function') {
        entry.bitmap.close();
      }
      this.map.delete(key);
    }
  }

  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of this.map.entries()) {
      if (v.lastAccess < oldestTime) {
        oldestTime = v.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      const entry = this.map.get(oldestKey);
      if (entry && typeof entry.bitmap.close === 'function') {
        entry.bitmap.close();
      }
      this.map.delete(oldestKey);
    }
  }

  clear() {
    for (const v of this.map.values()) {
      if (v && v.bitmap && typeof v.bitmap.close === 'function') {
        v.bitmap.close();
      }
    }
    this.map.clear();
  }
}

export const vramCache = new VRAMTileCache();

/**
 * Creates a unique storage key for a tile.
 */
export function buildTileKey(projectId, frameId, layerId, coords) {
  return `${projectId}::${frameId}::${layerId}::${coords}`;
}

/**
 * Stores a Canvas or ImageData as a binary Blob directly into IndexedDB.
 * Updates VRAM cache with an ImageBitmap instantly without disk wait.
 */
export async function putBinaryTile(compositeKey, sourceCanvasOrImageData) {
  if (!sourceCanvasOrImageData) return;

  // 1. Create immediate ImageBitmap for zero-latency screen rendering
  let bitmap;
  if (sourceCanvasOrImageData instanceof ImageBitmap) {
    bitmap = sourceCanvasOrImageData;
  } else {
    bitmap = await createImageBitmap(sourceCanvasOrImageData);
  }
  vramCache.set(compositeKey, bitmap);

  // 2. Convert to binary Blob asynchronously for disk persistence
  const blob = await new Promise((resolve) => {
    if (sourceCanvasOrImageData instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && sourceCanvasOrImageData instanceof OffscreenCanvas)) {
      if (sourceCanvasOrImageData.convertToBlob) {
        sourceCanvasOrImageData.convertToBlob({ type: 'image/webp', quality: 0.95 }).then(resolve).catch(() => {
          if (sourceCanvasOrImageData.toBlob) sourceCanvasOrImageData.toBlob(resolve, 'image/png');
          else resolve(null);
        });
      } else if (sourceCanvasOrImageData.toBlob) {
        sourceCanvasOrImageData.toBlob(resolve, 'image/webp', 0.95);
      } else {
        resolve(null);
      }
    } else if (sourceCanvasOrImageData instanceof ImageBitmap) {
      const off = document.createElement('canvas');
      off.width = sourceCanvasOrImageData.width;
      off.height = sourceCanvasOrImageData.height;
      const octx = off.getContext('2d');
      octx.drawImage(sourceCanvasOrImageData, 0, 0);
      off.toBlob(resolve, 'image/webp', 0.95);
    } else {
      // ImageData fallback
      const off = document.createElement('canvas');
      off.width = sourceCanvasOrImageData.width;
      off.height = sourceCanvasOrImageData.height;
      const octx = off.getContext('2d');
      octx.putImageData(sourceCanvasOrImageData, 0, 0);
      off.toBlob(resolve, 'image/webp', 0.95);
    }
  });

  if (!blob) return;

  // 3. Persist raw binary to IndexedDB
  try {
    const db = await getBinaryDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TILE_STORE, 'readwrite');
      tx.objectStore(TILE_STORE).put(blob, compositeKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[BinaryTileStore] Failed to write tile blob to IDB:', err);
  }
}

/**
 * Retrieves a tile as a drawable ImageBitmap, utilizing VRAM cache first,
 * falling back to binary IndexedDB, with zero Base64 conversion.
 */
export async function getBinaryTile(compositeKey) {
  // Check VRAM cache (RAM)
  const cached = vramCache.get(compositeKey);
  if (cached) return cached;

  // Fetch binary blob from IndexedDB (Disk)
  try {
    const db = await getBinaryDB();
    const blob = await new Promise((resolve) => {
      const tx = db.transaction(TILE_STORE, 'readonly');
      const req = tx.objectStore(TILE_STORE).get(compositeKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (!blob) return null;

    // Decode binary directly into GPU-backed ImageBitmap
    const bitmap = await createImageBitmap(blob);
    vramCache.set(compositeKey, bitmap);
    return bitmap;
  } catch (err) {
    return null;
  }
}

/**
 * Removes a tile from both VRAM and persistent disk.
 */
export async function deleteBinaryTile(compositeKey) {
  vramCache.delete(compositeKey);
  try {
    const db = await getBinaryDB();
    return new Promise((resolve) => {
      const tx = db.transaction(TILE_STORE, 'readwrite');
      tx.objectStore(TILE_STORE).delete(compositeKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    // Non-fatal
  }
}
