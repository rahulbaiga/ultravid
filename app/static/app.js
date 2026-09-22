/**
 * UltraVid App Orchestrator & Bootstrapper
 * Coordinates Two-Tier Persistent Container Architecture & Unified History Navigation
 */
(function() {
  let lastQuery = "";

  async function doSearch(q) {
    q = (q || "").trim();
    if (!q) return;

    lastQuery = q;
    const feed = window.UltraVid.feed;
    const player = window.UltraVid.player;
    const chips = window.UltraVid.chips;
    const utils = window.UltraVid.utils;

    if (chips) chips.clearActive();
    if (player) player.pause();
    if (player) player.showHomeView();

    // Ensure we are in Home tab
    if (feed && typeof feed.switchTab === "function") {
      await feed.switchTab("home");
    }

    // Activate dedicated search container without clearing category containers
    if (feed && typeof feed.showSearchMode === "function") {
      feed.showSearchMode();
    }

    const searchGrid = document.getElementById("grid-search");
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (window.UltraVid.card && searchGrid) {
      window.UltraVid.card.renderSkeleton(searchGrid, 6);
    }

    try {
      if (utils.isUrl(q)) {
        await player.loadAndPlay(q, lastQuery);
      } else {
        const j = await window.UltraVid.api.fetchSearch(q, { maxResults: 15 });
        if (!j.results || j.results.length === 0) {
          if (searchGrid) {
            searchGrid.innerHTML = `
              <div style="grid-column:1/-1;text-align:center;padding:48px 16px;color:#888;">
                <div style="font-size:36px;margin-bottom:12px">🔍</div>
                <div style="font-size:16px;color:#fff;font-weight:600;margin-bottom:6px">No videos found for “${utils.escapeHtml(q)}”</div>
                <div style="font-size:13px">Try different keywords or paste a direct video link.</div>
              </div>
            `;
          }
        } else {
          if (searchGrid) {
            searchGrid.innerHTML = "";
            const fragment = document.createDocumentFragment();
            j.results.forEach(it => {
              fragment.appendChild(window.UltraVid.card.createCard(it, {
                onPlay: (url) => player.loadAndPlay(url, lastQuery),
                onQuickAction: (vid) => window.UltraVid.actionSheet.open(vid)
              }));
            });
            searchGrid.appendChild(fragment);
            utils.refreshIcons();
          }
        }
      }
    } catch (e) {
      if (searchGrid) {
        searchGrid.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:48px 16px;color:#e11d48;">
            <div style="font-size:15px;font-weight:600;margin-bottom:8px">Search failed: ${utils.escapeHtml(e.message)}</div>
            <button class="btn" style="padding:6px 18px;font-size:13px" onclick="window.UltraVid.doSearch('${utils.escapeHtml(q)}')">↻ Retry</button>
          </div>
        `;
      }
    }
  }

  // Unified History API Coordination for Android Physical Back & Browser Gestures
  window.addEventListener('popstate', (e) => {
    // 1. If search overlay is open, dismiss search
    const searchOverlay = document.getElementById('searchOverlay');
    if (searchOverlay && !searchOverlay.classList.contains('hidden')) {
      const header = window.UltraVid && window.UltraVid.header;
      if (header && typeof header.closeSearch === 'function') {
        header.closeSearch(false);
      } else {
        searchOverlay.classList.add('hidden');
        document.body.classList.remove('search-locked');
      }
      return;
    }

    // 2. If quick action sheet modal is open, dismiss modal
    const actionOverlay = document.getElementById('quickActionOverlay');
    if (actionOverlay && !actionOverlay.classList.contains('hidden')) {
      const actionSheet = window.UltraVid && window.UltraVid.actionSheet;
      if (actionSheet && typeof actionSheet.close === 'function') {
        actionSheet.close();
      } else {
        actionOverlay.classList.add('hidden');
      }
      return;
    }

    // 2b. If download overlay modal is open, dismiss modal
    const dlOverlay = document.getElementById('dlOverlay');
    if (dlOverlay && !dlOverlay.classList.contains('hidden')) {
      const player = window.UltraVid && window.UltraVid.player;
      if (player && typeof player.closeDownloads === 'function') {
        player.closeDownloads();
      } else {
        dlOverlay.classList.add('hidden');
      }
      return;
    }

    // 3. If watch player is open, close player and restore feed
    const playerComp = window.UltraVid && window.UltraVid.player;
    const watchView = document.getElementById('watchView');
    const isWatchOpen = (playerComp && typeof playerComp.getIsWatchOpen === 'function')
      ? playerComp.getIsWatchOpen()
      : (watchView && !watchView.classList.contains('hidden'));

    if (isWatchOpen) {
      if (playerComp && typeof playerComp.teardownWatchUI === 'function') {
        playerComp.teardownWatchUI();
      } else if (playerComp && typeof playerComp.showHomeView === 'function') {
        playerComp.showHomeView();
      }
      return;
    }

    // 4. Category / Feed Back-Navigation
    const targetCategory = (e.state && e.state.category)
      ? e.state.category
      : (window.location.hash && window.location.hash.startsWith('#feed/')
          ? window.location.hash.replace('#feed/', '').trim()
          : 'all');

    window.currentActiveCategory = targetCategory;

    // Ensure we are in home tab when restoring a category feed
    const feed = (window.UltraVid && window.UltraVid.feed) || window.FeedComponent;
    if (feed && typeof feed.switchTab === 'function' && feed.getCurrentTab && feed.getCurrentTab() !== 'home') {
      feed.switchTab('home');
    }

    const chips = (window.UltraVid && window.UltraVid.chips) || window.ChipsComponent;
    if (chips && typeof chips.selectCategory === 'function') {
      chips.selectCategory(targetCategory, false);
    } else if (window.ChipsComponent && typeof window.ChipsComponent.selectCategory === 'function') {
      window.ChipsComponent.selectCategory(targetCategory, false);
    } else if (feed && typeof feed.switchCategory === 'function') {
      feed.switchCategory(targetCategory);
      document.querySelectorAll('.chip, .chip-btn').forEach(btn => {
        const cat = btn.dataset.category || btn.dataset.cat;
        btn.classList.toggle('active', cat === targetCategory);
      });
    }

    if (typeof window.reconcileFeedViewport === 'function') {
      window.reconcileFeedViewport(targetCategory);
    }
  });

  // Custom Pull-to-Refresh Gesture Engine with Elastic Damping (YouTube-style)
  let touchStartY = 0;
  let isPulling = false;
  let ptrSpinner = null;
  let ptrDismissTimer = null;
  const PULL_THRESHOLD = 75;

  function canPullToRefresh() {
    if (window.scrollY > 0) return false;
    const watchView = document.getElementById('watchView');
    if (watchView && !watchView.classList.contains('hidden')) return false;
    const searchOverlay = document.getElementById('searchOverlay');
    if (searchOverlay && !searchOverlay.classList.contains('hidden')) return false;
    const actionOverlay = document.getElementById('quickActionOverlay');
    if (actionOverlay && !actionOverlay.classList.contains('hidden')) return false;
    const dlOverlay = document.getElementById('dlOverlay');
    if (dlOverlay && !dlOverlay.classList.contains('hidden')) return false;
    return true;
  }

  function getPtrSpinner() {
    if (!ptrSpinner) {
      ptrSpinner = document.getElementById('ptrSpinner');
    }
    return ptrSpinner;
  }

  window.addEventListener('touchstart', (e) => {
    if (canPullToRefresh() && e.touches && e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      isPulling = true;
    } else {
      isPulling = false;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isPulling || window.scrollY > 0) return;
    const currentY = e.touches[0].clientY;
    const pullDistance = (currentY - touchStartY) * 0.45; // Elastic damping factor

    const spinner = getPtrSpinner();
    if (pullDistance > 10 && spinner) {
      spinner.classList.add('visible');
      spinner.style.top = Math.min(pullDistance + 10, 85) + 'px';
    }
  }, { passive: true });

  window.addEventListener('touchend', async (e) => {
    if (!isPulling) return;
    isPulling = false;
    const currentY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : touchStartY;
    const pullDistance = (currentY - touchStartY) * 0.45;
    const spinner = getPtrSpinner();

    if (pullDistance >= PULL_THRESHOLD) {
      if (spinner) spinner.style.top = '70px';
      const activeCat = window.currentActiveCategory
        || (window.UltraVid && window.UltraVid.chips && typeof window.UltraVid.chips.getCategory === 'function' ? window.UltraVid.chips.getCategory() : null)
        || 'all';
      const feed = (window.UltraVid && window.UltraVid.feed) || window.FeedComponent;
      try {
        if (feed && typeof feed.optimisticRefresh === 'function') {
          await feed.optimisticRefresh(activeCat);
        } else if (window.FeedComponent && typeof window.FeedComponent.optimisticRefresh === 'function') {
          await window.FeedComponent.optimisticRefresh(activeCat);
        }
      } catch (err) {
        if (err && (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort')))) {
          // Clean abort - do not log or treat as network failure
        } else {
          console.warn('[PTR] Refresh failed:', err);
        }
      } finally {
        if (spinner) {
          spinner.style.top = '-50px';
          setTimeout(() => spinner.classList.remove('visible'), 250);
        }
      }
    } else {
      if (spinner) {
        spinner.style.top = '-50px';
        setTimeout(() => spinner.classList.remove('visible'), 200);
      }
    }
  }, { passive: true });

  function bootstrap() {
    const { utils, api, card, actionSheet, player, header, chips, bottomNav, feed } = window.UltraVid;

    // 0. Base State Bootstrapping
    const hash = window.location.hash || '';
    if (!history.state) {
      if (hash.startsWith('#feed/')) {
        const cat = hash.replace('#feed/', '').trim() || 'all';
        history.replaceState({ view: 'feed', category: cat }, '', hash);
      } else if (!hash.startsWith('#watch/')) {
        history.replaceState({ view: 'feed', category: 'all' }, '', '#feed/all');
      }
    }

    // 1. Initialize Quick Action Sheet
    actionSheet.init({
      onDownloadMp4: (vid) => {
        player.startDownload("720", false, vid.url);
        player.openDownloads(vid.url);
      },
      onDownloadMp3: (vid) => {
        player.startDownload("mp3", true, vid.url);
        player.openDownloads(vid.url);
      },
      onShare: null // Uses default clipboard share with toast
    });

    // 2. Initialize Video Player
    player.init({
      onBack: () => {
        player.showHomeView();
      }
    });

    // 3. Initialize Feed
    feed.init({
      onPlay: (url) => player.loadAndPlay(url, lastQuery),
      onQuickAction: (vid) => actionSheet.open(vid)
    });

    // 4. Initialize Header & Search
    header.init({
      onSearch: (q) => doSearch(q),
      onLogoClick: () => {
        player.pause();
        feed.switchTab("home");
        if (chips && typeof chips.selectCategory === "function") {
          chips.selectCategory("all", true);
        } else {
          feed.switchCategory("all");
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      onClear: () => {}
    });

    // 5. Initialize Category Chips (Tier 2)
    chips.init({
      onSelect: (cat) => {
        header.setValue("");
        header.hideSuggestions();
      }
    });

    // 6. Initialize Bottom Navigation (Tier 1)
    bottomNav.init({
      onHome: () => {
        player.pause();
        header.setValue("");
        header.hideSuggestions();
      },
      onTrending: () => {
        player.pause();
        header.setValue("");
        header.hideSuggestions();
      },
      onLibrary: () => {
        player.pause();
        header.setValue("");
        header.hideSuggestions();
      }
    });

    // 7. Initial Feed Mount & Icons
    utils.refreshIcons();
    const initialCategoryFromHash = hash.startsWith('#feed/') ? hash.replace('#feed/', '').trim() : null;

    feed.initFeed(true).then(() => {
      if (initialCategoryFromHash && initialCategoryFromHash !== 'all') {
        if (chips && typeof chips.selectCategory === 'function') {
          chips.selectCategory(initialCategoryFromHash, false);
        }
      }
    });

    // 8. Handle direct watch URL hash if present
    if (hash && hash.startsWith("#watch/")) {
      const vidId = hash.replace("#watch/", "").trim();
      if (vidId) {
        player.loadAndPlay(`https://www.youtube.com/watch?v=${vidId}`);
      }
    }

    window.UltraVid.doSearch = doSearch;
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
