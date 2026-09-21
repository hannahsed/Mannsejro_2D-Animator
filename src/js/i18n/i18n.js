// src/js/i18n/i18n.js
/**
 * LIGHTWEIGHT I18N LOCALIZATION SYSTEM
 * Supports English, Japanese (日本語), and French (Français).
 */

const DICTIONARIES = {
  en: {
    'tools.brush': 'Master Brush',
    'tools.eraser': 'Vector Eraser',
    'tools.fill': 'Smart Fill',
    'tools.shape': 'Perspective Shape',
    'tools.select': 'Select & Transform',
    'tools.eyedropper': 'Eyedropper',
    'tools.hand': 'Hand Pan',
    'actions.save': 'Save',
    'actions.open': 'Open',
    'actions.export': 'Export',
    'actions.undo': 'Undo',
    'actions.redo': 'Redo',
    'actions.templates': 'Templates',
    'timeline.onionSkin': 'Onion Skin',
    'timeline.newFrame': 'New Frame',
    'timeline.hold': 'Hold',
    'layers.title': 'Layer Stack',
    'layers.persistent': 'Persistent (BG)',
    'export.title': 'Export Animation',
    'export.mp4': 'H.264 Video (MP4)',
    'export.gif': 'Animated GIF',
    'export.storyboard': 'Storyboard Contact Sheet',
    'export.frame': 'Keyframe PNG',
    'export.spritesheet': 'Spritesheet',
    'export.zip': 'PNG Sequence (ZIP)',
    'export.start': 'Start Export',
    'export.cancel': 'Cancel',
    'shortcuts.title': 'Keyboard Shortcuts & Studio Guide'
  },
  ja: {
    'tools.brush': 'マスターブラシ (B)',
    'tools.eraser': 'ベクター消しゴム (E)',
    'tools.fill': 'スマート塗りつぶし (G)',
    'tools.shape': 'パース図形 (U)',
    'tools.select': '選択・変形 (S)',
    'tools.eyedropper': 'スポイト (I)',
    'tools.hand': '手のひら (H)',
    'actions.save': '保存',
    'actions.open': '開く',
    'actions.export': '書き出し',
    'actions.undo': '元に戻す',
    'actions.redo': 'やり直し',
    'actions.templates': 'テンプレート',
    'timeline.onionSkin': 'オニオンスキン',
    'timeline.newFrame': '新規コマ',
    'timeline.hold': 'コマ送り',
    'layers.title': 'レイヤースタック',
    'layers.persistent': '固定背景 (BG)',
    'export.title': 'アニメーション書き出し',
    'export.mp4': 'MP4動画 (H.264)',
    'export.gif': 'GIFアニメーション',
    'export.storyboard': '絵コンテシート',
    'export.frame': '原画PNG (単一)',
    'export.spritesheet': 'スプライトシート',
    'export.zip': '連番PNG (ZIP)',
    'export.start': '書き出し開始',
    'export.cancel': 'キャンセル',
    'shortcuts.title': 'ショートカット & スタジオガイド'
  },
  fr: {
    'tools.brush': 'Pinceau Maître (B)',
    'tools.eraser': 'Gomme Vectorielle (E)',
    'tools.fill': 'Remplissage Intelligent (G)',
    'tools.shape': 'Forme Perspective (U)',
    'tools.select': 'Sélection & Transform (S)',
    'tools.eyedropper': 'Pipette (I)',
    'tools.hand': 'Main / Déplacement (H)',
    'actions.save': 'Enregistrer',
    'actions.open': 'Ouvrir',
    'actions.export': 'Exporter',
    'actions.undo': 'Annuler',
    'actions.redo': 'Rétablir',
    'actions.templates': 'Modèles',
    'timeline.onionSkin': "Pelure d'oignon",
    'timeline.newFrame': 'Nouveau dessin',
    'timeline.hold': 'Maintien',
    'layers.title': 'Pile de Calques',
    'layers.persistent': 'Arrière-plan Fixe',
    'export.title': 'Exporter Animation',
    'export.mp4': 'Vidéo MP4 (H.264)',
    'export.gif': 'GIF Animé',
    'export.storyboard': 'Planche Storyboard',
    'export.frame': 'Image Clé PNG',
    'export.spritesheet': 'Feuille de Sprites',
    'export.zip': 'Séquence PNG (ZIP)',
    'export.start': "Lancer l'export",
    'export.cancel': 'Annuler',
    'shortcuts.title': 'Raccourcis Clavier & Guide Studio'
  }
};

let currentLocale = (typeof localStorage !== 'undefined' && localStorage.getItem('mannsejro_locale')) || 'en';

export function t(key) {
  const dict = DICTIONARIES[currentLocale] || DICTIONARIES.en;
  return dict[key] || DICTIONARIES.en[key] || key;
}

export function setLocale(locale) {
  if (!DICTIONARIES[locale]) return;
  currentLocale = locale;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mannsejro_locale', locale);
  }
  applyTranslationsToDOM();
}

export function getLocale() {
  return currentLocale;
}

export function getAvailableLocales() {
  return [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'fr', label: 'Français' }
  ];
}

export function applyTranslationsToDOM() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const text = t(key);
    if (el.tagName === 'INPUT' && el.type === 'placeholder') {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    el.title = t(key);
  });
}
