/**
 * UltraVid Video Player & Downloads Component
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { fmtDur, fmtViews, isUrl, refreshIcons } = window.UltraVid.utils;

  let homeView = null;
  let watchView = null;
  let videoEl = null;
  let backBtn = null;
  let wTitle = null;
  let wChannel = null;
  let wMeta = null;
  let wAvatar = null;
  let likeBtn = null;
  let likeCount = null;
  let dislikeBtn = null;
  let qualitySel = null;
  let shareBtn = null;
  let shareMsg = null;
  let relatedEl = null;
  let dlOpenBtn = null;
  let dlOverlay = null;
  let dlSheet = null;
  let dlClose = null;
  let dlList = null;
  let dlStatus = null;
  let mp3Btn = null;

  let currentData = null;
  let currentUrl = "";
  let isWatchOpen = false;
  let liked = false;
  let disliked = false;
  let likeN = 0;
  let downloadPollTimer = null;

  function init(callbacks = {}) {
    homeView = document.getElementById("tab-home") || document.getElementById("homeView");
    watchView = document.getElementById("watchView");
    videoEl = document.getElementById("videoEl");
    backBtn = document.getElementById("backBtn") || document.getElementById("watchBackBtn");
    wTitle = document.getElementById("wTitle");
    wChannel = document.getElementById("wChannel");
    wMeta = document.getElementById("wMeta");
    wAvatar = document.getElementById("wAvatar");
    likeBtn = document.getElementById("likeBtn");
    likeCount = document.getElementById("likeCount");
    dislikeBtn = document.getElementById("dislikeBtn");
    qualitySel = document.getElementById("qualitySel");
    shareBtn = document.getElementById("shareBtn");
    shareMsg = document.getElementById("shareMsg");
    relatedEl = document.getElementById("related");
    dlOpenBtn = document.getElementById("dlOpenBtn");
    dlOverlay = document.getElementById("dlOverlay");
    dlSheet = document.getElementById("dlSheet");
    dlClose = document.getElementById("dlClose");
    dlList = document.getElementById("dlList");
    dlStatus = document.getElementById("dlStatus");
    mp3Btn = document.getElementById("mp3Btn");

    if (backBtn) {
      backBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (history.state && history.state.view === "watch") {
          history.back();
        } else {
          teardownWatchUI();
        }
      };
    }

    if (likeBtn) {
      likeBtn.onclick = () => {
        liked = !liked;
        if (liked) {
          disliked = false;
          if (dislikeBtn) dislikeBtn.classList.remove("active");
          likeBtn.classList.add("active");
          if (likeCount) likeCount.textContent = (likeN + 1) || "1";
        } else {
          likeBtn.classList.remove("active");
          if (likeCount) likeCount.textContent = likeN || "0";
        }
      };
    }

    if (dislikeBtn) {
      dislikeBtn.onclick = () => {
        disliked = !disliked;
        dislikeBtn.classList.toggle("active", disliked);
        if (disliked) {
          liked = false;
          if (likeBtn) likeBtn.classList.remove("active");
          if (likeCount) likeCount.textContent = likeN || "0";
        }
      };
    }

    if (shareBtn) {
      shareBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(currentUrl);
          if (shareMsg) {
            shareMsg.classList.remove("hidden");
            setTimeout(() => shareMsg.classList.add("hidden"), 2000);
          }
        } catch (e) {
          prompt("Copy link:", currentUrl);
        }
      };
    }

    if (qualitySel) {
      qualitySel.onchange = () => {
        if (!videoEl) return;
        const ct = videoEl.currentTime;
        videoEl.src = qualitySel.value;
        videoEl.currentTime = ct;
        videoEl.play().catch(() => {});
      };
    }

    if (dlOpenBtn) {
      dlOpenBtn.onclick = () => openDownloads();
    }
    if (dlClose) dlClose.onclick = closeDownloads;
    if (dlOverlay) {
      dlOverlay.onclick = (e) => {
        if (e.target === dlOverlay) closeDownloads();
      };
    }
    if (mp3Btn) {
      mp3Btn.onclick = () => startDownload("mp3", true);
    }
  }

  async function loadAndPlay(url, lastQuery = "") {
    try {
      const d = await window.UltraVid.api.extractStream(url);
      if (!d || d.detail) throw new Error(d ? d.detail : "Extraction failed");

      let rel = [];
      try {
        const q = (lastQuery && !isUrl(lastQuery)) ? lastQuery : (d.title || "").split(" ").slice(0, 3).join(" ");
        if (q) {
          const rr = await window.UltraVid.api.fetchSearch(q, { maxResults: 8 });
          rel = (rr && rr.results) || [];
        }
      } catch (e) {}

      openWatch(url, d, rel.filter(x => x.url !== url));
    } catch (e) {
      alert("Extract failed: " + e.message);
    }
  }

  function extractVideoId(url, d) {
    if (d && d.id) return d.id;
    try {
      const u = new URL(url);
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      if (u.hostname === "youtu.be") return u.pathname.slice(1);
    } catch (e) {}
    const m = String(url || "").match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    return (d && d.id) || "video";
  }

  function openWatch(url, d, rel) {
    currentData = d;
    currentUrl = url;
    isWatchOpen = true;

    const vidId = extractVideoId(url, d);
    try {
      if (!history.state || history.state.view !== "watch" || history.state.id !== vidId) {
        history.pushState({ view: "watch", id: vidId }, "", "#watch/" + vidId);
      }
    } catch (e) {}

    document.querySelectorAll('.tab-view').forEach(t => {
      t.classList.remove("active-tab");
      t.classList.add("hidden");
    });
    if (watchView) watchView.classList.remove("hidden");

    const playables = (d.playable_streams && d.playable_streams.length ? d.playable_streams : (d.progressive_streams || []));
    const rawUrl = d.default_play_url || (playables[0] && playables[0].url) || "";
    const defUrl = rawUrl ? (rawUrl.startsWith("http") ? `/api/proxy?url=${encodeURIComponent(rawUrl)}` : rawUrl) : "";

    if (videoEl) {
      videoEl.src = defUrl;
      videoEl.play().catch(() => {});
    }

    if (wTitle) wTitle.textContent = d.title || "Video";
    const ch = d.channel || d.uploader || "Unknown";
    if (wChannel) wChannel.textContent = ch;
    if (wAvatar) wAvatar.textContent = (ch[0] || "U").toUpperCase();

    const views = fmtViews(d.view_count);
    const dur = d.duration_string || fmtDur(d.duration);
    if (wMeta) wMeta.textContent = [views, dur, d.extractor].filter(Boolean).join(" • ");

    liked = false;
    disliked = false;
    likeN = parseInt(d.like_count) || 0;
    if (likeCount) likeCount.textContent = likeN > 0 ? likeN : "0";
    if (likeBtn) likeBtn.classList.remove("active");
    if (dislikeBtn) dislikeBtn.classList.remove("active");

    if (qualitySel) {
      qualitySel.innerHTML = "";
      if (!playables.length) {
        const o = document.createElement("option");
        o.textContent = "No playable stream";
        qualitySel.appendChild(o);
      } else {
        [...playables].sort((a, b) => (b.height || 0) - (a.height || 0)).forEach(f => {
          const o = document.createElement("option");
          const pUrl = f.url && f.url.startsWith("http") ? `/api/proxy?url=${encodeURIComponent(f.url)}` : (f.url || "");
          o.value = pUrl;
          o.textContent = `${f.height}p • ${f.ext}`;
          if (f.url === rawUrl || pUrl === defUrl) o.selected = true;
          qualitySel.appendChild(o);
        });
      }
    }

    if (relatedEl) {
      relatedEl.innerHTML = "";
      const fragment = document.createDocumentFragment();
      (rel || []).forEach(it => {
        const div = document.createElement("div");
        div.className = "rel";
        div.innerHTML = `
          <img src="${it.thumbnail || ''}" loading="lazy"/>
          <div style="flex:1;min-width:0">
            <div class="tt" style="min-height:0">${(it.title || "").slice(0, 100)}</div>
            <div class="ch">${it.uploader || it.channel || ""}</div>
          </div>
        `;
        div.onclick = () => loadAndPlay(it.url);
        fragment.appendChild(div);
      });
      relatedEl.appendChild(fragment);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    refreshIcons();
  }

  function pause() {
    if (videoEl) videoEl.pause();
  }

  function teardownWatchUI() {
    pause();
    const player = document.getElementById("videoEl") || document.getElementById("mainVideo");
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    const watchViewEl = document.getElementById("watchView") || watchView;
    if (watchViewEl) {
      watchViewEl.classList.add("hidden");
    }

    // Restore the active tier-1 tab (e.g. #tab-home)
    const feed = window.UltraVid.feed;
    if (feed && typeof feed.getCurrentTab === "function") {
      const activeTab = feed.getCurrentTab() || "home";
      const tabEl = document.getElementById(`tab-${activeTab}`) || document.getElementById("tab-home");
      if (tabEl) {
        tabEl.classList.remove("hidden");
        tabEl.classList.add("active-tab");
      }
      const feedStates = feed.getFeedStates ? feed.getFeedStates() : null;
      if (feedStates) {
        const cat = feed.getCurrentCategory ? feed.getCurrentCategory() : "all";
        const key = activeTab === "trending" ? "trending" : cat;
        if (feedStates[key]) {
          window.scrollTo(0, feedStates[key].scrollY || 0);
        }
      }
    } else {
      const activeTab = document.querySelector(".tab-view.active-tab") || document.getElementById("tab-home");
      if (activeTab) activeTab.classList.remove("hidden");
    }

    isWatchOpen = false;
  }

  function closeWatch() {
    if (history.state && history.state.view === "watch") {
      history.back();
    } else {
      teardownWatchUI();
    }
  }

  function showHomeView() {
    closeWatch();
  }

  function openDownloads(customUrl = null) {
    if (customUrl) currentUrl = customUrl;
    buildDlList();
    if (dlOverlay && dlSheet) {
      dlOverlay.classList.remove("hidden");
      requestAnimationFrame(() => dlSheet.classList.remove("sheet-hidden"));
    }
  }

  function closeDownloads() {
    if (dlSheet) dlSheet.classList.add("sheet-hidden");
    if (dlOverlay) setTimeout(() => dlOverlay.classList.add("hidden"), 250);
  }

  function buildDlList() {
    const d = currentData;
    if (!dlList) return;
    dlList.innerHTML = "";
    if (dlStatus) dlStatus.textContent = "";

    if (!d) {
      dlList.innerHTML = `<div class="mut" style="text-align:center;padding:16px;">Play a video or select an item to view download options.</div>`;
      return;
    }

    [2160, 1440, 1080, 720, 480, 360, 144].forEach(h => {
      const v = (d.video_streams || []).find(f => f.height === h) || (d.progressive_streams || []).find(f => f.height === h);
      const has = !!v;
      const row = document.createElement("div");
      row.className = "flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm";
      row.innerHTML = `<span class="font-bold w-20">${h === 2160 ? "4K 2160p" : h + "p"}</span><span class="text-white/50 text-xs flex-1">${has ? (v.ext + " • " + (v.filesize_human || "merged MP4")) + (h > 720 ? " • DASH→MP4" : " • playable") : "not available"}</span>`;
      const b = document.createElement("button");
      b.className = "rounded-lg px-3 py-1 text-xs font-bold " + (has ? "bg-rose-600" : "bg-white/10 text-white/30");
      b.textContent = has ? "⬇ MP4" : "—";
      b.disabled = !has;
      if (has) b.onclick = () => startDownload(h, false);
      row.appendChild(b);
      dlList.appendChild(row);
    });
  }

  async function startDownload(q, audioOnly = false, targetUrl = null) {
    const urlToDownload = targetUrl || currentUrl;
    if (!urlToDownload) return;
    if (dlStatus) dlStatus.textContent = "Queuing download…";
    try {
      const res = await window.UltraVid.api.startDownload(urlToDownload, q, audioOnly);
      if (!res || res.detail) throw new Error(res ? res.detail : "Download failed");
      pollStatus(res.task_id);
    } catch (e) {
      if (dlStatus) dlStatus.textContent = "Download error: " + e.message;
    }
  }

  function pollStatus(taskId) {
    clearInterval(downloadPollTimer);
    downloadPollTimer = setInterval(async () => {
      try {
        const j = await window.UltraVid.api.getDownloadStatus(taskId);
        if (j.status === "done") {
          clearInterval(downloadPollTimer);
          if (dlStatus) {
            dlStatus.innerHTML = `✅ Done: ${j.filename} — <a class="underline text-emerald-300" href="/api/downloads/file/${encodeURIComponent(j.filename)}">Save file</a>`;
          }
        } else if (j.status === "error") {
          clearInterval(downloadPollTimer);
          if (dlStatus) dlStatus.textContent = "❌ Failed: " + (j.error || "unknown");
        } else {
          if (dlStatus) dlStatus.textContent = `⏳ ${j.status} ${j.percent || 0}% ${j.filename || ""}`;
        }
      } catch (e) {
        clearInterval(downloadPollTimer);
        if (dlStatus) dlStatus.textContent = "Status error: " + e.message;
      }
    }, 1500);
  }

  function getCurrentUrl() {
    return currentUrl;
  }

  function setCurrentUrl(url) {
    currentUrl = url;
  }

  window.UltraVid.player = {
    init,
    loadAndPlay,
    openWatch,
    pause,
    showHomeView,
    closeWatch,
    teardownWatchUI,
    getIsWatchOpen: () => isWatchOpen,
    openDownloads,
    closeDownloads,
    startDownload,
    getCurrentUrl,
    setCurrentUrl
  };
})();
