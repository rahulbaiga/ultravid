/**
 * UltraVid Multi-Container Infinite Scroll Feed Engine
 * Industry-Standard Two-Tier Persistent Container Architecture
 * Resilient Startup Hydration & Viewport Watchdog
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { refreshIcons } = window.UltraVid.utils;

  const ALL_CATEGORIES = [
    'all', 'gaming', 'tech', 'movies', 'music', 
    'science', 'sports', 'comedy', 'food', 'trending'
  ];

  function getActiveCategory() {
    return window.currentActiveCategory || 'all';
  }

  // Persistent state registry for all categories and tabs (Sandboxed Multi-Tenant State Machine)
  const feedStates = {};

  // Initialize isolated sandbox for each category
  ALL_CATEGORIES.concat(['search']).forEach(cat => {
    if (!feedStates[cat]) {
      feedStates[cat] = {
        page: 1,
        queue: [],
        seenIds: new Set(),
        hasMore: true,
        isFetching: false,
        fetchStartTime: 0,
        abortController: null,
        scrollY: 0,
        initialized: false,
        epoch: 0,
        elId: cat === 'trending' ? 'grid-trending' : `grid-${cat}`,
        emptyCount: 0,
        seed: Math.floor(Math.random() * 1000)
      };
    }
  });

  window.currentActiveCategory = window.currentActiveCategory || 'all';
  let currentCategory = getActiveCategory();
  let currentTab = 'home';
  let feedMode = true;
  let tabScrollY = { home: 0, trending: 0, library: 0 };

  let homeSentinel = null;
  let trendingSentinel = null;
  let cardObserver = null;
  let feedObserver = null;
  let scrollThrottle = false;
  const safetyTimers = {};
  const activeAbortControllers = {};

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
    if (currentTab === 'home') return getActiveCategory();
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

  function clearErrorBanners(container) {
    if (!container) return;
    const banners = container.querySelectorAll('.feed-error-banner, .error-card, .error-container, [data-error-banner="true"]');
    banners.forEach(b => b.remove());
  }

  function showFeedError(containerOrKey, key) {
    const targetKey = (typeof containerOrKey === 'string') ? containerOrKey : (key || getActiveFeedKey() || 'all');
    const state = targetKey ? feedStates[targetKey] : null;
    const container = (containerOrKey && containerOrKey.nodeType) ? containerOrKey : (state ? document.getElementById(state.elId) : null);
    if (!container) return;

    // Suppress error banner if existing cards are already visible in this container
    const realCards = container.querySelectorAll('.card:not(.skeleton-card)').length;
    if (realCards > 0) {
      clearErrorBanners(container);
      return;
    }

    clearErrorBanners(container);

    const banner = document.createElement('div');
    banner.className = 'feed-error-banner error-card error-container';
    banner.setAttribute('data-error-banner', 'true');
    banner.style.cssText = 'grid-column:1/-1;text-align:center;padding:48px 16px;color:#888;width:100%;';
    banner.innerHTML = `
      <div style="font-size:32px;margin-bottom:12px">⚠️</div>
      <div style="font-size:15px;color:#fff;font-weight:600;margin-bottom:6px">Couldn't load feed</div>
      <div style="font-size:13px;margin-bottom:16px">Check your network connection and try again.</div>
      <button type="button" class="btn" style="padding:8px 20px;font-size:13px" onclick="window.UltraVid.feed.retryCategory('${targetKey || 'all'}')">↻ Tap to retry</button>
    `;
    container.innerHTML = '';
    container.appendChild(banner);

    const sentinel = getActiveSentinel();
    if (sentinel && isKeyActive(targetKey)) sentinel.textContent = '';
  }

  async function retryCategory(key) {
    const targetKey = key || getActiveFeedKey() || 'all';
    const state = feedStates[targetKey];
    if (state && state.abortController) {
      try { state.abortController.abort(); } catch (e) {}
      state.abortController = null;
    }
    if (activeAbortControllers[targetKey]) {
      try { activeAbortControllers[targetKey].abort(); } catch (e) {}
      delete activeAbortControllers[targetKey];
    }
    clearTimeout(safetyTimers[targetKey]);

    const container = state ? document.getElementById(state.elId) : null;
    if (container) {
      clearErrorBanners(container);
      container.innerHTML = getSkeletonMarkup(4);
    }

    if (state) {
      state.initialized = false;
      state.isFetching = false;
      state.fetchStartTime = 0;
      state.page = 1;
      state.hasMore = true;
      state.emptyCount = 0;
      state.seenIds.clear();
      state.queue = [];
    }

    await optimisticRefresh(targetKey);
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
    if (!state || !state.hasMore) return;

    // Deadlock Breaker: If already fetching, check if it's a dead latch (> 6 seconds)
    if (state.isFetching) {
      if (Date.now() - (state.fetchStartTime || 0) > 6000) {
        console.warn(`[FeedEngine] Breaking dead isFetching lock for [${key}]`);
        state.isFetching = false;
      } else {
        return;
      }
    }

    const targetPage = pageToFetch != null ? pageToFetch : state.page;

    // Cancel previous in-flight controller if active
    if (state.abortController) {
      try { state.abortController.abort(); } catch (e) {}
      state.abortController = null;
    }
    if (activeAbortControllers[key]) {
      try { activeAbortControllers[key].abort(); } catch (e) {}
      delete activeAbortControllers[key];
    }
    const abortController = new AbortController();
    state.abortController = abortController;
    activeAbortControllers[key] = abortController;

    state.isFetching = true;
    state.fetchStartTime = Date.now();
    const thisEpoch = ++state.epoch;

    const timeoutDuration = (targetPage === 1) ? 18000 : 25000;

    clearTimeout(safetyTimers[key]);
    safetyTimers[key] = setTimeout(() => {
      if (thisEpoch === state.epoch && state.isFetching) {
        state.isFetching = false;
      }
    }, timeoutDuration + 2000);

    // Watchdog timer for initial batch (18000ms adaptive expansion)
    const watchdog = setTimeout(() => {
      if (thisEpoch === state.epoch && state.isFetching && state.queue.length === 0 && targetPage === 1) {
        console.warn(`[FeedEngine] Cold fetch timed out after ${timeoutDuration}ms for ${key}`);
        state.isFetching = false;
        const container = document.getElementById(state.elId);
        const realCards = container ? container.querySelectorAll('.card:not(.skeleton-card)').length : 0;
        if (realCards === 0 && container) {
          showFeedError(container, key);
        }
      }
    }, timeoutDuration);

    const sentinel = getActiveSentinel();
    if (sentinel && state.queue.length === 0 && isKeyActive(key)) {
      sentinel.textContent = 'Loading more videos…';
    }

    const categoryParam = key === 'trending' ? 'trending' : key;

    try {
      const j = (window.ApiService && typeof window.ApiService.getFeed === 'function')
        ? await window.ApiService.getFeed(key, targetPage, 12, { signal: abortController.signal })
        : await window.UltraVid.api.fetchFeed({
            page: targetPage,
            limit: 12,
            seed: state.seed,
            category: categoryParam,
            signal: abortController.signal
          }, { signal: abortController.signal });

      clearTimeout(watchdog);

      if (thisEpoch !== state.epoch) {
        // Discard stale responses cleanly without state corruption
        return;
      }

      const rawItems = (j && Array.isArray(j.results)) ? j.results : [];

      if (rawItems.length === 0) {
        state.emptyCount = (state.emptyCount || 0) + 1;
        state.page = targetPage + 1;
        if (state.emptyCount >= 4) {
          state.hasMore = false;
          if (sentinel && isKeyActive(key)) sentinel.textContent = 'No more videos';
        } else {
          setTimeout(() => {
            if (state.hasMore && !state.isFetching && isKeyActive(key)) {
              fetchBatch(key, targetPage + 1);
            }
          }, 300);
        }
        return;
      }

      // Filter unseen items
      let freshItems = rawItems.filter(it => it.id && !state.seenIds.has(it.id));

      // Duplicate punch-through handling:
      // If all items were duplicates of seen items, we don't treat this as empty/terminal.
      // If we've seen a lot of videos (> 60), clear seenIds and loop back seamlessly.
      // Otherwise, advance page to punch through the duplicate cluster.
      if (freshItems.length === 0) {
        console.log(`[FeedEngine] Duplicate batch on page ${targetPage} for [${key}]. Auto-advancing.`);
        state.page = targetPage + 1;
        if (state.seenIds.size > 60) {
          state.seenIds.clear();
          freshItems = rawItems;
        } else {
          // Autonomous punch-through retry on next page without penalizing hasMore
          setTimeout(() => {
            if (state.hasMore && !state.isFetching && isKeyActive(key)) {
              fetchBatch(key, targetPage + 1);
            }
          }, 200);
          return;
        }
      }

      freshItems.forEach(it => {
        if (it.id) {
          state.seenIds.add(it.id);
          state.queue.push(it);
        }
      });

      if (freshItems.length > 0 || state.queue.length > 0) {
        const container = document.getElementById(state.elId);
        if (container) clearErrorBanners(container);
        // Prefetch thumbnail images for this specific category batch
        prefetchThumbnails(freshItems);
        state.emptyCount = 0;
        state.page = Math.max(state.page, targetPage + 1);

        // Zero-Batch Wait: Immediately flush to DOM if container needs cards
        const activeCount = container ? container.querySelectorAll('.card:not(.skeleton-card)').length : 0;
        if (activeCount < 4 || state.queue.length > 0) {
          renderNext(key, 0);
        }
      }
    } catch (e) {
      clearTimeout(watchdog);
      if (e && (e.name === 'AbortError' || (e.message && e.message.toLowerCase().includes('abort')))) {
        console.log(`[FeedEngine] Clean fetch abort for [${key}]`);
        return;
      }
      console.error(`[FeedEngine] Fetch error for [${key}]:`, e);
      state.emptyCount = (state.emptyCount || 0) + 1;
      state.page = targetPage + 1;
      if (targetPage === 1 && state.queue.length === 0) {
        const container = document.getElementById(state.elId);
        const realCards = container ? container.querySelectorAll('.card:not(.skeleton-card)').length : 0;
        if (realCards === 0 && container) {
          showFeedError(container, key);
        }
        return;
      }
      if (state.emptyCount >= 4) {
        state.hasMore = false;
        if (sentinel && isKeyActive(key)) sentinel.textContent = 'No more videos';
      } else {
        setTimeout(() => {
          if (state.hasMore && !state.isFetching && isKeyActive(key)) {
            fetchBatch(key, targetPage + 1);
          }
        }, 500);
      }
    } finally {
      if (thisEpoch === state.epoch) {
        state.isFetching = false;
        state.abortController = null;
        if (activeAbortControllers[key] === abortController) {
          delete activeAbortControllers[key];
        }
      }
      clearTimeout(watchdog);
      clearTimeout(safetyTimers[key]);
      if (state.queue.length > 0 && sentinel && state.hasMore && isKeyActive(key)) {
        sentinel.textContent = '';
      }
    }
  }

  function renderNext(key = getActiveCategory(), maxCount = 0) {
    if (!feedMode || !key) return 0;
    const state = feedStates[key];
    if (!state || !state.queue || state.queue.length === 0) return 0;

    const container = document.getElementById(state.elId);
    if (!container) return 0;

    // If maxCount is 0 or unassigned, flush all available items in state.queue immediately
    const countToRender = maxCount > 0 ? Math.min(maxCount, state.queue.length) : state.queue.length;
    const batch = state.queue.splice(0, countToRender);
    if (batch.length === 0) return 0;

    // Remove initial static skeleton placeholders and error banners if present on first real render
    clearErrorBanners(container);
    const skeletons = container.querySelectorAll('.skeleton-card');
    if (skeletons.length > 0) {
      skeletons.forEach(s => s.remove());
    }

    const fragment = document.createDocumentFragment();
    batch.forEach(item => {
      // Deduplicate against already rendered IDs in container
      if (item && item.id) {
        const escapedId = window.CSS && window.CSS.escape ? window.CSS.escape(item.id) : item.id;
        if (container.querySelector(`[data-vid="${escapedId}"]`)) return;
      }
      const card = (window.CardComponent && typeof window.CardComponent.createCard === 'function')
        ? window.CardComponent.createCard(item, itemCallbacks)
        : (window.UltraVid && window.UltraVid.card ? window.UltraVid.card.createCard(item, itemCallbacks) : null);
      if (!card) return;
      if (item && item.id) {
        card.setAttribute('data-vid', item.id);
      }
      card.setAttribute('data-subtopic', (item && item.sub_topic) || '');
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
    refreshIcons();
    state.initialized = true;

    if (isKeyActive(key)) {
      updateCardObserver(key);
    }

    // Trigger proactive background refill if queue is running low
    if (state.queue.length <= 4 && !state.isFetching && state.hasMore) {
      fetchBatch(key, state.page);
    }

    // Stationary Viewport Check: ensure page has real vertical scroll depth
    if (state.queue.length > 0 && isKeyActive(key) && document.documentElement.scrollHeight <= (window.innerHeight + 300)) {
      renderNext(key, 0);
    }

    return batch.length;
  }

  async function ensureCategoryLoaded(key) {
    const state = feedStates[key];
    if (!state) return;

    if (state.initialized) return;

    const targetEl = document.getElementById(state.elId);
    if (!targetEl) return;
    clearErrorBanners(targetEl);

    // Render skeleton inside this category container if not already present
    if (!targetEl.querySelector('.skeleton-card') && !targetEl.querySelector('.card')) {
      if (window.UltraVid.card) {
        window.UltraVid.card.renderSkeleton(targetEl, 6);
      }
    }

    await fetchBatch(key, 1);

    // Clean up any remaining skeletons
    const skeletons = targetEl.querySelectorAll('.skeleton-card');
    skeletons.forEach(s => s.remove());

    if (state.queue.length > 0) {
      renderNext(key, 0);
    }
    state.initialized = true;

    // Proactively pre-fetch page 2
    if (state.hasMore && !state.isFetching) {
      fetchBatch(key, 2);
    }

    setupSentinelObserver();
    reconcileFeedViewport(key);
  }

  async function switchCategory(targetCategory) {
    if (targetCategory === currentCategory && isKeyActive(targetCategory)) {
      const state = feedStates[targetCategory];
      if (state && !state.initialized) {
        await ensureCategoryLoaded(targetCategory);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      reconcileFeedViewport(targetCategory);
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
    if (state && state.initialized) {
      // Instant 0ms reveal of pre-rendered container with zero skeletons and zero delay
      window.scrollTo(0, state.scrollY || 0);
      updateCardObserver(targetCategory);
      setupSentinelObserver();
      reconcileFeedViewport(targetCategory);
      return;
    }

    if (state && !state.initialized) {
      await ensureCategoryLoaded(targetCategory);
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

  const PRIORITY_PRELOAD_CATEGORIES = ['gaming', 'tech', 'music', 'movies'];

  function speculativePreloadCategories() {
    // Only execute when browser is idle to ensure zero impact on initial 'all' feed rendering
    const scheduleTask = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));

    scheduleTask(() => {
      let delay = 600; // Stagger requests to prevent thread and network congestion

      PRIORITY_PRELOAD_CATEGORIES.forEach(cat => {
        setTimeout(async () => {
          const state = feedStates[cat];
          // If already fetched or currently active, skip
          if (!state || state.initialized || state.isFetching || state.queue.length > 0) return;

          console.log(`[SpeculativePreloader] Silently preloading category [${cat}] in background...`);
          try {
            state.isFetching = true;
            const resp = (window.ApiService && typeof window.ApiService.getFeed === 'function')
              ? await window.ApiService.getFeed(cat, 1, 10)
              : ((window.UltraVid && window.UltraVid.api && typeof window.UltraVid.api.fetchFeed === 'function')
                  ? await window.UltraVid.api.fetchFeed({ category: cat, page: 1, limit: 10 })
                  : null);
            state.isFetching = false;

            if (resp && resp.results && resp.results.length > 0) {
              const freshItems = resp.results.filter(it => it.id && !state.seenIds.has(it.id));
              freshItems.forEach(it => {
                state.seenIds.add(it.id);
                state.queue.push(it);
              });

              // Warm image thumbnails into browser cache
              prefetchThumbnails(freshItems);

              // Pre-mount directly into the hidden DOM container
              const container = document.getElementById(state.elId);
              if (container) {
                const skeletons = container.querySelectorAll('.skeleton-card');
                skeletons.forEach(s => s.remove());

                const fragment = document.createDocumentFragment();
                freshItems.forEach(item => {
                  if (item && item.id) {
                    const escapedId = window.CSS && window.CSS.escape ? window.CSS.escape(item.id) : item.id;
                    if (container.querySelector(`[data-vid="${escapedId}"]`)) return;
                  }
                  const card = (window.CardComponent && typeof window.CardComponent.createCard === 'function')
                    ? window.CardComponent.createCard(item, itemCallbacks)
                    : (window.UltraVid && window.UltraVid.card ? window.UltraVid.card.createCard(item, itemCallbacks) : null);
                  if (card) {
                    if (item && item.id) {
                      card.setAttribute('data-vid', item.id);
                    }
                    card.setAttribute('data-subtopic', (item && item.sub_topic) || '');
                    fragment.appendChild(card);
                  }
                });
                container.appendChild(fragment);
                refreshIcons();
              }

              state.initialized = true;
              console.log(`[SpeculativePreloader] Category [${cat}] fully preloaded and mounted in background!`);
            }
          } catch (err) {
            state.isFetching = false;
            console.warn(`[SpeculativePreloader] Background pre-fetch for [${cat}] deferred:`, err);
          }
        }, delay);

        delay += 1200; // Stagger each category by 1.2 seconds
      });
    });
  }

  function prewarmCategories() {
    speculativePreloadCategories();
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

    // Trigger Speculative Eager Background Preloading immediately after 'all' mounts
    speculativePreloadCategories();
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

  function getSkeletonMarkup(count = 4) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += '<div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-meta"><div class="skeleton-avatar"></div><div class="skeleton-lines"><div class="skeleton-line long"></div><div class="skeleton-line short"></div></div></div></div>';
    }
    return html;
  }

  function reconcileFeedViewport(targetKey) {
    const key = targetKey || getActiveCategory();
    const state = feedStates[key];
    if (!state) return;

    const container = document.getElementById(state.elId);
    if (!container) return;

    const realCards = container.querySelectorAll('.card:not(.skeleton-card)').length;

    // DEADLOCK BREAKER: 0 cards and isFetching stuck for > 3.5s
    if (realCards === 0 && state.isFetching && (Date.now() - (state.fetchStartTime || 0) > 3500)) {
      console.warn(`[DeadlockBreaker] Breaking hung fetch lock on empty container for [${key}]!`);
      state.isFetching = false;
      state.fetchStartTime = 0;
      if (state.abortController) {
        try { state.abortController.abort(); } catch (e) {}
        state.abortController = null;
      }
      if (activeAbortControllers[key]) {
        try { activeAbortControllers[key].abort(); } catch (e) {}
        delete activeAbortControllers[key];
      }
    }

    // Condition A: Container is starved, but queue has preloaded items -> FLUSH IMMEDIATELY
    if (realCards === 0 && state.queue && state.queue.length > 0) {
      console.warn(`[SelfHealing] Universal starvation recovery triggered for [${key}]. Flushing ${state.queue.length} items.`);
      renderNext(key, 0);
      return;
    }

    // Condition B: Container is empty, queue is dry, and not actively fetching -> TRIGGER EMERGENCY HYDRATION
    if (realCards === 0 && (!state.queue || state.queue.length === 0) && !state.isFetching) {
      console.warn(`[SelfHealing] Emergency feed hydration for [${key}]`);
      fetchBatch(key, 1);
    }
  }

  // Trigger universal check whenever user switches category chips
  window.reconcileFeedViewport = reconcileFeedViewport;

  // Run reconciliation guard whenever active tab changes visibility
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      reconcileFeedViewport(getActiveCategory());
    }
  });

  // Universal 1.5s invariant safety sweep across ACTIVE category and background categories
  setInterval(() => {
    const active = getActiveCategory();
    reconcileFeedViewport(active);
    ALL_CATEGORIES.forEach(cat => {
      if (cat !== active && feedStates[cat] && feedStates[cat].queue && feedStates[cat].queue.length > 0) {
        const cEl = document.getElementById(feedStates[cat].elId);
        if (cEl && cEl.querySelectorAll('.card:not(.skeleton-card)').length === 0) {
          renderNext(cat, 0);
        }
      }
    });
  }, 1500);

  async function optimisticRefresh(categoryKey) {
    const key = categoryKey || getActiveCategory();
    const state = feedStates[key];
    if (!state) return;

    // 1. Forcibly abort in-flight requests and unlock mutex
    if (state.abortController) {
      try { state.abortController.abort(); } catch (e) {}
      state.abortController = null;
    }
    if (activeAbortControllers[key]) {
      try { activeAbortControllers[key].abort(); } catch (e) {}
      delete activeAbortControllers[key];
    }
    clearTimeout(safetyTimers[key]);

    const abortController = new AbortController();
    state.abortController = abortController;
    activeAbortControllers[key] = abortController;

    state.isFetching = true;
    state.fetchStartTime = Date.now();
    const thisEpoch = ++state.epoch;
    state.seed = Math.floor(Math.random() * 100000);

    const categoryParam = key === 'trending' ? 'trending' : key;
    const container = document.getElementById(state.elId);
    if (container) clearErrorBanners(container);

    // Zero-Blackout: Keep existing cards visible while in-flight.
    // If container was completely empty, show skeletons
    const existingCards = container ? container.querySelectorAll('.card:not(.skeleton-card)').length : 0;
    if (existingCards === 0 && container && !container.querySelector('.skeleton-card')) {
      container.innerHTML = getSkeletonMarkup(4);
    }

    try {
      const resp = (window.ApiService && typeof window.ApiService.getFeed === 'function')
        ? await window.ApiService.getFeed(categoryParam, 1, 12, {
            refresh: true,
            seed: state.seed,
            signal: abortController.signal
          })
        : await window.UltraVid.api.fetchFeed({
            page: 1,
            limit: 12,
            seed: state.seed,
            category: categoryParam,
            refresh: true,
            signal: abortController.signal
          }, { signal: abortController.signal });

      if (thisEpoch !== state.epoch) return;

      const rawItems = (resp && Array.isArray(resp.results)) ? resp.results : [];

      if (rawItems.length > 0 && container) {
        // Reset category state machine for fresh epoch
        state.seenIds.clear();
        rawItems.forEach(it => {
          if (it.id) state.seenIds.add(it.id);
        });
        state.queue = [];
        state.page = 2;
        state.hasMore = true;
        state.emptyCount = 0;
        state.initialized = true;

        // Build fresh cards fragment
        const fragment = document.createDocumentFragment();
        rawItems.forEach(item => {
          const card = (window.CardComponent && typeof window.CardComponent.createCard === 'function')
            ? window.CardComponent.createCard(item, itemCallbacks)
            : (window.UltraVid && window.UltraVid.card ? window.UltraVid.card.createCard(item, itemCallbacks) : null);
          if (card) {
            if (item && item.id) {
              card.setAttribute('data-vid', item.id);
            }
            card.setAttribute('data-subtopic', (item && item.sub_topic) || '');
            fragment.appendChild(card);
          }
        });

        // ATOMIC DOM REPLACEMENT: single tick wipe & append to eliminate phantom deduplication
        container.innerHTML = '';
        container.appendChild(fragment);
        clearErrorBanners(container);
        refreshIcons();
        prefetchThumbnails(rawItems);

        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (isKeyActive(key)) {
          updateCardObserver(key);
          setupSentinelObserver();
        }

        // Proactively prefetch Page 2 in background for seamless infinite scroll
        if (state.hasMore) {
          fetchBatch(key, 2);
        }
      } else if (rawItems.length === 0 && existingCards === 0 && container) {
        showFeedError(container, key);
      }
    } catch (e) {
      if (e && (e.name === 'AbortError' || (e.message && e.message.toLowerCase().includes('abort')))) {
        console.log(`[FeedEngine] Clean refresh abort for [${key}]`);
        return; // SILENTLY RETURN - DO NOT SHOW ERROR
      }
      console.error(`[FeedEngine] Refresh failed for [${key}]:`, e);
      // If real cards are already visible, DO NOT show an ugly full banner
      const currentCards = container ? container.querySelectorAll('.card:not(.skeleton-card)').length : 0;
      if (currentCards === 0 && container) {
        showFeedError(container, key);
      }
    } finally {
      if (thisEpoch === state.epoch) {
        state.isFetching = false;
        state.abortController = null;
        if (activeAbortControllers[key] === abortController) {
          delete activeAbortControllers[key];
        }
      }
      reconcileFeedViewport(key);
    }
  }

  // Global Inspector Utility
  window.feedStates = feedStates;
  window.inspectFeedMetadata = (key = 'all') => {
    const state = feedStates[key];
    const q = (state && state.queue) || [];
    console.table(q);
    return q;
  };

  // Expose ApiService compatibility shim
  window.ApiService = window.ApiService || {
    getFeed: (cat, page = 1, limit = 10, opts = {}) => {
      if (window.UltraVid && window.UltraVid.api && typeof window.UltraVid.api.fetchFeed === 'function') {
        return window.UltraVid.api.fetchFeed({
          category: cat,
          page,
          limit,
          seed: opts && opts.seed !== undefined ? opts.seed : 0,
          refresh: Boolean(opts && opts.refresh),
          signal: opts && opts.signal
        }, opts);
      }
      return Promise.reject(new Error("API not available"));
    }
  };

  if (window.UltraVid && window.UltraVid.card) {
    window.CardComponent = window.CardComponent || window.UltraVid.card;
  }

  window.UltraVid.feed = {
    init,
    initFeed,
    initHomeFeed: initFeed,
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
    retryCategory,
    prewarmCategories,
    speculativePreloadCategories,
    optimisticRefresh,
    reconcileFeedViewport
  };
  window.FeedComponent = window.UltraVid.feed;
})();
