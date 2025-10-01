const DEFAULT_CONFIG = {
  endpoint: '/api/logs/batch',
  flushInterval: 750,
  maxBatch: 25,
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const PII_KEYS = new Set(['email', 'e-mail', 'ip', 'ip_address', 'ipaddress']);

let _config = { ...DEFAULT_CONFIG };
let _sessionId = createSessionId();
let _playerId = null;
let _queue = [];
let _flushTimer = null;
let _initialized = false;
let _isFlushing = false;
let _pendingFlush = false;
let _retryDelay = 0;
let _nextAllowedFlush = 0;

function createSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch (_) { /* ignore */ }
  }
  return `sess_${Math.random().toString(16).slice(2)}${Date.now()}`;
}

function deepCopy(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch (_) { /* ignore */ }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function scrub(value) {
  if (Array.isArray(value)) {
    return value.map((item) => scrub(item));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (PII_KEYS.has(key.toLowerCase())) {
        result[key] = '[redacted]';
      } else {
        result[key] = scrub(item);
      }
    }
    return result;
  }
  if (typeof value === 'string') {
    return value.replace(EMAIL_RE, '[redacted]').replace(IP_RE, '[redacted]');
  }
  return value;
}

function sanitizePayload(payload) {
  if (payload == null) return {};
  const copy = deepCopy(payload);
  if (typeof copy !== 'object' || Array.isArray(copy)) {
    return { value: scrub(copy) };
  }
  return scrub(copy);
}

function canFlush(force) {
  if (!force && _nextAllowedFlush && Date.now() < _nextAllowedFlush) {
    return false;
  }
  if (typeof navigator !== 'undefined' && Object.prototype.hasOwnProperty.call(navigator, 'onLine')) {
    if (navigator.onLine === false) {
      return false;
    }
  }
  return true;
}

async function flush(options = {}) {
  const force = options.force === true;
  if (_isFlushing) {
    _pendingFlush = true;
    return;
  }
  if (!_queue.length || !canFlush(force)) {
    return;
  }

  const batch = _queue.splice(0, _config.maxBatch);
  const body = JSON.stringify({
    session_id: _sessionId,
    events: batch,
  });

  _isFlushing = true;
  try {
    const response = await fetch(_config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body,
    });
    if (!response.ok) {
      throw new Error('Request failed');
    }
    _retryDelay = 0;
    _nextAllowedFlush = 0;
  } catch (_) {
    _queue.unshift(...batch);
    _retryDelay = _retryDelay ? Math.min(_retryDelay * 2, 10000) : 1000;
    _nextAllowedFlush = Date.now() + _retryDelay;
  } finally {
    _isFlushing = false;
    const shouldRetry = _pendingFlush || _queue.length >= _config.maxBatch;
    _pendingFlush = false;
    if (_queue.length && shouldRetry) {
      flush({ force });
    }
  }
}

function handleBeforeUnload() {
  if (!_queue.length) return;
  if (typeof navigator === 'undefined') return;
  const payload = {
    session_id: _sessionId,
    events: _queue.splice(0),
  };
  const data = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const blob = new Blob([data], { type: 'application/json' });
    const sent = navigator.sendBeacon(_config.endpoint, blob);
    if (!sent) {
      _queue.unshift(...payload.events);
    }
  } else {
    fetch(_config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: data,
      keepalive: true,
    }).catch(() => {
      _queue.unshift(...payload.events);
    });
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    flush({ force: true });
  }
}

function ensureInitialized() {
  if (_initialized) return;
  _initialized = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flush({ force: true }));
    window.addEventListener('beforeunload', handleBeforeUnload);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}

function applyConfig(options = {}) {
  const cfg = { ...options };
  if (typeof cfg.sessionId === 'string' && cfg.sessionId.trim()) {
    _sessionId = cfg.sessionId;
  }
  delete cfg.sessionId;

  _config = { ..._config, ...cfg };
  if (_flushTimer) {
    clearInterval(_flushTimer);
  }
  _flushTimer = setInterval(() => {
    flush();
  }, _config.flushInterval);
}

function enqueue(level, event, payload = {}, extra = {}) {
  if (!event || typeof event !== 'string') return;
  const sanitized = sanitizePayload(payload);
  const player = extra.player_id != null ? extra.player_id : _playerId;
  const timestamp = typeof extra.ts === 'string' ? extra.ts : new Date().toISOString();

  _queue.push({
    level,
    event,
    player_id: player ?? null,
    ts: timestamp,
    payload: sanitized,
  });

  if (_queue.length >= _config.maxBatch) {
    flush({ force: true });
  }
}

export const GameLogger = {
  init(options = {}) {
    ensureInitialized();
    applyConfig(options);
  },
  setSession(id) {
    if (typeof id === 'string' && id.trim()) {
      _sessionId = id;
    }
  },
  setPlayer(id) {
    if (id === null || id === undefined) {
      _playerId = null;
    } else {
      _playerId = String(id);
    }
  },
  info(event, payload = {}, extra = {}) {
    enqueue('info', event, payload, extra);
  },
  warn(event, payload = {}, extra = {}) {
    enqueue('warn', event, payload, extra);
  },
  error(event, payload = {}, extra = {}) {
    enqueue('error', event, payload, extra);
  },
  flushNow() {
    return flush({ force: true });
  },
};

ensureInitialized();
_applyConfigOnStart();

function _applyConfigOnStart() {
  if (!_flushTimer) {
    _flushTimer = setInterval(() => {
      flush();
    }, _config.flushInterval);
  }
}
