// src/js/storage/archiveFormat.js
/**
 * .ANIMSTUDIO ARCHIVE FORMAT SERIALIZER
 * Packs projects into chunked packages with raw binary tiles.
 */

import JSZip from 'jszip';
import { getBinaryTile, buildTileKey } from './binaryTileStore.js';

/**
 * Serializes project into binary package data.
 */
export async function packProjectToArchive(project) {
  const manifest = {
    format: 'animstudio-archive',
    version: 2,
    id: project.id,
    name: project.name,
    width: project.width,
    height: project.height,
    fps: project.fps,
    camera: project.camera,
    backgroundColor: project.backgroundColor,
    layers: project.layers
  };

  const timeline = {
    frames: project.frames.map((f) => ({
      id: f.id,
      duration: f.duration || 1,
      tag: f.tag || null,
      layerData: Object.keys(f.layerData || {}).reduce((acc, layerId) => {
        acc[layerId] = {
          strokes: f.layerData[layerId].strokes || [],
          tileKeys: Object.keys(f.layerData[layerId].tiles || {})
        };
        return acc;
      }, {})
    }))
  };

  const tilesBinaryMap = {}; // key -> Array of bytes (for Rust IPC)
  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('timeline.json', JSON.stringify(timeline, null, 2));

  // Extract raw binary buffers for each active tile
  for (const frame of project.frames) {
    for (const layer of project.layers) {
      const lData = frame.layerData?.[layer.id];
      if (!lData?.tiles) continue;

      for (const coords of Object.keys(lData.tiles)) {
        const compKey = buildTileKey(project.id, frame.id, layer.id, coords);
        const bitmap = await getBinaryTile(compKey);

        if (bitmap) {
          const off = document.createElement('canvas');
          off.width = bitmap.width;
          off.height = bitmap.height;
          const octx = off.getContext('2d');
          octx.drawImage(bitmap, 0, 0);

          const blob = await new Promise((resolve) => {
            if (off.toBlob) {
              off.toBlob(resolve, 'image/webp', 0.95);
            } else {
              resolve(null);
            }
          });

          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);

            const safeKey = `${frame.id}_${layer.id}_${coords.replace(',', '_')}`;
            tilesBinaryMap[safeKey] = Array.from(uint8); // Rust IPC map
            zip.file(`tiles/${safeKey}.webp`, uint8);
          }
        }
      }
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    manifestJson: JSON.stringify(manifest),
    timelineJson: JSON.stringify(timeline),
    tilesBinaryMap,
    blob
  };
}

/**
 * Unpacks an .animstudio container back into a memory-managed project.
 */
export async function unpackProjectArchive(loadedDataOrFile) {
  let manifest, timeline, zip;

  if (loadedDataOrFile && loadedDataOrFile.manifest_json) {
    // Loaded via Tauri Rust IPC
    manifest = JSON.parse(loadedDataOrFile.manifest_json);
    timeline = JSON.parse(loadedDataOrFile.timeline_json);
  } else {
    // Loaded via Web File Handle or Blob
    zip = await JSZip.loadAsync(loadedDataOrFile);
    const mStr = await zip.file('manifest.json').async('text');
    const tStr = await zip.file('timeline.json').async('text');
    manifest = JSON.parse(mStr);
    timeline = JSON.parse(tStr);
  }

  const project = {
    ...manifest,
    frames: timeline.frames.map((f) => {
      const layerData = {};
      for (const [layerId, ld] of Object.entries(f.layerData || {})) {
        const tiles = {};
        for (const coords of (ld.tileKeys || [])) {
          tiles[coords] = true; // Flag presence; loaded on demand by binary store
        }
        layerData[layerId] = {
          strokes: ld.strokes || [],
          tiles
        };
      }
      return {
        id: f.id,
        duration: f.duration || 1,
        tag: f.tag || null,
        layerData
      };
    })
  };

  return project;
}
