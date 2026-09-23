/**
 * UltraVid Video Card Component & Skeletons (YouTube Android Native Style)
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { escapeHtml, fmtDur, fmtViews } = window.UltraVid.utils;

  function createCard(it, callbacks = {}) {
    const div = document.createElement("div");
    div.className = "card video-card";
    if (it && it.id) {
      div.setAttribute("data-id", it.id);
      div.setAttribute("data-vid", it.id);

      // Pre-warm on finger touchdown (gives ~200ms latency advantage)
      const doPrefetch = () => {
        const api = (window.UltraVid && window.UltraVid.api) || window.api;
        if (api && typeof api.prefetchStream === "function") {
          api.prefetchStream(it.id);
        }
      };
      div.addEventListener("touchstart", doPrefetch, { passive: true });
      div.addEventListener("pointerdown", doPrefetch, { passive: true });
      div.addEventListener("mouseenter", doPrefetch, { passive: true });
    }
    if (it && it.sub_topic) {
      div.setAttribute("data-subtopic", it.sub_topic);
    }
    if (typeof callbacks.onPlay === "function") {
      div.onclick = () => callbacks.onPlay(it);
    }

    const isLive = Boolean(it.isLive || it.duration === "LIVE" || (typeof it.duration === "string" && it.duration.toUpperCase() === "LIVE"));
    const dur = isLive ? "LIVE" : fmtDur(it.duration);
    const durBadge = dur ? `<span class="dur-badge ${isLive ? 'badge-live' : ''}">${dur}</span>` : "";
    const initial = ((it.channelTitle || it.uploader || it.channel || "U").trim().charAt(0) || "U").toUpperCase();
    const chTitle = escapeHtml(it.channelTitle || it.uploader || it.channel || "UltraVid");
    const views = escapeHtml(it.views || "100K+ views");
    const pubTime = escapeHtml(it.publishedTime || "Recently");

    const avatarHtml = it.channelAvatar
      ? `<img class="card-avatar" src="${escapeHtml(it.channelAvatar)}" alt="${chTitle}" loading="lazy" onerror="this.onerror=null;this.outerHTML='<div class=\\'card-avatar\\'>${initial}</div>'"/>`
      : `<div class="card-avatar">${initial}</div>`;

    div.innerHTML = `
      <div class="thumb-wrap">
        <img loading="lazy" src="${it.thumbnail || ''}" alt="${escapeHtml(it.title || '')}" onerror="this.src='https://i.ytimg.com/vi/placeholder/hqdefault.jpg'"/>
        ${durBadge}
      </div>
      <div class="card-body">
        ${avatarHtml}
        <div class="card-meta">
          <div class="card-title">${escapeHtml(it.title || 'Untitled')}</div>
          <div class="meta-line">${chTitle} • ${views} • ${pubTime}</div>
        </div>
        <button type="button" class="card-more" title="More options" aria-label="More options">
          <i data-lucide="more-vertical"></i>
        </button>
      </div>
    `;

    const moreBtn = div.querySelector(".card-more");
    if (moreBtn && typeof callbacks.onQuickAction === "function") {
      moreBtn.onclick = (e) => {
        e.stopPropagation();
        callbacks.onQuickAction(it);
      };
    }

    return div;
  }

  function renderSkeleton(gridEl, count = 6) {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.className = 'skeleton-card';
      d.innerHTML = `
        <div class="skeleton-thumb"></div>
        <div class="skeleton-meta">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line short"></div>
          </div>
        </div>
      `;
      fragment.appendChild(d);
    }
    gridEl.appendChild(fragment);
  }

  window.UltraVid.card = {
    createCard,
    renderSkeleton
  };
  window.CardComponent = window.UltraVid.card;
})();
