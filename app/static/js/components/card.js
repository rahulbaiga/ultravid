/**
 * UltraVid Video Card Component & Skeletons (YouTube Android Native Style)
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { escapeHtml, fmtDur, fmtViews } = window.UltraVid.utils;

  function createCard(it, callbacks = {}) {
    const div = document.createElement("div");
    div.className = "card";
    if (typeof callbacks.onPlay === "function") {
      div.onclick = () => callbacks.onPlay(it.url);
    }

    const dur = fmtDur(it.duration);
    const durBadge = dur ? `<span class="dur-badge">${dur}</span>` : "";
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
      d.className = 'card';
      d.innerHTML = `
        <div class="thumb-wrap">
          <div class="skel" style="width:100%;height:100%;border-radius:0;"></div>
        </div>
        <div class="card-body">
          <div class="skel card-avatar"></div>
          <div class="card-meta">
            <div class="skel" style="height:14px;margin-bottom:8px;border-radius:4px;width:90%"></div>
            <div class="skel" style="height:12px;width:60%;border-radius:4px"></div>
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
})();
