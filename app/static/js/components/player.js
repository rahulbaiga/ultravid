/**
 * UltraVid Video Player & Downloads Component
 * Tokenized Invalidation Lifecycle & In-DOM Error State Machine
 * YouTube Mobile UI/UX Parity: Edge-to-Edge Player, Horizontal Action Pills, Buffer-Gated Deferred Up Next Feed
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { fmtDur, fmtViews, isUrl, refreshIcons } = window.UltraVid.utils;

  const escapeHtml = (window.UltraVid && window.UltraVid.utils && window.UltraVid.utils.escapeHtml)
    || function(str) {
      return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[m]);
    };

  let homeView = null;
  let watchView = null;
  let videoEl = null;
  let playerSpinner = null;
  let playerBigPlayBtn = null;
  let playerErrorOverlay = null;
  let playerRetryBtn = null;
  let playerErrorMsg = null;
  let likeBtn = null;
  let likeCount = null;
  let dislikeBtn = null;
  let shareBtn = null;
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

  // Tokenized Invalidation Pattern (Request Generation Counter)
  let currentPlaybackToken = 0;
  let lastFailedItem = null;
  let currentBufferCheckCleanup = null;

  function init(callbacks = {}) {
    homeView = document.getElementById("tab-home") || document.getElementById("homeView");
    watchView = document.getElementById("watchView");
    dlOverlay = document.getElementById("dlOverlay");
    dlSheet = document.getElementById("dlSheet");
    dlClose = document.getElementById("dlClose");
    dlList = document.getElementById("dlList");
    dlStatus = document.getElementById("dlStatus");
    mp3Btn = document.getElementById("mp3Btn");

    if (dlClose) dlClose.onclick = closeDownloads;
    if (dlOverlay) {
      dlOverlay.onclick = (e) => {
        if (e.target === dlOverlay) closeDownloads();
      };
    }
    if (mp3Btn) {
      mp3Btn.onclick = () => startDownload("mp3", true);
    }

    const qOverlay = document.getElementById("qualityOverlay");
    const qClose = document.getElementById("qualityCloseBtn");
    if (qClose) qClose.onclick = closeQualityPicker;
    if (qOverlay) {
      qOverlay.onclick = (e) => {
        if (e.target === qOverlay) closeQualityPicker();
      };
    }
  }

  function renderWatchView(container, videoData) {
    const title = videoData.title || 'Untitled Video';
    const channel = videoData.channel || videoData.uploader || videoData.channelTitle || 'Creator';
    const views = videoData.views
      ? `${videoData.views} views`
      : (videoData.view_count ? `${fmtViews(videoData.view_count)} views` : 'Popular');
    const duration = videoData.duration_string || (videoData.duration ? fmtDur(videoData.duration) : '');
    const uploadDate = videoData.upload_date || videoData.uploaded || 'Recently';
    const avatarLetter = (channel[0] || 'U').toUpperCase();
    const likes = videoData.likes || (videoData.like_count ? fmtViews(videoData.like_count) : 'Like');
    const subCount = videoData.subscribers || '1.4M subscribers';
    const commentsCount = videoData.comment_count ? fmtViews(videoData.comment_count) : '80';
    const topComment = videoData.top_comment || 'Amazing high quality video! Thanks for sharing this.';

    container.innerHTML = `
      <div class="watch-container">
        <!-- 1. Full 16:9 Edge-to-Edge Player Viewport -->
        <div class="player-viewport-wrapper">
          <button class="player-floating-back" id="playerBackBtn" aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <video id="mainVideoPlayer" controls autoplay playsinline preload="auto" poster="${videoData.thumbnail || ''}">
            <source src="${videoData.stream_url || videoData.url || ''}" type="video/mp4">
          </video>
          <!-- Center Buffer Spinner -->
          <div id="playerSpinner" class="player-spinner hidden">
            <div class="spinner-ring"></div>
          </div>
          <!-- Autoplay Policy Fallback Big Play Button -->
          <button type="button" id="playerBigPlayBtn" class="player-big-play-btn hidden" aria-label="Play">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
          <!-- In-DOM Error & Retry Overlay -->
          <div id="playerErrorOverlay" class="player-error-overlay hidden">
            <div class="player-error-icon" style="font-size:28px">⚠️</div>
            <div id="playerErrorMsg" class="player-error-msg" style="font-size:14px;color:#eee">An error occurred. Please try again.</div>
            <button type="button" id="playerRetryBtn" class="player-retry-btn">Tap to retry</button>
          </div>
        </div>

        <!-- 2. Video Info Block -->
        <div class="watch-info-section">
          <h1 class="watch-video-title" id="wTitle">${escapeHtml(title)}</h1>
          <div class="watch-meta-row" id="wMeta">
            <span id="wViews">${views}</span>
            <span>•</span>
            <span id="wDate">${uploadDate}</span>
            <span class="meta-more-btn" id="metaMoreBtn">...more</span>
          </div>
          <div id="watchDescription" class="watch-description hidden" style="font-size:12px;color:#ccc;line-height:1.4;margin:8px 0;background:rgba(255,255,255,0.05);padding:10px 12px;border-radius:8px;white-space:pre-wrap;"></div>

          <!-- 3. Channel Row & Subscribe Pill -->
          <div class="watch-channel-row">
            <div class="channel-info-left">
              <div class="channel-avatar-img" id="wAvatar" style="display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;">
                ${avatarLetter}
              </div>
              <div class="channel-text-wrap">
                <span class="channel-display-name" id="wChannel">${escapeHtml(channel)}</span>
                <span class="channel-sub-count" id="wSubCount">${subCount}</span>
              </div>
            </div>
            <button class="btn-youtube-subscribe" id="subscribeBtn">Subscribe</button>
          </div>

          <!-- 4. Action Pills Bar -->
          <div class="watch-action-bar">
            <div class="action-pill-segmented">
              <button id="likeBtn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                <span id="likeCount">${likes}</span>
              </button>
              <div class="segment-divider"></div>
              <button id="dislikeBtn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>
              </button>
            </div>

            <button class="action-pill" id="shareBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
              <span>Share</span>
            </button>

            <button class="action-pill" id="downloadActionBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Download</span>
            </button>

            <button class="action-pill" id="qualitySelectorBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              <span id="activeQualityLabel">720p</span>
            </button>
          </div>
        </div>

        <!-- 5. Comments Teaser Card -->
        <div class="watch-comments-teaser" id="commentsTeaserCard">
          <div class="comments-teaser-header">
            <span class="comments-teaser-title">Comments</span>
            <span class="comments-teaser-count">${videoData.comment_count ? fmtViews(videoData.comment_count) : '80'}</span>
          </div>
          <div class="comments-teaser-preview">
            <div class="comments-user-avatar"></div>
            <span class="comments-preview-text">${escapeHtml(videoData.top_comment || 'Amazing high quality video! Thanks for sharing this.')}</span>
          </div>
        </div>

        <!-- 6. Up Next Section (Lightweight Placeholder - 0 Initial Network Calls) -->
        <div class="watch-up-next-section">
          <div class="up-next-heading">Up next</div>
          <div id="upNextContainer">
            <div class="up-next-skeleton-box" style="padding:16px;text-align:center;color:#666;font-size:12px;">
              Suggestions will load once playback stabilizes...
            </div>
          </div>
        </div>
      </div>
    `;

    // Back button wiring
    const backBtn = document.getElementById('playerBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeWatch();
      });
    }

    bindWatchEvents();
  }

  function bindWatchEvents() {
    videoEl = document.getElementById("mainVideoPlayer") || document.getElementById("mainVideo");
    playerSpinner = document.getElementById("playerSpinner");
    playerBigPlayBtn = document.getElementById("playerBigPlayBtn");
    playerErrorOverlay = document.getElementById("playerErrorOverlay");
    playerRetryBtn = document.getElementById("playerRetryBtn");
    playerErrorMsg = document.getElementById("playerErrorMsg");
    likeBtn = document.getElementById("likeBtn");
    likeCount = document.getElementById("likeCount");
    dislikeBtn = document.getElementById("dislikeBtn");
    shareBtn = document.getElementById("shareBtn");
    const downloadActionBtn = document.getElementById("downloadActionBtn");
    const qualitySelectorBtn = document.getElementById("qualitySelectorBtn");
    const subscribeBtn = document.getElementById("subscribeBtn");
    const commentsTeaserCard = document.getElementById("commentsTeaserCard");
    const metaMoreBtn = document.getElementById("metaMoreBtn");

    if (videoEl) {
      videoEl.addEventListener("waiting", () => {
        if (playerSpinner) playerSpinner.classList.remove("hidden");
      });
      videoEl.addEventListener("playing", () => {
        if (playerSpinner) playerSpinner.classList.add("hidden");
        if (playerBigPlayBtn) playerBigPlayBtn.classList.add("hidden");
        hidePlayerErrorState();
      });
      videoEl.addEventListener("canplay", () => {
        if (playerSpinner) playerSpinner.classList.add("hidden");
      });
      videoEl.addEventListener("error", () => {
        if (playerSpinner) playerSpinner.classList.add("hidden");
      });
    }

    if (playerBigPlayBtn) {
      playerBigPlayBtn.onclick = () => {
        if (videoEl) {
          const p = videoEl.play();
          if (p !== undefined) {
            p.then(() => {
              if (playerBigPlayBtn) playerBigPlayBtn.classList.add("hidden");
              if (playerSpinner) playerSpinner.classList.add("hidden");
              hidePlayerErrorState();
            }).catch(err => {
              console.warn("Manual play attempt failed:", err);
            });
          }
        }
      };
    }

    if (playerRetryBtn) {
      playerRetryBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (lastFailedItem) {
          hidePlayerErrorState();
          loadAndPlay(lastFailedItem);
        }
      };
    }

    if (subscribeBtn) {
      let isSubscribed = false;
      subscribeBtn.onclick = () => {
        isSubscribed = !isSubscribed;
        if (isSubscribed) {
          subscribeBtn.textContent = 'Subscribed';
          subscribeBtn.classList.add('subscribed');
          showToast('Subscribed to ' + (currentData?.channel || currentData?.uploader || 'channel'));
        } else {
          subscribeBtn.textContent = 'Subscribe';
          subscribeBtn.classList.remove('subscribed');
          showToast('Subscription removed');
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
          if (likeCount) likeCount.textContent = fmtViews(likeN + 1);
        } else {
          likeBtn.classList.remove("active");
          if (likeCount) likeCount.textContent = likeN > 0 ? fmtViews(likeN) : "Like";
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
          if (likeCount) likeCount.textContent = likeN > 0 ? fmtViews(likeN) : "Like";
        }
      };
    }

    if (shareBtn) {
      shareBtn.onclick = async () => {
        const sUrl = currentUrl || window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title: currentData?.title || 'UltraVid', url: sUrl });
          } else {
            await navigator.clipboard.writeText(sUrl);
            showToast('Link copied to clipboard!');
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            prompt('Copy link:', sUrl);
          }
        }
      };
    }

    if (downloadActionBtn) {
      downloadActionBtn.onclick = () => openDownloads();
    }

    if (qualitySelectorBtn) {
      qualitySelectorBtn.onclick = () => openQualityPicker();
    }

    if (commentsTeaserCard) {
      commentsTeaserCard.onclick = () => {
        showToast('Comments feature coming soon!');
      };
    }

    if (metaMoreBtn) {
      metaMoreBtn.onclick = () => {
        const descEl = document.getElementById('watchDescription');
        if (!descEl) return;
        const isHidden = descEl.classList.contains('hidden');
        if (isHidden) {
          descEl.textContent = (currentData && currentData.description) ? currentData.description : 'No additional description provided.';
          descEl.classList.remove('hidden');
          metaMoreBtn.textContent = 'Show less';
        } else {
          descEl.classList.add('hidden');
          metaMoreBtn.textContent = '...more';
        }
      };
    }
  }

  function showToast(msg) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.className = 'toast-notification hidden';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2200);
  }

  function showPlayerErrorState(item, msg = "An error occurred. Please try again.") {
    lastFailedItem = item;
    if (playerSpinner) playerSpinner.classList.add("hidden");
    if (playerBigPlayBtn) playerBigPlayBtn.classList.add("hidden");
    if (playerErrorMsg) playerErrorMsg.textContent = msg;
    if (playerErrorOverlay) playerErrorOverlay.classList.remove("hidden");
  }

  function hidePlayerErrorState() {
    if (playerErrorOverlay) playerErrorOverlay.classList.add("hidden");
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

  function renderRelatedVideos(relList) {
    const upNextEl = document.getElementById("upNextContainer");
    if (!upNextEl) return;
    upNextEl.innerHTML = "";
    if (!relList || !relList.length) {
      upNextEl.innerHTML = `<div style="color:#888;font-size:13px;padding:12px 0;">No related videos found.</div>`;
      return;
    }
    const fragment = document.createDocumentFragment();
    relList.forEach(it => {
      const card = document.createElement("div");
      card.className = "up-next-card";
      const durBadge = (it.duration_string || (it.duration ? fmtDur(it.duration) : ''))
        ? `<span class="dur-badge">${it.duration_string || fmtDur(it.duration)}</span>`
        : '';
      const views = it.views ? `${fmtViews(it.views)} views` : (it.view_count ? `${fmtViews(it.view_count)} views` : 'Popular');
      const timeAgo = it.upload_date || it.uploaded || '';
      const metaText = [views, timeAgo].filter(Boolean).join(' • ');

      card.innerHTML = `
        <div class="up-next-thumb-wrap">
          <img src="${it.thumbnail || ''}" loading="lazy" decoding="async" alt="${escapeHtml(it.title || '')}" />
          ${durBadge}
        </div>
        <div class="up-next-info">
          <div class="up-next-title">${escapeHtml(it.title || 'Untitled')}</div>
          <div class="up-next-channel">${escapeHtml(it.uploader || it.channel || it.channelTitle || '')}</div>
          <div class="up-next-meta">${metaText}</div>
        </div>
        <button type="button" class="up-next-more-btn" aria-label="More options">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="12" cy="19" r="2"></circle>
          </svg>
        </button>
      `;

      card.onclick = (e) => {
        if (e.target.closest('.up-next-more-btn')) {
          e.stopPropagation();
          if (window.UltraVid && window.UltraVid.actionSheet) {
            window.UltraVid.actionSheet.open(it);
          }
          return;
        }
        loadAndPlay(it);
      };

      fragment.appendChild(card);
    });
    upNextEl.appendChild(fragment);
  }

  // Phase 3: Buffer-Gated & Playback-Stabilized Deferred Up Next Engine
  function attachBufferGatedUpNextLoader(videoElement, videoId, category, queryTitle, thisToken, targetUrl) {
    if (currentBufferCheckCleanup) {
      currentBufferCheckCleanup();
      currentBufferCheckCleanup = null;
    }

    if (!videoElement) return;

    let upNextLoaded = false;
    let playbackTimer = null;

    function cleanup() {
      videoElement.removeEventListener('timeupdate', onBufferCheck);
      videoElement.removeEventListener('playing', onPlaying);
      if (playbackTimer) {
        clearTimeout(playbackTimer);
        playbackTimer = null;
      }
    }

    currentBufferCheckCleanup = cleanup;

    function triggerUpNextFetch() {
      if (upNextLoaded) return;
      if (thisToken !== currentPlaybackToken || !isWatchOpen || currentUrl !== targetUrl) {
        cleanup();
        return;
      }
      upNextLoaded = true;
      cleanup();

      console.log('[PERF] Playback buffer healthy. Initiating deferred Up Next loading.');

      const deferMethod = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
      deferMethod(() => {
        fetchAndRenderUpNext(videoId, category, queryTitle, thisToken, targetUrl);
      });
    }

    function onBufferCheck() {
      if (videoElement.buffered && videoElement.buffered.length > 0) {
        const current = videoElement.currentTime || 0;
        let forwardBuffer = 0;
        for (let i = 0; i < videoElement.buffered.length; i++) {
          if (videoElement.buffered.start(i) <= current && current <= videoElement.buffered.end(i)) {
            forwardBuffer = videoElement.buffered.end(i) - current;
            break;
          }
        }
        const maxDur = videoElement.duration;
        // User criteria: 15 to 20 seconds forward buffer loaded, or near end for short clips
        if (forwardBuffer >= 15 || (maxDur && !isNaN(maxDur) && maxDur < 15 && forwardBuffer >= maxDur - 1)) {
          triggerUpNextFetch();
        }
      }
    }

    function onPlaying() {
      // Fallback: If buffer API reports slowly, trigger after 3.5s of smooth playback
      if (!playbackTimer) {
        playbackTimer = setTimeout(() => {
          triggerUpNextFetch();
        }, 3500);
      }
    }

    videoElement.addEventListener('timeupdate', onBufferCheck);
    videoElement.addEventListener('playing', onPlaying);
  }

  async function fetchAndRenderUpNext(videoId, category, queryTitle, thisToken, targetUrl) {
    if (thisToken !== currentPlaybackToken || !isWatchOpen || currentUrl !== targetUrl) return;

    const upNextEl = document.getElementById("upNextContainer");
    if (!upNextEl) return;

    // Show non-blocking shimmer placeholder while fetching
    upNextEl.innerHTML = `
      <div class="up-next-card" style="opacity:0.6;pointer-events:none;">
        <div class="up-next-thumb-wrap skel"></div>
        <div class="up-next-info">
          <div class="skel" style="height:14px;width:80%;margin-bottom:6px;"></div>
          <div class="skel" style="height:11px;width:50%;"></div>
        </div>
      </div>
      <div class="up-next-card" style="opacity:0.6;pointer-events:none;">
        <div class="up-next-thumb-wrap skel"></div>
        <div class="up-next-info">
          <div class="skel" style="height:14px;width:75%;margin-bottom:6px;"></div>
          <div class="skel" style="height:11px;width:40%;"></div>
        </div>
      </div>
    `;

    let rel = [];
    try {
      const q = queryTitle || (currentData?.title || "").split(" ").slice(0, 3).join(" ");
      if (q) {
        const rr = await window.UltraVid.api.fetchSearch(q, { maxResults: 8 });
        rel = (rr && rr.results) || [];
      }
      if (!rel.length && category) {
        const rr = await window.UltraVid.api.fetchFeed({ category, limit: 8 });
        rel = (rr && rr.results) || [];
      }
    } catch (e) {
      console.warn('[PERF] Up Next deferred fetch error:', e);
    }

    if (thisToken !== currentPlaybackToken || !isWatchOpen || currentUrl !== targetUrl) return;

    const filtered = rel.filter(x => x.url !== targetUrl && x.id !== videoId);
    renderRelatedVideos(filtered);
  }

  function openWatch(url, preview = null) {
    currentUrl = url;
    isWatchOpen = true;

    // Phase 1: Immediately cancel all pending background requests to guarantee 100% video bandwidth
    if (window.UltraVid && window.UltraVid.api && typeof window.UltraVid.api.abortAllBackgroundRequests === 'function') {
      window.UltraVid.api.abortAllBackgroundRequests();
    }

    // Apply route-level class to hide app header and zero-out padding
    document.body.classList.add('watch-route-active');

    const vidId = extractVideoId(url, preview);
    try {
      if (!history.state || history.state.view !== "watch" || history.state.id !== vidId) {
        history.pushState({ view: "watch", id: vidId }, "", "#watch/" + vidId);
      }
    } catch (e) {}

    // Hide active tabs and display watch view
    document.querySelectorAll('.tab-view').forEach(t => {
      t.classList.remove("active-tab");
      t.classList.add("hidden");
    });

    const watchViewEl = document.getElementById("watchView") || watchView;
    if (watchViewEl) {
      watchViewEl.classList.remove("hidden");
      renderWatchView(watchViewEl, preview || { url });
    }

    // Set player state to LOADING
    if (playerSpinner) playerSpinner.classList.remove("hidden");
    if (playerBigPlayBtn) playerBigPlayBtn.classList.add("hidden");
    hidePlayerErrorState();

    // Reset interactive controls
    liked = false;
    disliked = false;
    likeN = preview && preview.like_count ? (parseInt(preview.like_count) || 0) : 0;
    if (likeCount) likeCount.textContent = likeN > 0 ? fmtViews(likeN) : "Like";
    if (likeBtn) likeBtn.classList.remove("active");
    if (dislikeBtn) dislikeBtn.classList.remove("active");

    window.scrollTo({ top: 0, behavior: "instant" });
    refreshIcons();
  }

  async function hydrateWatchDetails(url, d, lastQuery = "", thisToken = null) {
    if (thisToken !== null && thisToken !== currentPlaybackToken) return;
    if (!isWatchOpen || currentUrl !== url) return;

    currentData = d;

    const playables = (d.playable_streams && d.playable_streams.length ? d.playable_streams : (d.progressive_streams || []));
    const rawUrl = d.default_play_url || (playables[0] && playables[0].url) || "";
    const defUrl = rawUrl ? (rawUrl.startsWith("http") ? `/api/proxy?url=${encodeURIComponent(rawUrl)}` : rawUrl) : "";

    const activeH = (playables[0] && playables[0].height) || 720;
    const qLabel = document.getElementById("activeQualityLabel");
    if (qLabel) qLabel.textContent = `${activeH}p`;

    if (videoEl && defUrl) {
      videoEl.src = defUrl;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (thisToken !== null && thisToken !== currentPlaybackToken) return;
          if (playerSpinner) playerSpinner.classList.add("hidden");
          if (playerBigPlayBtn) playerBigPlayBtn.classList.add("hidden");
          hidePlayerErrorState();
        }).catch(err => {
          if (thisToken !== null && thisToken !== currentPlaybackToken) return;
          console.warn("Autoplay blocked or deferred by browser policy:", err);
          if (playerSpinner) playerSpinner.classList.add("hidden");
          if (playerBigPlayBtn) playerBigPlayBtn.classList.remove("hidden");
        });
      }
    } else {
      if (playerSpinner) playerSpinner.classList.add("hidden");
      if (!defUrl) {
        showPlayerErrorState(currentData || { url }, "No playable stream found for this video.");
        return;
      }
    }

    const titleEl = document.getElementById("wTitle");
    if (titleEl) titleEl.textContent = d.title || "Video";

    const ch = d.channel || d.uploader || "Unknown";
    const channelEl = document.getElementById("wChannel");
    if (channelEl) channelEl.textContent = ch;

    const avatarEl = document.getElementById("wAvatar");
    if (avatarEl) avatarEl.textContent = ((ch.trim().charAt(0) || "U")).toUpperCase();

    const viewsEl = document.getElementById("wViews");
    if (viewsEl) viewsEl.textContent = `${fmtViews(d.view_count)} views`;

    const dateEl = document.getElementById("wDate");
    if (dateEl) dateEl.textContent = d.upload_date || d.uploaded || "Recently";

    liked = false;
    disliked = false;
    likeN = parseInt(d.like_count) || 0;
    if (likeCount) likeCount.textContent = likeN > 0 ? fmtViews(likeN) : "Like";
    if (likeBtn) likeBtn.classList.remove("active");
    if (dislikeBtn) dislikeBtn.classList.remove("active");

    refreshIcons();

    // Phase 3: Attach buffer-gated deferred loader (100% bandwidth dedicated to stream startup)
    attachBufferGatedUpNextLoader(
      videoEl,
      d.id || extractVideoId(url, d),
      d.category || '',
      (lastQuery && !isUrl(lastQuery)) ? lastQuery : (d.title || "").split(" ").slice(0, 3).join(" "),
      thisToken,
      url
    );
  }

  async function loadAndPlay(itemOrUrl, lastQuery = "") {
    let url = "";
    let preview = null;

    if (typeof itemOrUrl === "object" && itemOrUrl !== null) {
      preview = itemOrUrl;
      url = itemOrUrl.url || "";
    } else if (typeof itemOrUrl === "string") {
      url = itemOrUrl;
      preview = { url: itemOrUrl };
    }

    if (!url) return;

    // Phase 1: Immediately cancel any background requests before stream extraction
    if (window.UltraVid && window.UltraVid.api && typeof window.UltraVid.api.abortAllBackgroundRequests === 'function') {
      window.UltraVid.api.abortAllBackgroundRequests();
    }

    const thisToken = ++currentPlaybackToken;
    lastFailedItem = preview;

    openWatch(url, preview);

    try {
      const d = await window.UltraVid.api.extractStream(url);

      if (thisToken !== currentPlaybackToken || !isWatchOpen || currentUrl !== url) {
        return;
      }

      if (!d || d.detail) throw new Error(d ? d.detail : "Extraction failed");

      await hydrateWatchDetails(url, d, lastQuery, thisToken);
    } catch (err) {
      if (thisToken !== currentPlaybackToken) return;

      const isAbort = err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'));
      if (isAbort) return;

      console.error('[PlayerEngine] Stream playback failed:', err);
      showPlayerErrorState(preview, "Can't play this video • Tap to retry");
    }
  }

  function pause() {
    if (videoEl) videoEl.pause();
  }

  function teardownWatchUI() {
    currentPlaybackToken++;
    pause();

    if (currentBufferCheckCleanup) {
      currentBufferCheckCleanup();
      currentBufferCheckCleanup = null;
    }

    document.body.classList.remove('watch-route-active');

    const player = document.getElementById("mainVideoPlayer") || document.getElementById("mainVideo") || videoEl;
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    if (playerSpinner) playerSpinner.classList.add("hidden");
    if (playerBigPlayBtn) playerBigPlayBtn.classList.add("hidden");
    hidePlayerErrorState();

    const watchViewEl = document.getElementById("watchView") || watchView;
    if (watchViewEl) {
      watchViewEl.classList.add("hidden");
      watchViewEl.innerHTML = "";
    }

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

  function openQualityPicker() {
    const overlay = document.getElementById('qualityOverlay');
    const sheet = document.getElementById('qualitySheet');
    const list = document.getElementById('qualityOptionsList');
    if (!overlay || !sheet || !list) return;

    list.innerHTML = '';
    const d = currentData;
    const playables = (d && ((d.playable_streams && d.playable_streams.length) ? d.playable_streams : (d.progressive_streams || []))) || [];

    if (!playables.length) {
      list.innerHTML = `<div class="mut" style="text-align:center;padding:12px;">Default stream active (auto)</div>`;
    } else {
      const sorted = [...playables].sort((a, b) => (b.height || 0) - (a.height || 0));
      sorted.forEach(f => {
        const pUrl = f.url && f.url.startsWith("http") ? `/api/proxy?url=${encodeURIComponent(f.url)}` : (f.url || "");
        const isSelected = videoEl && videoEl.src && (videoEl.src.includes(encodeURIComponent(f.url)) || videoEl.src === f.url || videoEl.src === pUrl);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qa-btn';
        btn.style.justifyContent = 'space-between';
        btn.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span style="font-weight:${isSelected ? '700' : '500'};color:${isSelected ? '#fff' : '#f1f1f1'}">${f.height}p ${f.height >= 720 ? 'HD' : ''} • ${f.ext}</span>
          </div>
          ${isSelected ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3ea6ff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        `;
        btn.onclick = () => {
          if (videoEl && pUrl) {
            const ct = videoEl.currentTime;
            videoEl.src = pUrl;
            videoEl.currentTime = ct;
            const p = videoEl.play();
            if (p !== undefined) p.catch(() => {});
            const qLabel = document.getElementById('activeQualityLabel');
            if (qLabel) qLabel.textContent = `${f.height}p`;
            showToast(`Switched quality to ${f.height}p`);
          }
          closeQualityPicker();
        };
        list.appendChild(btn);
      });
    }

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.remove('sheet-hidden'));
  }

  function closeQualityPicker() {
    const overlay = document.getElementById('qualityOverlay');
    const sheet = document.getElementById('qualitySheet');
    if (sheet) sheet.classList.add('sheet-hidden');
    if (overlay) setTimeout(() => overlay.classList.add('hidden'), 250);
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
    renderWatchView,
    loadAndPlay,
    openWatch,
    hydrateWatchDetails,
    pause,
    showHomeView,
    closeWatch,
    teardownWatchUI,
    getIsWatchOpen: () => isWatchOpen,
    openQualityPicker,
    closeQualityPicker,
    openDownloads,
    closeDownloads,
    startDownload,
    getCurrentUrl,
    setCurrentUrl,
    showPlayerErrorState,
    hidePlayerErrorState,
    attachBufferGatedUpNextLoader
  };
})();
