// src/js/project/hardwareWatchdog.js
import { state } from '../state/appState.js';
import { flushAutosave } from './autosave.js';
import { showToast } from '../ui/toast.js';

let batteryRef = null;

export async function initHardwareWatchdog() {
  // 1. Hook Battery Status API if supported by the browser
  if ('getBattery' in navigator) {
    try {
      const battery = await navigator.getBattery();
      batteryRef = battery;

      const checkBatteryStatus = () => {
        const pct = Math.round(battery.level * 100);
        const isDischarging = !battery.charging;

        // If unplugged and battery is critical (< 15%), emergency save immediately
        if (isDischarging && pct <= 15) {
          flushAutosave();
          showToast(`BATTERY CRITICAL (${pct}%) — Emergency Snapshot Saved!`, 'error');
        }
      };

      // Power cord yanked / sudden charger flicker
      battery.addEventListener('chargingchange', () => {
        if (!battery.charging) {
          flushAutosave();
          showToast('Power disconnected! Emergency snapshot baked.', 'error');
        } else {
          showToast('Power restored. Charging.', 'info');
        }
      });

      battery.addEventListener('levelchange', checkBatteryStatus);
      checkBatteryStatus();
    } catch (e) {
      console.warn('[Watchdog] Battery API unsupported or restricted.');
    }
  }

  // 2. Storage Quota Check
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(({ quota, usage }) => {
      const usedMB = Math.round(usage / (1024 * 1024));
      const totalMB = Math.round(quota / (1024 * 1024));
      console.log(`[Watchdog] Storage Shield: ${usedMB} MB used of ${totalMB} MB quota`);
    });
  }

  // 3. One-Touch Emergency Backup Shortcut: Ctrl+Shift+S
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      quickEmergencyDownload();
    }
  });
}

/**
 * Downloads an emergency JSON file to your local disk with a single keypress,
 * with zero dialog boxes or confirmations.
 */
export function quickEmergencyDownload() {
  if (!state.project) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${(state.project.name || 'project').toLowerCase().replace(/\s+/g, '_')}_EMERGENCY_${stamp}.animstudio.json`;

  const payload = {
    format: 'animation-studio-project',
    formatVersion: 1,
    emergencySavedAt: new Date().toISOString(),
    project: state.project,
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  showToast('Emergency snapshot downloaded to disk!', 'info');
}
