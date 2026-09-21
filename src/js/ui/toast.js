let toastEl = null;
let toastTimer = 0;

export function showToast(message, kind = 'info') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'studio-toast';
    toastEl.className =
      'fixed bottom-48 left-1/2 -translate-x-1/2 z-[110] px-4 py-2 rounded-xl text-xs font-medium bg-slate-900/95 backdrop-blur-md border text-slate-100 shadow-2xl opacity-0 transition-opacity duration-200 pointer-events-none max-w-[70vw] text-center';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.toggle('border-orange-500/70', kind === 'error');
  toastEl.classList.toggle('text-orange-200', kind === 'error');
  toastEl.classList.toggle('border-blue-500/70', kind !== 'error');
  toastEl.classList.remove('opacity-0');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.classList.add('opacity-0');
  }, 1800);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}
