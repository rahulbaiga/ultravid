/**
 * UltraVid Multi-Container Infinite Scroll Feed Engine
 * Industry-Standard Two-Tier Persistent Container Architecture
 * Resilient Startup Hydration & Viewport Watchdog
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { refreshIcons } = window.UltraVid.utils;

  // Persistent state registry for all categories and tabs
  const feedStates = {
    // Home categories (Tier 2)
    all:     { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-all', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    gaming:  { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-gaming', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    tech:    { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-tech', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    movies:  { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-movies', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    music:   { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-music', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    science: { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-science', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    sports:  { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-sports', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    comedy:  { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-comedy', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    food:    { page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-food', emptyCount: 0, seed: Math.floor(Math.random() * 1000) },
    // Dedicated Bottom Tabs (Tier 1)
    trending:{ page: 1, queue: [], seenIds: new Set(), hasMore: true, isFetching: false, scrollY: 0, initialized: false, elId: 'grid-trending', emptyCount: 0, seed: Math.floor(Math.random() * 1000) }
  };

  let currentCategory = 'all';
  let currentTab = 'home';
  let feedMode = true;
  let tabScrollY = { home: 0, trending: 0, library: 0 };

  let homeSentinel = null;
  let trendingSentinel = null;
  let cardObserver = null;
  let feedObserver = null;
  let scrollThrottle = false;
  const safetyTimers = {};

  let itemCallbacks = {
    onPlay: null,
    onQuickAction: null
  };

  function init(callbacks = {}) {
    homeSentinel = document.getElementById("homeSentinel") || document.getElementById("scrollSentinel");
    trendingSentinel = document.getElementById("trendingSentinel");

    itemCallbacks.onPlay = callbacks.onPlay;
    itemCallbacks.onQuickAction = callbacks.onQuickAction;

    setupScrollListeners();
  }

  function getActiveFeedKey() {
    if (currentTab === 'trending') return 'trending';
    if (currentTab === 'home') return currentCategory;
    return null;
  }

  function getActiveSentinel() {
    if (currentTab === 'trending') return trendingSentinel;
    if (currentTab === 'home') return homeSentinel;
    return null;
  }

  function isKeyActive(key) {
    return key === getActiveFeedKey();
  }

  function getActiveGrid() {
    const key = getActiveFeedKey();
    if (key && feedStates[key]) {
      return document.getElementById(feedStates[key].elId);
    }
    return document.getElementById('grid-search') || document.getElementById('grid-all');
  }

  function showFeedError(key) {
    const state = feedStates[key];
    if (!state) return;
    const targetEl = document.getElementById(state.elId);
    if (!targetEl) return;
    targetEl.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 16px;color:#888;">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <div style="font-size:15px;color:#fff;font-weight:600;margin-bottom:6px">Couldn't load feed</div>
        <div style="font-size:13px;margin-bottom:16px">Check your network connection and try again.</div>
        <button type="button" class="btn" style="padding:8px 20px;font-size:13px" onclick="window.UltraVid.feed.retryCategory('${key}')">↻ Tap to retry</button>
      </div>
    `;
    const sentinel = getActiveSentinel();
    if (sentinel && isKeyActive(key)) sentinel.textContent = '';
  }

  async function retryCategory(key) {
    const state = feedStates[key];
    if (!state) return;
    state.initialized = false;
    state.isFetching = false;
    state.page = 1;
    state.hasMore = true;
    await ensureCategoryLoaded(key);
  }

  function setupScrollListeners() {
    // 2-card lookahead observer
    if ('IntersectionObserver' in window) {
      cardObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && feedMode) {
            const activeKey = getActiveFeedKey();
            if (!activeKey) return;
            const state = feedStates[activeKey];
            if (state && state.initialized && state.hasMore) {
              const targetEl = document.getElementById(state.elId);
              const realCards = targetEl ? targetEl.querySelectorAll('.card:not(.skeleton-card)').length : 0;
              if (realCards === 0) return;

              if (state.queue.length > 0) {
                renderNext(activeKey, 2);
              } else if (!state.isFetching) {
                fetchBatch(activeKey, state.page);
              }
            }
          }
        });
      }, { rootMargin: '400px 0px' });
    }

    // Passive window scroll listener (dual-engine)
    window.addEventListener('scroll', () => {
      if (scrollThrottle || !feedMode) return;
      scrollThrottle = true;
      requestAnimationFrame(() => {
        const activeKey = getActiveFeedKey();
        if (activeKey) {
          const state = feedStates[activeKey];
          if (state && state.initialized && state.hasMore) {
            const targetEl = document.getElementById(state.elId);
            const realCards = targetEl ? targetEl.querySelectorAll('.card:not(.skeleton-card)').length : 0;
            if (realCards > 0) {
              const scrollDist = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY);
              if (scrollDist <= 600) {
                if (state.queue.length > 0) {
                  renderNext(activeKey, 2);
                } else if (!state.isFetching) {
                  fetchBatch(activeKey, state.page);
                }
              }
            }
          }
        }
        scrollThrottle = false;
      });
    }, { passive: true });
  }

  function setupSentinelObserver() {
    if (feedObserver) {
      feedObserver.disconnect();
      feedObserver = null;
    }
    const activeKey = getActiveFeedKey();
    if (!activeKey) return;
    const sentinel = getActiveSentinel();
    if ('IntersectionObserver' in window && sentinel) {
      feedObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && feedMode) {
            const key = getActiveFeedKey();
            if (!key) return;
            const state = feedStates[key];
            if (!state || !state.initialized || !state.hasMore) return;

            // Coordination check: Ensure container has real video cards and is not empty/skeletons
            const targetEl = document.getElementById(state.elId);
            const realCards = targetEl ? targetEl.querySelectorAll('.card:not(.skeleton-card)').length : 0;
            if (realCards === 0) return;

            if (state.queue.length > 0) {
              renderNext(key, 2);
            } else if (!state.isFetching) {
              fetchBatch(key, state.page);
            }
          }
        });
      }, { rootMargin: '600px 0px' });
      feedObserver.observe(sentinel);
    }
  }

  function updateCardObserver(key = getActiveFeedKey()) {
    if (cardObserver) cardObserver.disconnect();
    if (!feedMode || !key) return;
    const state = feedStates[key];
    if (!state || !state.hasMore) return;

    const targetEl = document.getElementById(state.elId);
    if (!targetEl) return;

    const cards = targetEl.querySelectorAll(".card:not(.skeleton-card)");
    if (cards.length > 1) {
      const target = cards[cards.length - 2];
      if (target && cardObserver) {
        cardObserver.observe(target);
      }
    }
  }

  function prefetchThumbnails(items) {
    if (!Array.isArray(items)) return;
    items.forEach(item => {
      if (item && item.thumbnail) {
        const img = new Image();
        img.src = item.thumbnail;
      }
    });
  }

  async function fetchBatch(key = getActiveFeedKey(), pageToFetch = null) {
    const state = feedStates[key];
    if (!state || state.isFetching || !state.hasMore) return;

    const targetPage = pageToFetch != null ? pageToFetch : state.page;
    state.isFetching = true;

    clearTimeout(safetyTimers[key]);
    safetyTimers[key] = setTimeout(() => { state.isFetching = false; }, 8000);

    // Watchdog timer for initial batch
    const watchdog = setTimeout(() => {
      if (state.isFetching && state.queue.length === 0 && targetPage === 1) {
        console.warn(`[FeedEngine] Initial fetch timed out for ${key}. Releasing lock.`);
        state.isFetching = false;
        showFeedError(key);
      }
    }, 8000);

    const sentinel = getActiveSentinel();
    if (sentinel && state.queue.length === 0 && isKeyActive(key)) {
      sentinel.textContent = 'Loading more videos…';
    }

    const categoryParam = key === 'trending' ? 'trending' : key;

    try {
      const j = await window.UltraVid.api.fetchFeed({
        page: targetPage,
        limit: 12,
        seed: state.seed,
        category: categoryParam
      });
      clearTimeout(watchdog);
      const rawItems = (j && j.results) || [];

      let items = rawItems.filter(it => it.id && !state.seenIds.has(it.id));
      if (items.length === 0 && rawItems.length > 0) {
        state.seenIds.clear();
        items = rawItems;
      }
      items.forEach(it => { if (it.id) state.seenIds.add(it.id); });

      if (items.length > 0) {
        prefetchThumbnails(items);
        state.emptyCount = 0;
        state.queue.push(...items);
        state.page = targetPage + 1;

        // Auto-drain: if user is near bottom, flush queue immediately
        const isNearBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 700);
        if (state.queue.length > 0 && isNearBottom && isKeyActive(key)) {
          renderNext(key, 4);
        }
      } else {
        state.emptyCount = (state.emptyCount || 0) + 1;
        state.page = targetPage + 1;
        if (state.emptyCount >= 5) {
          state.hasMore = false;
          if (sentinel && isKeyActive(key)) sentinel.textContent = 'No more videos';
        } else {
          state.isFetching = false;
          return await fetchBatch(key, targetPage + 1);
        }
      }
    } catch (e) {
      clearTimeout(watchdog);
      state.emptyCount = (state.emptyCount || 0) + 1;
      state.page = targetPage + 1;
      if (targetPage === 1 && state.queue.length === 0) {
        state.isFetching = false;
        showFeedError(key);
        return;
      }
      if (state.emptyCount >= 5) {
        state.hasMore = false;
        if (sentinel && isKeyActive(key)) sentinel.textContent = 'No more videos';
      } else {
        state.isFetching = false;
        return await fetchBatch(key, targetPage + 1);
      }
    } finally {
      state.isFetching = false;
      clearTimeout(watchdog);
      clearTimeout(safetyTimers[key]);
      if (state.queue.length > 0 && sentinel && state.hasMore && isKeyActive(key)) {
        sentinel.textContent = '';
      }
    }
  }

  function renderNext(key = getActiveFeedKey(), count = 2) {
    if (!feedMode) return;
    const state = feedStates[key];
    if (!state || state.queue.length === 0) return;

    const targetEl = document.getElementById(state.elId);
    if (!targetEl) return;

    const toRender = state.queue.splice(0, count);
    if (toRender.length === 0) return;

    const fragment = document.createDocumentFragment();
    toRender.forEach(it => {
      fragment.appendChild(window.UltraVid.card.createCard(it, itemCallbacks));
    });
    targetEl.appendChild(fragment);
    refreshIcons();

    if (isKeyActive(key)) {
      updateCardObserver(key);
    }

    // Proactive Buffer Check: trigger next batch if queue drops to <= 4
    if (state.queue.length <= 4 && !state.isFetching && state.hasMore) {
      fetchBatch(key, state.page);
    }

    // Stationary Viewport Check: ensure page has real vertical scroll depth
    if (state.queue.length > 0 && isKeyActive(key) && document.documentElement.scrollHeight <= (window.innerHeight + 300)) {
      renderNext(key, 2);
    }
  }

  async function ensureCategoryLoaded(key) {
    const state = feedStates[key];
    if (!state) return;

    if (state.initialized) return;

    const targetEl = document.getElementById(state.elId);
    if (!targetEl) return;

    // Render skeleton inside this category container if not already present
    if (!targetEl.querySelector('.skeleton-card') && !targetEl.querySelector('.card')) {
      if (window.UltraVid.card) {
        window.UltraVid.card.renderSkeleton(targetEl, 6);
      }
    }

    await fetchBatch(key, 1);

    if (state.queue.length > 0) {
      // Clear skeletons and inject real cards
      targetEl.innerHTML = '';
      renderNext(key, 6);
      state.initialized = true;

      // Proactively pre-fetch page 2
      if (state.hasMore && !state.isFetching) {
        fetchBatch(key, 2);
      }

      setupSentinelObserver();
    }
  }

  async function switchCategory(targetCategory) {
    if (targetCategory === currentCategory && isKeyActive(targetCategory)) {
      const state = feedStates[targetCategory];
      if (state && !state.initialized) {
        await ensureCategoryLoaded(targetCategory);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // Hide search grid if active
    const searchGrid = document.getElementById("grid-search");
    if (searchGrid) {
      searchGrid.classList.remove('active');
      searchGrid.classList.add('hidden');
    }

    // 1. Save scroll position of outgoing category
    if (feedStates[currentCategory]) {
      feedStates[currentCategory].scrollY = window.scrollY;
    }

    // 2. Hide outgoing grid
    const outEl = document.getElementById(feedStates[currentCategory].elId);
    if (outEl) {
      outEl.classList.remove('active');
      outEl.classList.add('hidden');
    }

    currentCategory = targetCategory;

    // 3. Show incoming grid
    const inEl = document.getElementById(feedStates[targetCategory].elId);
    if (inEl) {
      inEl.classList.remove('hidden');
      inEl.classList.add('active');
    }

    // 4. Update chip UI
    if (window.UltraVid.chips && typeof window.UltraVid.chips.setActive === 'function') {
      window.UltraVid.chips.setActive(targetCategory);
    }

    feedMode = true;

    const state = feedStates[targetCategory];
    if (!state.initialized) {
      await ensureCategoryLoaded(targetCategory);
    } else {
      // Instant 0ms swap: zero network requests, zero skeletons, exact scroll restored
      window.scrollTo(0, state.scrollY || 0);
      updateCardObserver(targetCategory);
      setupSentinelObserver();
    }
  }

  async function switchTab(targetTab) {
    if (targetTab === currentTab) {
      if (targetTab === 'home') {
        const state = feedStates[currentCategory];
        if (state && !state.initialized) {
          await ensureCategoryLoaded(currentCategory);
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (targetTab === 'trending') {
        const state = feedStates['trending'];
        if (state && !state.initialized) {
          await ensureCategoryLoaded('trending');
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      return;
    }

    // Close watchView if open
    const watchView = document.getElementById("watchView");
    if (watchView && !watchView.classList.contains("hidden")) {
      watchView.classList.add("hidden");
    }

    // 1. Save scroll position of outgoing tab
    if (currentTab === 'home') {
      if (feedStates[currentCategory]) {
        feedStates[currentCategory].scrollY = window.scrollY;
      }
    } else if (currentTab === 'trending') {
      if (feedStates['trending']) {
        feedStates['trending'].scrollY = window.scrollY;
      }
    } else if (currentTab === 'library') {
      tabScrollY['library'] = window.scrollY;
    }

    // 2. Hide outgoing tab
    const oldTabEl = document.getElementById(`tab-${currentTab}`);
    if (oldTabEl) {
      oldTabEl.classList.remove('active-tab');
      oldTabEl.classList.add('hidden');
    }

    currentTab = targetTab;

    // 3. Show incoming tab
    const newTabEl = document.getElementById(`tab-${targetTab}`);
    if (newTabEl) {
      newTabEl.classList.remove('hidden');
      newTabEl.classList.add('active-tab');
    }

    // 4. Update bottom nav UI
    const navMap = { home: 'navHome', trending: 'navTrending', library: 'navLibrary' };
    if (window.UltraVid.bottomNav) {
      window.UltraVid.bottomNav.setActive(navMap[targetTab] || 'navHome');
    }

    // 5. Handle Tab specifics
    if (targetTab === 'home') {
      feedMode = true;
      const state = feedStates[currentCategory];
      if (!state.initialized) {
        await ensureCategoryLoaded(currentCategory);
      } else {
        window.scrollTo(0, state.scrollY || 0);
        updateCardObserver(currentCategory);
        setupSentinelObserver();
      }
    } else if (targetTab === 'trending') {
      feedMode = true;
      const state = feedStates['trending'];
      if (!state.initialized) {
        await ensureCategoryLoaded('trending');
      } else {
        window.scrollTo(0, state.scrollY || 0);
        updateCardObserver('trending');
        setupSentinelObserver();
      }
    } else if (targetTab === 'library') {
      feedMode = false;
      if (cardObserver) cardObserver.disconnect();
      if (feedObserver) feedObserver.disconnect();
      const sentinel = getActiveSentinel();
      if (sentinel) sentinel.textContent = '';
      window.scrollTo(0, tabScrollY['library'] || 0);
      renderLibrary();
    }
  }

  function renderLibrary() {
    const libGrid = document.getElementById('libraryGrid');
    if (!libGrid) return;
    libGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 16px;color:#888;">
        <div style="font-size:48px;margin-bottom:12px">📥</div>
        <div style="font-size:16px;color:#fff;font-weight:600;margin-bottom:8px">Downloads & Offline Media</div>
        <div style="font-size:13px;max-width:320px;margin:0 auto 16px auto;line-height:1.4">
          Videos you download for offline playback will appear here. Manage offline files or start new downloads anytime.
        </div>
        <button type="button" class="btn" id="libDlManagerBtn" style="padding:10px 20px;font-size:13px">
          ⬇ Open Downloads Manager
        </button>
      </div>
    `;
    const btn = document.getElementById('libDlManagerBtn');
    if (btn && window.UltraVid.player) {
      btn.onclick = () => window.UltraVid.player.openDownloads();
    }
    refreshIcons();
  }

  function showSearchMode() {
    document.querySelectorAll('#feed-containers-wrap .category-feed').forEach(el => {
      el.classList.remove('active');
      el.classList.add('hidden');
    });
    const searchGrid = document.getElementById('grid-search');
    if (searchGrid) {
      searchGrid.classList.remove('hidden');
      searchGrid.classList.add('active');
    }
    feedMode = false;
    if (cardObserver) cardObserver.disconnect();
    if (feedObserver) feedObserver.disconnect();
  }

  function renderCards(items) {
    const targetEl = getActiveGrid();
    if (!targetEl) return;
    targetEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    items.forEach(it => {
      fragment.appendChild(window.UltraVid.card.createCard(it, itemCallbacks));
    });
    targetEl.appendChild(fragment);
    refreshIcons();
  }

  function appendCards(items) {
    const targetEl = getActiveGrid();
    if (!targetEl) return;
    const fragment = document.createDocumentFragment();
    items.forEach(it => {
      fragment.appendChild(window.UltraVid.card.createCard(it, itemCallbacks));
    });
    targetEl.appendChild(fragment);
    refreshIcons();
  }

  async function initFeed(isFresh = true) {
    currentTab = 'home';
    currentCategory = 'all';
    const state = feedStates['all'];
    if (isFresh) {
      state.page = 1;
      state.queue = [];
      state.seenIds.clear();
      state.hasMore = true;
      state.isFetching = false;
      state.initialized = false;
      state.seed = Math.floor(Math.random() * 1000);
      state.emptyCount = 0;
    }

    // Ensure Tier 1 tab-home and Tier 2 grid-all are active and visible in DOM
    document.querySelectorAll('.tab-view').forEach(t => {
      t.classList.remove('active-tab');
      t.classList.add('hidden');
    });
    const homeEl = document.getElementById('tab-home');
    if (homeEl) {
      homeEl.classList.remove('hidden');
      homeEl.classList.add('active-tab');
    }

    const allGrid = document.getElementById('grid-all');
    if (allGrid) {
      allGrid.classList.remove('hidden');
      allGrid.classList.add('active');
    }

    // Boot hydration: load 'all' category immediately
    await ensureCategoryLoaded('all');
  }

  function setFeedMode(mode) {
    feedMode = Boolean(mode);
    if (!feedMode) {
      if (cardObserver) cardObserver.disconnect();
      if (feedObserver) feedObserver.disconnect();
      const sentinel = getActiveSentinel();
      if (sentinel) sentinel.textContent = '';
    }
  }

  function getGrid() {
    return getActiveGrid();
  }

  function getCurrentCategory() {
    return currentCategory;
  }

  function getCurrentTab() {
    return currentTab;
  }

  function getFeedStates() {
    return feedStates;
  }

  // Global Inspector Utility
  window.feedStates = feedStates;
  window.inspectFeedMetadata = (key = 'all') => {
    const state = feedStates[key];
    const q = (state && state.queue) || [];
    console.table(q);
    return q;
  };

  window.UltraVid.feed = {
    init,
    initFeed,
    fetchBatch,
    renderNext,
    renderCards,
    appendCards,
    ensureCategoryLoaded,
    switchCategory,
    switchTab,
    showSearchMode,
    setFeedMode,
    getGrid,
    getCurrentCategory,
    getCurrentTab,
    getFeedStates,
    prefetchThumbnails,
    inspectFeedMetadata: window.inspectFeedMetadata,
    showFeedError,
    retryCategory
  };
})();
