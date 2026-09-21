// src/js/storage/mediaVault.js
/**
 * PERMANENT MEDIA VAULT
 * Stores and recovers reference images and video blobs in IndexedDB.
 * Prevents images from disappearing when project closes.
 */
const DB_NAME = 'mannsejro_media_vault';
const DB_VERSION = 1;
const STORE_MEDIA = 'media_blobs';

let dbPromise = null;

function getMediaDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/**
 * Converts a File or Blob into a permanent Base64 Data URL
 */
export function fileToDataUrl(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * Persists a media Blob in IndexedDB
 */
export async function persistMediaBlob(id, blob) {
  try {
    const db = await getMediaDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      tx.objectStore(STORE_MEDIA).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[MediaVault] Failed to persist blob:', err);
  }
}

/**
 * Retrieves a persisted Blob from IndexedDB
 */
export async function getPersistedMediaBlob(id) {
  try {
    const db = await getMediaDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const req = tx.objectStore(STORE_MEDIA).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Self-healing reference restorer:
 * Runs when any project is loaded. Revives dead blob: URLs using persistent DataURLs or IndexedDB Blobs.
 */
export async function restoreProjectMedia(project) {
  if (!project || !Array.isArray(project.referenceMedia)) return;

  for (const ref of project.referenceMedia) {
    // 1. If persistent dataUrl exists, use it directly (never dies)
    if (ref.dataUrl && typeof ref.dataUrl === 'string' && ref.dataUrl.startsWith('data:')) {
      ref.url = ref.dataUrl;
      continue;
    }

    // 2. If it was a dead blob: URL, retrieve the raw Blob from the Media Vault
    if (ref.url && ref.url.startsWith('blob:')) {
      const storedBlob = await getPersistedMediaBlob(ref.id);
      if (storedBlob) {
        ref.url = URL.createObjectURL(storedBlob);
      }
    }
  }

  // Also restore perspective image texture if present on frames/strokes
  if (project.frames) {
    for (const frame of project.frames) {
      if (!frame.layerData) continue;
      for (const layerId in frame.layerData) {
        const strokes = frame.layerData[layerId]?.strokes;
        if (!strokes) continue;
        for (const stroke of strokes) {
          if (stroke.textureDataUrl && !stroke.textureImage) {
            const img = new Image();
            img.src = stroke.textureDataUrl;
            stroke.textureImage = img;
          }
        }
      }
    }
  }
}
