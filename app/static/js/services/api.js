/**
 * UltraVid API Service & Core Utilities
 */
window.UltraVid = window.UltraVid || {};

(function() {
  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function fmtDur(s) {
    if (s === null || s === undefined || s === "") return "";
    if (typeof s === "string" && s.includes(":")) return s;
    s = parseInt(s);
    if (isNaN(s)) return "";
    let m = Math.floor(s / 60), sec = s % 60, h = Math.floor(m / 60);
    m = m % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }

  function fmtViews(n) {
    if (!n && n !== 0) return "";
    n = parseInt(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K views";
    return n + " views";
  }

  function isUrl(s) {
    return /^https?:\/\//i.test((s || "").trim()) || /^(www\.|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com)/i.test((s || "").trim());
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      try { window.lucide.createIcons(); return; } catch (e) {}
    }
    // Local SVG fallback for offline WebView environments without CDN
    document.querySelectorAll("i[data-lucide]").forEach(el => {
      if (el.getAttribute("data-rendered")) return;
      const name = el.getAttribute("data-lucide");
      el.setAttribute("data-rendered", "true");
      if (name === "home") {
        el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
      } else if (name === "flame") {
        el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
      } else if (name === "download") {
        el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';
      } else if (name === "more-vertical") {
        el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
      } else if (name === "search") {
        el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
      } else if (name === "music") {
        el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      } else if (name === "share-2") {
        el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
      } else if (name === "arrow-left") {
        el.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
      } else if (name === "arrow-up-left") {
        el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17V7h10"/><path d="M17 17 7 7"/></svg>';
      } else if (name === "x") {
        el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      } else if (name === "play") {
        el.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
    });
  }

  async function fetchApi(endpoint, options = {}) {
    const timeoutMs = options.timeout || 25000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // Support external signal chaining
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      const fetchOpts = {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.headers || {})
        }
      };

      if (fetchOpts.body && typeof fetchOpts.body === "string" && !fetchOpts.headers["Content-Type"]) {
        fetchOpts.headers["Content-Type"] = "application/json";
      }

      const res = await fetch(endpoint, fetchOpts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Request failed with status ${res.status}`);
      }
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let feedAbortController = null;

  function getFeedSignal() {
    if (!feedAbortController) {
      feedAbortController = new AbortController();
    }
    return feedAbortController.signal;
  }

  function abortAllBackgroundRequests() {
    if (feedAbortController) {
      try {
        feedAbortController.abort();
      } catch (e) {}
      feedAbortController = null;
      console.log('[NETWORK] Aborted all pending background feed requests for playback priority.');
    }
  }

  async function fetchFeed(params = {}, opts = {}) {
    const passedSignal = params.signal || (opts && opts.signal);
    const bgSignal = getFeedSignal();

    let effectiveSignal = bgSignal;
    if (passedSignal) {
      const chainedController = new AbortController();
      if (passedSignal.aborted || bgSignal.aborted) {
        chainedController.abort();
      } else {
        passedSignal.addEventListener("abort", () => chainedController.abort(), { once: true });
        bgSignal.addEventListener("abort", () => chainedController.abort(), { once: true });
      }
      effectiveSignal = chainedController.signal;
    }

    const { page = 1, limit = 12, seed = 0, category = 'all', refresh = false } = params;
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      seed: String(seed),
      category: category || 'all',
      t: String(Date.now())
    });
    if (refresh) {
      qs.set('refresh', 'true');
    }
    return fetchApi(`/api/feed?${qs.toString()}`, { signal: effectiveSignal });
  }

  async function fetchSearch(query, params = {}) {
    const { maxResults = 15, page = 1, signal } = params;
    const qs = new URLSearchParams({
      q: query,
      max_results: String(maxResults),
      page: String(page)
    });
    return fetchApi(`/api/search?${qs.toString()}`, { signal });
  }

  const prewarmedStreams = new Map();

  function prefetchStream(videoId) {
    if (!videoId) return;
    const cleanId = (typeof videoId === "string" && (videoId.includes("=") || videoId.includes("/")))
      ? (videoId.match(/(?:v=|youtu\.be\/|shorts\/|^)([A-Za-z0-9_-]{11})(?:[&?]|$)/) || [])[1] || videoId
      : videoId;
    if (!cleanId || prewarmedStreams.has(cleanId)) return;

    const fetchPromise = fetch(`/api/stream/resolve?id=${encodeURIComponent(cleanId)}`)
      .then(res => res.ok ? res.json() : null)
      .catch(err => {
        console.log('[PREFETCH ERR]', err);
        prewarmedStreams.delete(cleanId);
        return null;
      });

    prewarmedStreams.set(cleanId, fetchPromise);
    // Auto expire after 90 seconds
    setTimeout(() => prewarmedStreams.delete(cleanId), 90000);
  }

  async function fetchSuggestions(query, signal) {
    const qs = new URLSearchParams({ q: query });
    return fetchApi(`/api/suggest?${qs.toString()}`, { signal, timeout: 5000 });
  }

  async function extractStream(urlOrId, attempt = 1, signal = null) {
    if (signal && signal.aborted) {
      const err = new Error("AbortError");
      err.name = "AbortError";
      throw err;
    }

    let cleanId = "";
    if (typeof urlOrId === "string") {
      const match = urlOrId.match(/(?:v=|youtu\.be\/|shorts\/|^)([A-Za-z0-9_-]{11})(?:[&?]|$)/);
      if (match) cleanId = match[1];
    }

    // Fast-path: Return pre-warmed promise immediately if touched before click
    if (cleanId && prewarmedStreams.has(cleanId)) {
      try {
        const data = await prewarmedStreams.get(cleanId);
        if (data && !data.detail) {
          console.log('[PREWARM HIT] Instant playback payload loaded for:', cleanId);
          return data;
        }
      } catch (e) {
        prewarmedStreams.delete(cleanId);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      // Direct call to fast stream resolver
      const resolveUrl = cleanId
        ? `/api/stream/resolve?id=${encodeURIComponent(cleanId)}`
        : `/api/stream/resolve?url=${encodeURIComponent(urlOrId)}`;

      const resp = await fetch(resolveUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const result = await resp.json();
        if (cleanId) {
          prewarmedStreams.set(cleanId, Promise.resolve(result));
          setTimeout(() => prewarmedStreams.delete(cleanId), 90000);
        }
        return result;
      }

      // Fallback to /api/stream?url= or POST /api/extract
      const fb = await fetch(`/api/stream?url=${encodeURIComponent(urlOrId)}`, { signal: controller.signal });
      if (!fb.ok) {
        const fbPost = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlOrId }),
          signal: controller.signal
        });
        if (!fbPost.ok) {
          const errData = await fbPost.json().catch(() => ({}));
          throw new Error(errData.detail || `Stream HTTP ${resp.status}`);
        }
        return await fbPost.json();
      }
      return await fb.json();
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'));
      if (isAbort && attempt < 2 && (!signal || !signal.aborted)) {
        console.warn(`[StreamExtractor] Attempt ${attempt} timed out. Initiating retry...`);
        await new Promise(res => setTimeout(res, 600));
        return extractStream(urlOrId, attempt + 1, signal);
      }
      throw err;
    }
  }

  async function startDownload(url, quality = '720', audioOnly = false) {
    return fetchApi('/api/download', {
      method: 'POST',
      body: JSON.stringify({
        url,
        quality: String(quality),
        audio_only: Boolean(audioOnly)
      })
    });
  }

  async function getDownloadStatus(taskId) {
    return fetchApi(`/api/downloads/status/${encodeURIComponent(taskId)}`);
  }

  window.UltraVid.utils = {
    escapeHtml,
    fmtDur,
    fmtViews,
    isUrl,
    refreshIcons
  };

  const apiService = {
    fetchApi,
    fetchFeed,
    fetchSearch,
    fetchSuggestions,
    prefetchStream,
    extractStream,
    startDownload,
    getDownloadStatus,
    getFeedSignal,
    abortAllBackgroundRequests
  };

  window.UltraVid.api = apiService;
  window.api = apiService;
  window.apiService = apiService;
  window.abortAllBackgroundRequests = abortAllBackgroundRequests;
  window.getFeedSignal = getFeedSignal;
})();
