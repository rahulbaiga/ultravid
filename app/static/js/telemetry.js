/**
 * UltraVid Live Remote Telemetry & Observability Pipeline
 * Real-time event streaming from mobile device WebView / browser to backend STDOUT.
 */
(function() {
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origInfo = console.info.bind(console);

  let isDispatching = false;
  const queue = [];
  let flushTimer = null;

  function safeSerialize(obj, depth) {
    depth = depth || 0;
    if (obj === null || obj === undefined) return obj;
    if (depth > 2) return '[Deep Object]';
    if (typeof obj === 'function') return '[Function]';
    if (obj instanceof Error) {
      return { name: obj.name, message: obj.message, stack: obj.stack };
    }
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(i => safeSerialize(i, depth + 1));
    }
    const clean = {};
    let count = 0;
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        if (++count > 15) { clean['...'] = 'truncated'; break; }
        try {
          clean[k] = safeSerialize(obj[k], depth + 1);
        } catch (_) {
          clean[k] = '[Unserializable]';
        }
      }
    }
    return clean;
  }

  function flush() {
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    const bodyStr = JSON.stringify(batch);

    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([bodyStr], { type: 'application/json' });
        if (navigator.sendBeacon('/api/telemetry', blob)) {
          return;
        }
      } catch (_) {}
    }

    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  }

  function scheduleFlush(immediate) {
    if (immediate) {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, 50);
    }
  }

  function emit(tag, level, message, payload) {
    if (isDispatching) return;
    try {
      const entry = {
        tag: String(tag || 'CLIENT'),
        level: String(level || 'info'),
        message: String(message || ''),
        payload: payload !== undefined ? safeSerialize(payload) : undefined,
        timestamp: Date.now() / 1000
      };
      queue.push(entry);
      const isUrgent = level === 'error' || tag === 'PTR' || tag === 'REFRESH' || tag === 'STATE';
      scheduleFlush(isUrgent || queue.length >= 5);
    } catch (_) {}
  }

  // Intercept global console methods
  console.log = function(...args) {
    origLog(...args);
    if (!isDispatching) {
      isDispatching = true;
      try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(safeSerialize(a)) : String(a)).join(' ');
        emit('LOG', 'info', msg);
      } finally {
        isDispatching = false;
      }
    }
  };

  console.warn = function(...args) {
    origWarn(...args);
    if (!isDispatching) {
      isDispatching = true;
      try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(safeSerialize(a)) : String(a)).join(' ');
        emit('LOG', 'warn', msg);
      } finally {
        isDispatching = false;
      }
    }
  };

  console.error = function(...args) {
    origError(...args);
    if (!isDispatching) {
      isDispatching = true;
      try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(safeSerialize(a)) : String(a)).join(' ');
        emit('ERROR', 'error', msg);
      } finally {
        isDispatching = false;
      }
    }
  };

  console.info = function(...args) {
    origInfo(...args);
    if (!isDispatching) {
      isDispatching = true;
      try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(safeSerialize(a)) : String(a)).join(' ');
        emit('LOG', 'info', msg);
      } finally {
        isDispatching = false;
      }
    }
  };

  // Intercept unhandled errors & promise rejections
  window.addEventListener('error', (event) => {
    emit('ERROR', 'error', event.message || 'Script error', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error ? event.error.stack : null
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    emit('ERROR', 'error', 'Unhandled Promise Rejection: ' + (reason ? (reason.message || String(reason)) : ''), {
      stack: reason && reason.stack ? reason.stack : null
    });
  });

  window.telemetry = {
    emit: emit
  };

  emit('SYSTEM', 'info', 'UltraVid Remote Telemetry Engine Initialized');
})();
