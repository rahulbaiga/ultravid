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
  let playerErrorOverlay = null;
  let playerRetryBtn = null;
  let playerErrorMsg = null;
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
  let downloadPollTimer = null;

  let currentPlaybackToken = 0;
  let lastFailedItem = null;
  let currentBufferCheckCleanup = null;
  let customPlayerCleanup = null;
  let currentAvailableQualities = [];
  let activeQualityIndex = 0;

  // YouTube Mobile Queue & Settings State
  let playbackHistory = [];
  let currentVideoItem = null;
  let autoplayEnabled = true;
  let isLoopEnabled = false;
  let isScreenLocked = false;
  let currentPlaybackRate = 1.0;

  function showBufferSpinner() {
    const s = document.getElementById("playerBufferSpinner") || playerSpinner;
    if (s) s.classList.add("active");
  }

  function hideBufferSpinner() {
    const s = document.getElementById("playerBufferSpinner") || playerSpinner;
    if (s) s.classList.remove("active");
  }

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

    const descOverlay = document.getElementById("descriptionOverlay");
    const descClose = document.getElementById("closeDescBtn");
    if (descClose) descClose.onclick = closeDescriptionSheet;
    if (descOverlay) {
      descOverlay.onclick = (e) => {
        if (e.target === descOverlay) closeDescriptionSheet();
      };
    }
  }

  function formatLikeCount(count) {
    if (!count || count === 'Like') return 'Like';
    const num = parseInt(count, 10);
    if (isNaN(num)) return count;
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
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
        <div class="player-viewport-wrapper" id="customPlayerViewport">
          <!-- 1. Pure Video Tag (ZERO Native Controls) -->
          <video id="mainVideoPlayer" playsinline preload="auto" poster="${videoData.thumbnail || ''}">
            <source src="${videoData.stream_url || videoData.url || ''}" type="video/mp4">
          </video>

          <!-- Screen Lock Barrier -->
          <div class="screen-locked-barrier" id="screenLockBarrier"></div>
          <button class="unlock-toast-btn" id="unlockToastBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>Tap to unlock</span>
          </button>

          <!-- Buffer Spinner -->
          <div class="player-buffer-spinner" id="playerBufferSpinner">
            <svg viewBox="25 25 50 50"><circle cx="50" cy="50" r="20" fill="none"></circle></svg>
          </div>

          <!-- Gesture Zones for Double-Tap Skip -->
          <div class="gesture-zone left" id="gestureZoneLeft">
            <div class="skip-indicator" id="skipIndicatorLeft">◄◄ 10s</div>
          </div>
          <div class="gesture-zone right" id="gestureZoneRight">
            <div class="skip-indicator" id="skipIndicatorRight">10s ►►</div>
          </div>

          <!-- Custom Controls Overlay -->
          <div class="custom-player-overlay visible" id="customPlayerOverlay">
            <!-- Top Chrome -->
            <div class="player-top-chrome" id="playerTopChrome">
              <button class="player-floating-back" id="playerBackBtn" aria-label="Back">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <div class="player-top-actions">
                <div class="autoplay-toggle-pill active" id="autoplayTogglePill" title="Autoplay">
                  <div class="autoplay-toggle-thumb">
                    <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                  </div>
                </div>
                <button class="player-gear-btn" id="playerGearBtn" aria-label="Settings">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09A1.65 1.65 0 0 0-1.51 1z"></path></svg>
                </button>
              </div>
            </div>

            <!-- Center Stage Controls Trio -->
            <div class="player-center-trio">
              <button class="player-trio-btn nav-disabled" id="prevVideoBtn" aria-label="Previous">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5"></line></svg>
              </button>
              <button class="player-trio-btn center-play-main" id="centerPlayPauseBtn" aria-label="Play/Pause">
                <svg id="playIconSvg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <svg id="pauseIconSvg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              </button>
              <button class="player-trio-btn" id="nextVideoBtn" aria-label="Next">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"></line></svg>
              </button>
            </div>

            <!-- Bottom Controls Bar (Strictly Pinned to Bottom) -->
            <div class="player-bottom-bar" id="playerBottomBar">
              <div class="player-timeline-container" id="playerTimeline">
                <div class="timeline-track-bg">
                  <div class="timeline-buffer-bar" id="timelineBufferBar"></div>
                  <div class="timeline-progress-bar" id="timelineProgressBar"></div>
                  <div class="timeline-scrubber-thumb" id="timelineThumb"></div>
                </div>
              </div>
              <div class="player-bottom-row">
                <div class="player-time-display">
                  <span id="currentTimeLabel">0:00</span> / <span id="durationLabel">0:00</span>
                </div>
                <div class="player-right-btns">
                  <button class="player-mini-btn" id="playerFullscreenBtn" aria-label="Fullscreen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

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

          <!-- 3. Channel Row -->
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
          </div>

          <!-- 4. Action Pills Bar -->
          <div class="watch-action-bar">
            <div class="action-pill-segmented read-only-pill" title="Likes">
              <div class="pill-stat-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
                <span id="watchLikeCount">${formatLikeCount(videoData.likes || videoData.like_count)}</span>
              </div>
              <div class="segment-divider"></div>
              <div class="pill-stat-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
                </svg>
              </div>
            </div>

            <button class="action-pill" id="shareBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
              <span>Share</span>
            </button>

            <button class="action-pill" id="downloadActionBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Download</span>
            </button>
          </div>
        </div>

        <!-- 5. Up Next Section (Lightweight Placeholder - 0 Initial Network Calls) -->
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

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const sec = Math.floor(seconds % 60);
    const min = Math.floor((seconds / 60) % 60);
    const hrs = Math.floor(seconds / 3600);
    const sStr = sec < 10 ? '0' + sec : sec;
    if (hrs > 0) {
      const mStr = min < 10 ? '0' + min : min;
      return `${hrs}:${mStr}:${sStr}`;
    }
    return `${min}:${sStr}`;
  }

  function initializeCustomPlayer(video) {
    if (customPlayerCleanup) {
      customPlayerCleanup();
      customPlayerCleanup = null;
    }

    if (!video) return;

    const overlay = document.getElementById('customPlayerOverlay');
    const spinner = document.getElementById('playerBufferSpinner');
    const playPauseBtn = document.getElementById('centerPlayPauseBtn');
    const playIcon = document.getElementById('playIconSvg');
    const pauseIcon = document.getElementById('pauseIconSvg');
    const timeline = document.getElementById('playerTimeline');
    const progressBar = document.getElementById('timelineProgressBar');
    const bufferBar = document.getElementById('timelineBufferBar');
    const thumb = document.getElementById('timelineThumb');
    const currentLabel = document.getElementById('currentTimeLabel');
    const durationLabel = document.getElementById('durationLabel');
    const fullscreenBtn = document.getElementById('playerFullscreenBtn');
    const zoneLeft = document.getElementById('gestureZoneLeft');
    const zoneRight = document.getElementById('gestureZoneRight');
    const indLeft = document.getElementById('skipIndicatorLeft');
    const indRight = document.getElementById('skipIndicatorRight');

    if (!overlay || !playPauseBtn || !timeline) return;

    let hideTimer = null;
    let isDragging = false;

    function resetHideTimer() {
      clearTimeout(hideTimer);
      if (!video.paused) {
        hideTimer = setTimeout(() => {
          if (!isDragging && overlay) overlay.classList.remove('visible');
        }, 2800);
      }
    }

    function showOverlay() {
      if (overlay) overlay.classList.add('visible');
      resetHideTimer();
    }

    function toggleOverlay() {
      if (!overlay) return;
      if (overlay.classList.contains('visible')) {
        overlay.classList.remove('visible');
        clearTimeout(hideTimer);
      } else {
        showOverlay();
      }
    }

    // Play / Pause Toggle
    function togglePlayPause() {
      if (video.paused) {
        video.play().catch(e => console.log('Playback start defer:', e));
      } else {
        video.pause();
      }
      resetHideTimer();
    }

    playPauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlayPause();
    });

    function updatePlayPauseIcons() {
      if (!playIcon || !pauseIcon) return;
      if (!video.paused) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
      } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    }

    video.addEventListener('play', () => {
      updatePlayPauseIcons();
      if (currentPlaybackRate !== 1.0) video.playbackRate = currentPlaybackRate;
      if (isLoopEnabled) video.loop = isLoopEnabled;
      resetHideTimer();
    });

    video.addEventListener('pause', () => {
      updatePlayPauseIcons();
      showOverlay();
    });

    // Single Buffer Spinner Management
    if (spinner) {
      video.addEventListener('waiting', () => spinner.classList.add('active'));
      video.addEventListener('seeking', () => spinner.classList.add('active'));
      video.addEventListener('playing', () => spinner.classList.remove('active'));
      video.addEventListener('canplay', () => spinner.classList.remove('active'));
    }

    // Time & Progress Updates
    video.addEventListener('timeupdate', () => {
      if (!isDragging) {
        const cur = video.currentTime || 0;
        const dur = video.duration || 0;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
        if (currentLabel) currentLabel.textContent = formatTime(cur);
        if (dur > 0 && durationLabel) durationLabel.textContent = formatTime(dur);
      }
    });

    const updateDuration = () => {
      if (currentLabel) currentLabel.textContent = formatTime(video.currentTime || 0);
      if (video.duration && durationLabel) {
        durationLabel.textContent = formatTime(video.duration);
      }
    };
    video.addEventListener('durationchange', updateDuration);
    video.addEventListener('loadedmetadata', () => {
      if (currentLabel) currentLabel.textContent = formatTime(video.currentTime || 0);
      if (durationLabel) durationLabel.textContent = formatTime(video.duration || 0);
    });

    const updateBuffer = () => {
      if (video.buffered && video.buffered.length > 0 && video.duration && bufferBar) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const pct = Math.min(100, (bufferedEnd / video.duration) * 100);
        bufferBar.style.width = `${pct}%`;
      }
    };
    video.addEventListener('progress', updateBuffer);
    video.addEventListener('timeupdate', updateBuffer);

    // Timeline Drag & Scrubbing
    function seekTo(e) {
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const clientX = (e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX;
      let pos = (clientX - rect.left) / rect.width;
      pos = Math.max(0, Math.min(1, pos));
      if (progressBar) progressBar.style.width = `${pos * 100}%`;
      if (thumb) thumb.style.left = `${pos * 100}%`;
      if (video.duration) {
        video.currentTime = pos * video.duration;
        if (currentLabel) currentLabel.textContent = formatTime(video.currentTime);
      }
    }

    const onMouseDown = (e) => {
      isDragging = true;
      seekTo(e);
      resetHideTimer();
    };
    const onMouseMove = (e) => {
      if (isDragging) seekTo(e);
    };
    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        resetHideTimer();
      }
    };

    const onTouchStart = (e) => {
      isDragging = true;
      seekTo(e);
      resetHideTimer();
    };
    const onTouchMove = (e) => {
      if (isDragging) seekTo(e);
    };
    const onTouchEnd = () => {
      if (isDragging) {
        isDragging = false;
        resetHideTimer();
      }
    };

    timeline.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    timeline.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    // Double Tap Skip System
    let lastTapLeft = 0;
    let lastTapRight = 0;

    if (zoneLeft) {
      zoneLeft.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastTapLeft < 300) {
          // Double tap detected
          video.currentTime = Math.max(0, video.currentTime - 10);
          if (indLeft) {
            indLeft.classList.add('active');
            setTimeout(() => indLeft.classList.remove('active'), 500);
          }
          showOverlay();
          lastTapLeft = 0;
        } else {
          lastTapLeft = now;
          setTimeout(() => {
            if (lastTapLeft === now) toggleOverlay();
          }, 300);
        }
      });
    }

    if (zoneRight) {
      zoneRight.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastTapRight < 300) {
          // Double tap detected
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
          if (indRight) {
            indRight.classList.add('active');
            setTimeout(() => indRight.classList.remove('active'), 500);
          }
          showOverlay();
          lastTapRight = 0;
        } else {
          lastTapRight = now;
          setTimeout(() => {
            if (lastTapRight === now) toggleOverlay();
          }, 300);
        }
      });
    }

    // Tap on overlay background toggles overlay
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        toggleOverlay();
      }
    });

    // Fullscreen Toggle
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = document.getElementById('customPlayerViewport');
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          if (wrap && wrap.requestFullscreen) {
            wrap.requestFullscreen().catch(() => {
              if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
            });
          } else if (wrap && wrap.webkitRequestFullscreen) {
            wrap.webkitRequestFullscreen();
          } else if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        }
        resetHideTimer();
      });
    }

    // Register cleanup callback
    customPlayerCleanup = () => {
      clearTimeout(hideTimer);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };

    initSettingsMenu(video);
    updatePlayPauseIcons();
    updateDuration();
    showOverlay();
  }

  function updateNavButtonsState() {
    const prevBtn = document.getElementById('prevVideoBtn');
    if (!prevBtn) return;
    if (playbackHistory.length > 0) {
      prevBtn.classList.remove('nav-disabled');
    } else {
      prevBtn.classList.add('nav-disabled');
    }
  }

  function playNextVideo() {
    // Pick top item from Up Next container
    const upNextCards = document.querySelectorAll('.up-next-card');
    for (let i = 0; i < upNextCards.length; i++) {
      const nextTarget = upNextCards[i];
      const nextVidId = nextTarget.getAttribute('data-id');
      if (nextVidId && (!currentVideoItem || nextVidId !== currentVideoItem.id)) {
        if (currentVideoItem) playbackHistory.push(currentVideoItem);
        updateNavButtonsState();
        loadAndPlay(`https://www.youtube.com/watch?v=${nextVidId}`);
        try {
          history.pushState({ view: "watch", id: nextVidId }, "", "#watch/" + nextVidId);
        } catch (e) {}
        return;
      }
    }
    // Fallback to feed cards if Up Next is empty
    const feedCards = document.querySelectorAll('.card');
    for (let i = 0; i < feedCards.length; i++) {
      const vidId = feedCards[i].getAttribute('data-id');
      if (vidId && (!currentVideoItem || vidId !== currentVideoItem.id)) {
        if (currentVideoItem) playbackHistory.push(currentVideoItem);
        updateNavButtonsState();
        loadAndPlay(`https://www.youtube.com/watch?v=${vidId}`);
        try {
          history.pushState({ view: "watch", id: vidId }, "", "#watch/" + vidId);
        } catch (e) {}
        return;
      }
    }
    console.log('[QUEUE] No more next videos in queue.');
  }

  function playPrevVideo() {
    if (playbackHistory.length === 0) return;
    const prevVideo = playbackHistory.pop();
    updateNavButtonsState();
    if (prevVideo) {
      const vidId = prevVideo.id || extractVideoId(prevVideo.url, prevVideo);
      if (vidId) {
        loadAndPlay(prevVideo.url || `https://www.youtube.com/watch?v=${vidId}`);
        try {
          history.pushState({ view: "watch", id: vidId }, "", "#watch/" + vidId);
        } catch (e) {}
      }
    }
  }

  function renderSpeedOptions(video) {
    const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    const container = document.getElementById('speedOptionsList');
    if (!container) return;
    container.innerHTML = speeds.map(spd => {
      const isSel = currentPlaybackRate === spd;
      return `
        <div class="quality-option-item ${isSel ? 'active' : ''}" data-spd="${spd}">
          <div class="quality-option-left">
            <span class="quality-label-text">${spd === 1.0 ? 'Normal' : spd + 'x'}</span>
          </div>
          ${isSel ? '<svg class="quality-check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3ea6ff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.quality-option-item').forEach(item => {
      item.onclick = () => {
        const spd = parseFloat(item.getAttribute('data-spd'));
        currentPlaybackRate = spd;
        if (video) video.playbackRate = spd;
        const speedText = document.getElementById('settingsCurrentSpeedText');
        if (speedText) speedText.textContent = spd === 1.0 ? 'Normal' : `${spd}x`;
        const overlay = document.getElementById('playerSettingsOverlay');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
        showToast(`Playback speed set to ${spd === 1.0 ? 'Normal' : spd + 'x'}`);
      };
    });
  }

  function initSettingsMenu(video) {
    const overlay = document.getElementById('playerSettingsOverlay');
    const gearBtn = document.getElementById('playerGearBtn');
    const mainView = document.getElementById('settingsMainMenuView');
    const qualView = document.getElementById('settingsQualitySubView');
    const speedView = document.getElementById('settingsSpeedSubView');
    const loopRail = document.getElementById('loopSwitchRail');
    const lockRow = document.getElementById('menuRowLock');
    const barrier = document.getElementById('screenLockBarrier');
    const unlockBtn = document.getElementById('unlockToastBtn');
    const autoPill = document.getElementById('autoplayTogglePill');

    function openSettingsSheet() {
      const overlay = document.getElementById('playerSettingsOverlay');
      const mainView = document.getElementById('settingsMainMenuView');
      const qualView = document.getElementById('settingsQualitySubView');
      const speedView = document.getElementById('settingsSpeedSubView');
      if (!overlay) return;

      if (mainView) mainView.style.display = 'block';
      if (qualView) qualView.style.display = 'none';
      if (speedView) speedView.style.display = 'none';

      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeSettingsSheet() {
      const overlay = document.getElementById('playerSettingsOverlay');
      if (!overlay) return;
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    if (gearBtn) {
      gearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        openSettingsSheet();
      });
    }

    // Ensure backdrop click closes settings
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeSettingsSheet();
        }
      });
    }

    // Sub-navigation
    const menuRowQuality = document.getElementById('menuRowQuality');
    if (menuRowQuality) {
      menuRowQuality.onclick = () => {
        if (mainView) mainView.style.display = 'none';
        if (qualView) qualView.style.display = 'block';
      };
    }
    const subBackFromQuality = document.getElementById('subBackFromQuality');
    if (subBackFromQuality) {
      subBackFromQuality.onclick = () => {
        if (qualView) qualView.style.display = 'none';
        if (mainView) mainView.style.display = 'block';
      };
    }

    const menuRowSpeed = document.getElementById('menuRowSpeed');
    if (menuRowSpeed) {
      menuRowSpeed.onclick = () => {
        if (mainView) mainView.style.display = 'none';
        if (speedView) speedView.style.display = 'block';
        renderSpeedOptions(video);
      };
    }
    const subBackFromSpeed = document.getElementById('subBackFromSpeed');
    if (subBackFromSpeed) {
      subBackFromSpeed.onclick = () => {
        if (speedView) speedView.style.display = 'none';
        if (mainView) mainView.style.display = 'block';
      };
    }

    // Loop toggle
    const menuRowLoop = document.getElementById('menuRowLoop');
    if (menuRowLoop) {
      menuRowLoop.onclick = () => {
        isLoopEnabled = !isLoopEnabled;
        video.loop = isLoopEnabled;
        if (loopRail) loopRail.classList.toggle('active', isLoopEnabled);
        showToast(isLoopEnabled ? 'Loop video is ON' : 'Loop video is OFF');
      };
    }
    if (loopRail) {
      loopRail.classList.toggle('active', isLoopEnabled);
    }

    // Autoplay toggle
    if (autoPill) {
      autoPill.classList.toggle('active', autoplayEnabled);
      autoPill.onclick = (e) => {
        e.stopPropagation();
        autoplayEnabled = !autoplayEnabled;
        autoPill.classList.toggle('active', autoplayEnabled);
        showToast(autoplayEnabled ? 'Autoplay is ON' : 'Autoplay is OFF');
      };
    }

    // Screen Lock
    let lockToastTimer = null;
    if (lockRow) {
      lockRow.onclick = () => {
        closeSettingsSheet();
        isScreenLocked = true;
        if (barrier) barrier.classList.add('active');
        const customOverlay = document.getElementById('customPlayerOverlay');
        if (customOverlay) customOverlay.classList.remove('visible');
      };
    }

    if (barrier) {
      barrier.onclick = () => {
        if (!unlockBtn) return;
        unlockBtn.classList.add('visible');
        clearTimeout(lockToastTimer);
        lockToastTimer = setTimeout(() => unlockBtn.classList.remove('visible'), 3000);
      };
    }

    if (unlockBtn) {
      unlockBtn.onclick = (e) => {
        e.stopPropagation();
        isScreenLocked = false;
        if (barrier) barrier.classList.remove('active');
        unlockBtn.classList.remove('visible');
        const customOverlay = document.getElementById('customPlayerOverlay');
        if (customOverlay) customOverlay.classList.add('visible');
        showToast('Screen unlocked');
      };
    }

    // Video Ended Autoplay listener
    video.onended = () => {
      if (autoplayEnabled && !isLoopEnabled) {
        showToast('Autoplaying next video in 3s...');
        setTimeout(() => {
          if (autoplayEnabled && !isLoopEnabled && (video.ended || video.paused)) {
            playNextVideo();
          }
        }, 3000);
      }
    };

    // Previous / Next button bindings
    const prevBtn = document.getElementById('prevVideoBtn');
    if (prevBtn) {
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        playPrevVideo();
      };
    }
    const nextBtn = document.getElementById('nextVideoBtn');
    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.stopPropagation();
        playNextVideo();
      };
    }

    updateNavButtonsState();
  }

  function bindWatchEvents() {
    videoEl = document.getElementById("mainVideoPlayer") || document.getElementById("mainVideo");
    playerSpinner = document.getElementById("playerBufferSpinner");
    playerErrorOverlay = document.getElementById("playerErrorOverlay");
    playerRetryBtn = document.getElementById("playerRetryBtn");
    playerErrorMsg = document.getElementById("playerErrorMsg");
    shareBtn = document.getElementById("shareBtn");
    const downloadActionBtn = document.getElementById("downloadActionBtn");
    const metaMoreBtn = document.getElementById("metaMoreBtn");
    const wMeta = document.getElementById("wMeta");

    if (videoEl) {
      videoEl.addEventListener("error", () => {
        hideBufferSpinner();
      });
      initializeCustomPlayer(videoEl);
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

    if (metaMoreBtn) {
      metaMoreBtn.onclick = (e) => {
        e.stopPropagation();
        openDescriptionSheet(currentData || {});
      };
    }

    if (wMeta) {
      wMeta.onclick = () => {
        openDescriptionSheet(currentData || {});
      };
    }
  }

  function openDescriptionSheet(videoData) {
    const overlay = document.getElementById('descriptionOverlay');
    const titleEl = document.getElementById('descSheetTitle');
    const metaEl = document.getElementById('descSheetMeta');
    const textEl = document.getElementById('descSheetBody');

    const v = videoData || currentData || {};
    const title = v.title || currentData?.title || 'Video';
    const channel = v.channel || v.uploader || currentData?.channel || currentData?.uploader || 'Channel';
    const views = v.views
      ? (typeof v.views === 'string' && v.views.includes('views') ? v.views : `${v.views} views`)
      : (v.view_count ? `${fmtViews(v.view_count)} views` : (currentData?.views ? `${currentData.views} views` : (currentData?.view_count ? `${fmtViews(currentData.view_count)} views` : 'Popular')));
    const uploadDate = v.upload_date || v.uploaded || currentData?.upload_date || currentData?.uploaded || 'Recently';
    const desc = v.description || currentData?.description || 'No description available for this video.';

    if (titleEl) titleEl.textContent = title;
    if (metaEl) {
      metaEl.innerHTML = `
        <span>${escapeHtml(channel)}</span> • 
        <span>${escapeHtml(views)}</span> • 
        <span>${escapeHtml(uploadDate)}</span>
      `;
    }
    if (textEl) {
      textEl.textContent = desc;
    }

    if (overlay) {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeDescriptionSheet() {
    const overlay = document.getElementById('descriptionOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
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
    hideBufferSpinner();
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
      const vidId = it.id || extractVideoId(it.url, it);
      if (vidId) card.setAttribute("data-id", vidId);
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
    currentAvailableQualities = [];
    activeQualityIndex = 0;

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
    showBufferSpinner();
    hidePlayerErrorState();

    // Update read-only like stat pill if preview has count
    const likeEl = document.getElementById("watchLikeCount");
    if (likeEl && preview && (preview.likes || preview.like_count)) {
      likeEl.textContent = formatLikeCount(preview.likes || preview.like_count);
    }

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
    const qText = document.getElementById("settingsCurrentQualityText");
    if (qText) qText.textContent = `${activeH}p`;

    // Dynamic multi-resolution YouTube stream resolver & description metadata sync
    const vidId = d.id || extractVideoId(url, d);
    currentVideoItem = d;
    currentVideoItem.id = vidId;
    updateNavButtonsState();

    if (vidId) {
      fetch(`/api/stream/resolve?id=${encodeURIComponent(vidId)}`)
        .then(res => res.json())
        .then(resData => {
          if (thisToken !== null && thisToken !== currentPlaybackToken) return;
          if (resData) {
            if (resData.description && (!currentData || !currentData.description)) {
              if (currentData) currentData.description = resData.description;
            }
            if (resData.like_count) {
              if (currentData) currentData.like_count = resData.like_count;
              const likeEl = document.getElementById("watchLikeCount");
              if (likeEl) likeEl.textContent = formatLikeCount(resData.like_count);
            }
            if (resData.view_count && (!currentData || !currentData.view_count)) {
              if (currentData) currentData.view_count = resData.view_count;
              const viewsEl = document.getElementById("wViews");
              if (viewsEl) viewsEl.textContent = `${fmtViews(resData.view_count)} views`;
            }
            if (resData.upload_date && (!currentData || !currentData.upload_date)) {
              if (currentData) currentData.upload_date = resData.upload_date;
              const dateEl = document.getElementById("wDate");
              if (dateEl) dateEl.textContent = resData.upload_date;
            }
            if (resData.qualities && resData.qualities.length) {
              populateQualitySheet(resData.qualities, activeH);
              const matched = resData.qualities.find(q => q.height === activeH) || resData.qualities[0];
              if (matched && qText) {
                qText.textContent = matched.resolution;
              }
            }
          }
        })
        .catch(err => console.warn("Failed to resolve multi-qualities:", err));
    }

    if (videoEl && defUrl) {
      videoEl.src = defUrl;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (thisToken !== null && thisToken !== currentPlaybackToken) return;
          hideBufferSpinner();
          hidePlayerErrorState();
        }).catch(err => {
          if (thisToken !== null && thisToken !== currentPlaybackToken) return;
          console.warn("Autoplay blocked or deferred by browser policy:", err);
          hideBufferSpinner();
        });
      }
    } else {
      hideBufferSpinner();
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

    const likeEl = document.getElementById("watchLikeCount");
    if (likeEl && (d.likes || d.like_count)) {
      likeEl.textContent = formatLikeCount(d.like_count || d.likes);
    }

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

    if (customPlayerCleanup) {
      customPlayerCleanup();
      customPlayerCleanup = null;
    }

    closeDescriptionSheet();
    closeQualityPicker();
    isScreenLocked = false;
    const barrier = document.getElementById('screenLockBarrier');
    if (barrier) barrier.classList.remove('active');
    const unlockBtn = document.getElementById('unlockToastBtn');
    if (unlockBtn) unlockBtn.classList.remove('visible');
    document.body.classList.remove('watch-route-active');

    const player = document.getElementById("mainVideoPlayer") || document.getElementById("mainVideo") || videoEl;
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    hideBufferSpinner();
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

  function populateQualitySheet(qualities, currentHeight) {
    currentAvailableQualities = qualities || [];
    const sheetList = document.getElementById('qualityOptionsList') || document.querySelector('.quality-options-container');
    if (!sheetList) return;

    if (!qualities || !qualities.length) {
      sheetList.innerHTML = `<div class="mut" style="text-align:center;padding:16px;">Auto (Default stream)</div>`;
      return;
    }

    if (currentHeight) {
      const idx = currentAvailableQualities.findIndex(q => q.height === currentHeight);
      if (idx !== -1) activeQualityIndex = idx;
    }

    sheetList.innerHTML = qualities.map((q, idx) => {
      const isSelected = idx === activeQualityIndex || (currentHeight && q.height === currentHeight);
      return `
        <div class="quality-option-item ${isSelected ? 'active' : ''}" data-idx="${idx}">
          <div class="quality-option-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09A1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="quality-label-text">${q.label || q.resolution}</span>
          </div>
          ${isSelected ? `<svg class="quality-check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3ea6ff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
        </div>
      `;
    }).join('');

    // Bind quality switch action
    sheetList.querySelectorAll('.quality-option-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-idx'), 10);
        switchQuality(idx);
      });
    });
  }

  function switchQuality(index) {
    const selected = currentAvailableQualities[index];
    if (!selected) return;

    activeQualityIndex = index;
    const video = document.getElementById('mainVideoPlayer') || videoEl;
    const qText = document.getElementById('settingsCurrentQualityText');

    if (qText) {
      qText.textContent = selected.resolution;
    }

    if (video && selected.url) {
      const currentTime = video.currentTime;
      const isPaused = video.paused;

      const playUrl = selected.url.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(selected.url)}` : selected.url;
      const restoreTime = () => {
        try {
          if (currentTime > 0) video.currentTime = currentTime;
        } catch (e) {}
      };
      video.addEventListener('loadedmetadata', restoreTime, { once: true });
      video.src = playUrl;
      try {
        video.currentTime = currentTime;
      } catch (e) {}

      if (!isPaused) {
        video.play().catch(err => console.log('Autoplay after quality switch deferred:', err));
      }
      showToast(`Switched quality to ${selected.resolution}`);
    }

    // Close settings modal bottom sheet
    closeQualityPicker();
  }

  function openQualityPicker() {
    const overlay = document.getElementById('playerSettingsOverlay');
    const mainView = document.getElementById('settingsMainMenuView');
    const qualView = document.getElementById('settingsQualitySubView');
    const speedView = document.getElementById('settingsSpeedSubView');
    if (overlay) {
      if (mainView) mainView.style.display = 'none';
      if (speedView) speedView.style.display = 'none';
      if (qualView) qualView.style.display = 'block';
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    if (!currentAvailableQualities || currentAvailableQualities.length === 0) {
      const d = currentData;
      const vidId = d ? (d.id || extractVideoId(currentUrl, d)) : null;
      if (vidId) {
        const list = document.getElementById('qualityOptionsList');
        if (list) list.innerHTML = `<div class="mut" style="text-align:center;padding:16px;">Loading resolutions...</div>`;
        fetch(`/api/stream/resolve?id=${encodeURIComponent(vidId)}`)
          .then(res => res.json())
          .then(resData => {
            if (resData && resData.qualities && resData.qualities.length) {
              populateQualitySheet(resData.qualities);
            }
          })
          .catch(() => {
            if (list) list.innerHTML = `<div class="mut" style="text-align:center;padding:16px;">Auto (Default stream)</div>`;
          });
      }
    }
  }

  function closeQualityPicker() {
    const overlay = document.getElementById('playerSettingsOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
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
    initializeCustomPlayer,
    formatTime,
    loadAndPlay,
    openWatch,
    hydrateWatchDetails,
    pause,
    showHomeView,
    closeWatch,
    teardownWatchUI,
    getIsWatchOpen: () => isWatchOpen,
    populateQualitySheet,
    switchQuality,
    openQualityPicker,
    closeQualityPicker,
    openDescriptionSheet,
    closeDescriptionSheet,
    openDownloads,
    closeDownloads,
    startDownload,
    getCurrentUrl,
    setCurrentUrl,
    showPlayerErrorState,
    hidePlayerErrorState,
    attachBufferGatedUpNextLoader,
    updateNavButtonsState,
    playNextVideo,
    playPrevVideo,
    initSettingsMenu,
    renderSpeedOptions
  };
})();
