// src/js/project/commandManager.js
/**
 * UNIFIED COMMAND PATTERN & PERSISTENT HISTORY ENGINE
 * - Captures Vector Strokes, Shapes, Raster Tiles, Layers, and Frames.
 * - Saves undo history stack to IndexedDB ('mannsejro_history_vault').
 * - Preserves undo ability even after closing and reopening a project.
 */
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { requestRender } from '../render/renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { renderLayersList } from '../ui/layersUI.js';
import { scheduleAutosave } from './autosave.js';

const HISTORY_DB_NAME = 'mannsejro_history_vault';
const STORE_NAME = 'project_undo_stacks';

let histDbPromise = null;
function getHistoryDB() {
  if (!histDbPromise) {
    histDbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(HISTORY_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return histDbPromise;
}

export class CommandManager {
  constructor(maxDepth = 25) {
    this.maxDepth = maxDepth;
    this.undoStack = [];
    this.redoStack = [];
    this.isExecuting = false;
  }

  async execute(command) {
    if (this.isExecuting) return;
    this.isExecuting = true;
    try {
      await command.execute();
      this.undoStack.push(command);
      if (this.undoStack.length > this.maxDepth) {
        const discarded = this.undoStack.shift();
        if (discarded && typeof discarded.dispose === 'function') {
          discarded.dispose();
        }
      }
      this.clearRedoStack();
      this.notifyUI();
      scheduleAutosave(true);
      await this.saveHistoryToStorage();
    } finally {
      this.isExecuting = false;
    }
  }

  async undo() {
    if (this.undoStack.length === 0 || this.isExecuting) return;
    this.isExecuting = true;
    try {
      const command = this.undoStack.pop();
      await command.undo();
      this.redoStack.push(command);
      this.notifyUI();
      scheduleAutosave(true);
      await this.saveHistoryToStorage();
    } finally {
      this.isExecuting = false;
    }
  }

  async redo() {
    if (this.redoStack.length === 0 || this.isExecuting) return;
    this.isExecuting = true;
    try {
      const command = this.redoStack.pop();
      await command.redo();
      this.undoStack.push(command);
      this.notifyUI();
      scheduleAutosave(true);
      await this.saveHistoryToStorage();
    } finally {
      this.isExecuting = false;
    }
  }

  clearRedoStack() {
    while (this.redoStack.length > 0) {
      const cmd = this.redoStack.pop();
      if (cmd && typeof cmd.dispose === 'function') {
        cmd.dispose();
      }
    }
  }

  clearAll() {
    while (this.undoStack.length > 0) {
      const cmd = this.undoStack.pop();
      if (cmd && typeof cmd.dispose === 'function') cmd.dispose();
    }
    this.clearRedoStack();
    this.notifyUI();
  }

  notifyUI() {
    const btnUndo = elements?.btnUndo || (typeof document !== 'undefined' ? document.getElementById('btn-undo') : null);
    const btnRedo = elements?.btnRedo || (typeof document !== 'undefined' ? document.getElementById('btn-redo') : null);
    if (btnUndo) btnUndo.disabled = this.undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
    if (typeof window !== 'undefined') {
      requestRender();
      renderTimelineFilmstrip();
      renderLayersList();
    }
  }

  /**
   * Persists the serialized undo stack to IndexedDB so it survives project reloads.
   */
  async saveHistoryToStorage() {
    if (!state.project?.id) return;
    try {
      const db = await getHistoryDB();
      if (!db) return;

      const serializableUndo = this.undoStack.map((cmd) => cmd.serialize?.() || null).filter(Boolean);
      const serializableRedo = this.redoStack.map((cmd) => cmd.serialize?.() || null).filter(Boolean);

      const payload = {
        projectId: state.project.id,
        savedAt: Date.now(),
        undo: serializableUndo,
        redo: serializableRedo,
      };

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(payload, state.project.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('[History] Failed to persist undo stack:', e);
    }
  }

  /**
   * Restores the undo stack when a project is reopened.
   */
  async restoreHistoryForProject(projectId) {
    this.clearAll();
    if (!projectId) return;

    try {
      const db = await getHistoryDB();
      if (!db) return;

      const record = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(projectId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (!record) return;

      if (Array.isArray(record.undo)) {
        for (const item of record.undo) {
          const cmd = deserializeCommand(item);
          if (cmd) this.undoStack.push(cmd);
        }
      }
      if (Array.isArray(record.redo)) {
        for (const item of record.redo) {
          const cmd = deserializeCommand(item);
          if (cmd) this.redoStack.push(cmd);
        }
      }
      this.notifyUI();
    } catch (err) {
      console.warn('[History] Error restoring undo stack:', err);
    }
  }
}

export const commandManager = new CommandManager();

// =========================================================================
// CONCRETE SERIALIZABLE COMMANDS
// =========================================================================

/**
 * 1. Vector Stroke & Shape Command (Pencil, Rectangle, Perspective, Node Quad)
 */
export class AddStrokeCommand {
  constructor(frameId, layerId, strokeData) {
    this.type = 'add_stroke';
    this.frameId = frameId;
    this.layerId = layerId;
    this.stroke = strokeData;
  }

  async execute() {
    const frame = state.project?.frames?.find((f) => f.id === this.frameId) || currentFrame();
    if (!frame) return;
    const lData = frame.layerData[this.layerId] || (frame.layerData[this.layerId] = { tiles: {}, strokes: [] });
    if (!lData.strokes) lData.strokes = [];
    const exists = lData.strokes.some((s) => s.id === this.stroke.id);
    if (!exists) {
      lData.strokes.push(this.stroke);
    }
  }

  async undo() {
    const frame = state.project?.frames?.find((f) => f.id === this.frameId) || currentFrame();
    if (!frame) return;
    const lData = frame.layerData[this.layerId];
    if (lData?.strokes) {
      const idx = lData.strokes.findIndex((s) => s.id === this.stroke.id);
      if (idx !== -1) lData.strokes.splice(idx, 1);
    }
  }

  async redo() {
    await this.execute();
  }

  serialize() {
    return {
      type: this.type,
      frameId: this.frameId,
      layerId: this.layerId,
      stroke: this.stroke,
    };
  }
}

/**
 * 2. Tile Region Delta Command (Pixel Paint, Eraser, Flood Fill)
 */
export class TileDeltaCommand {
  constructor(frameId, layerId, beforeTiles, afterTiles) {
    this.type = 'tile_delta';
    this.frameId = frameId;
    this.layerId = layerId;
    this.before = beforeTiles;
    this.after = afterTiles;
  }

  _apply(map) {
    const frame = state.project?.frames?.find((f) => f.id === this.frameId) || currentFrame();
    if (!frame) return;
    const store = frame.layerData[this.layerId] || (frame.layerData[this.layerId] = { tiles: {}, strokes: [] });
    const tiles = store.tiles || (store.tiles = {});
    for (const k in map) {
      if (map[k] == null) delete tiles[k];
      else tiles[k] = map[k];
    }
  }

  async execute() {
    this._apply(this.after);
  }

  async undo() {
    this._apply(this.before);
  }

  async redo() {
    this._apply(this.after);
  }

  serialize() {
    return {
      type: this.type,
      frameId: this.frameId,
      layerId: this.layerId,
      before: this.before,
      after: this.after,
    };
  }

  dispose() {
    this.before = null;
    this.after = null;
  }
}

/**
 * 3. Universal State Snapshot Command (Frame & Layer Reorder, Add, Delete)
 */
export class SnapshotCommand {
  constructor(description, beforeProject, afterProject) {
    this.type = 'snapshot';
    this.description = description;
    this.before = beforeProject;
    this.after = afterProject;
  }

  async execute() {
    if (this.after) {
      state.project = JSON.parse(JSON.stringify(this.after));
    }
  }

  async undo() {
    if (this.before) {
      state.project = JSON.parse(JSON.stringify(this.before));
    }
  }

  async redo() {
    await this.execute();
  }

  serialize() {
    return {
      type: this.type,
      description: this.description,
      before: this.before,
      after: this.after,
    };
  }
}

export class FrameStructureCommand {
  constructor(description, applyFn, revertFn) {
    this.type = 'frame_structure';
    this.desc = description;
    this.applyFn = applyFn;
    this.revertFn = revertFn;
  }

  async execute() {
    if (this.applyFn) await this.applyFn();
  }

  async undo() {
    if (this.revertFn) await this.revertFn();
    renderLayersList();
  }

  async redo() {
    await this.execute();
  }
}

function deserializeCommand(data) {
  if (!data || !data.type) return null;
  if (data.type === 'add_stroke') {
    return new AddStrokeCommand(data.frameId, data.layerId, data.stroke);
  }
  if (data.type === 'tile_delta') {
    return new TileDeltaCommand(data.frameId, data.layerId, data.before, data.after);
  }
  if (data.type === 'snapshot') {
    return new SnapshotCommand(data.description, data.before, data.after);
  }
  return null;
}
