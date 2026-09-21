// src/js/project/history.js
import { commandManager, SnapshotCommand } from './commandManager.js';
import { scheduleAutosave } from './autosave.js';
import { state } from '../state/appState.js';

let lastSnapshot = null;

export async function undo() {
  await commandManager.undo();
  scheduleAutosave(true);
}

export async function redo() {
  await commandManager.redo();
  scheduleAutosave(true);
}

/**
 * Universal state recorder:
 * When operations (like layer changes, frame additions, shape commits) call saveHistoryState(),
 * this creates an undoable snapshot so nothing is lost.
 */
export function saveHistoryState(actionDescription = 'Change') {
  if (!state.project) return;

  const currentProjectJson = JSON.stringify(state.project);
  const currentProjectParsed = JSON.parse(currentProjectJson);

  if (!lastSnapshot) {
    lastSnapshot = currentProjectParsed;
    commandManager.notifyUI();
    scheduleAutosave(true);
    return;
  }

  // If state actually changed, push an undoable command
  if (JSON.stringify(lastSnapshot) !== currentProjectJson) {
    const cmd = new SnapshotCommand(actionDescription, lastSnapshot, currentProjectParsed);
    commandManager.undoStack.push(cmd);
    if (commandManager.undoStack.length > commandManager.maxDepth) {
      commandManager.undoStack.shift();
    }
    commandManager.clearRedoStack();
    lastSnapshot = currentProjectParsed;
    commandManager.saveHistoryToStorage();
  }

  commandManager.notifyUI();
  scheduleAutosave(true);
}

export function resetHistoryTracking(project) {
  lastSnapshot = project ? JSON.parse(JSON.stringify(project)) : null;
}

export function updateUndoRedoButtons() {
  commandManager.notifyUI();
}
