// Simple in-memory snapshot + localStorage helpers for later use
const KEY = 'sb.charDraft';

export const sessionState = {
  me: null,
  getDraft(){ try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  setDraft(d){ localStorage.setItem(KEY, JSON.stringify(d || null)); },
  clearDraft(){ localStorage.removeItem(KEY); },
};
