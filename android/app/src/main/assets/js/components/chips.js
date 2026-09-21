/**
 * UltraVid Category Chips Bar Component (Tier 2 Container Controller)
 */
window.UltraVid = window.UltraVid || {};

(function() {
  let chipContainer = null;
  let currentActiveCategory = 'all';
  let registeredCallbacks = {};

  function init(callbacks = {}) {
    registeredCallbacks = callbacks || {};
    chipContainer = document.getElementById("chipContainer") || document.getElementById("chipsBar");
    if (!chipContainer) return;

    chipContainer.querySelectorAll('.chip, .chip-btn').forEach(chip => {
      chip.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const targetCat = chip.dataset.category || chip.dataset.cat || 'all';
        selectCategory(targetCat, true);
      };
    });
  }

  function selectCategory(categoryKey, pushHistory = true) {
    categoryKey = (categoryKey || 'all').toLowerCase().trim();
    if (categoryKey === currentActiveCategory && !pushHistory) return;

    // 1. Push state to browser history if triggered by direct user tap
    if (pushHistory) {
      if (categoryKey === currentActiveCategory) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!history.state || history.state.category !== categoryKey) {
        history.pushState(
          { view: 'feed', category: categoryKey },
          '',
          '#feed/' + categoryKey
        );
      }
    }

    // 2. Update visual active state on chip elements & scroll into view
    setActive(categoryKey);

    // 3. Delegate to FeedComponent / feed to switch isolated container grids
    const feed = (window.UltraVid && window.UltraVid.feed) || window.FeedComponent;
    if (feed && typeof feed.switchCategory === 'function') {
      feed.switchCategory(categoryKey);
    } else if (window.FeedComponent && typeof window.FeedComponent.switchCategory === 'function') {
      window.FeedComponent.switchCategory(categoryKey);
    }

    if (typeof registeredCallbacks.onSelect === 'function') {
      registeredCallbacks.onSelect(categoryKey);
    }

    currentActiveCategory = categoryKey;
    window.currentActiveCategory = categoryKey;

    if (typeof window.reconcileFeedViewport === 'function') {
      window.reconcileFeedViewport(categoryKey);
    }
  }

  function setActive(category) {
    currentActiveCategory = (category || 'all').toLowerCase().trim();
    window.currentActiveCategory = currentActiveCategory;
    if (!chipContainer) {
      chipContainer = document.getElementById("chipContainer") || document.getElementById("chipsBar");
    }
    const chips = chipContainer
      ? chipContainer.querySelectorAll('.chip, .chip-btn')
      : document.querySelectorAll('.chip, .chip-btn');

    chips.forEach(btn => {
      const cat = (btn.dataset.category || btn.dataset.cat || '').toLowerCase().trim();
      const isMatch = cat === currentActiveCategory;
      btn.classList.toggle('active', isMatch);
      if (isMatch) {
        try {
          btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } catch (err) {}
      }
    });
  }

  function clearActive() {
    if (!chipContainer) {
      chipContainer = document.getElementById("chipContainer") || document.getElementById("chipsBar");
    }
    const chips = chipContainer
      ? chipContainer.querySelectorAll('.chip, .chip-btn')
      : document.querySelectorAll('.chip, .chip-btn');
    chips.forEach(btn => btn.classList.remove('active'));
  }

  function getCategory() {
    return currentActiveCategory;
  }

  function handleSelect(targetCat, callbacks = {}) {
    if (callbacks && typeof callbacks.onSelect === 'function') {
      registeredCallbacks.onSelect = callbacks.onSelect;
    }
    selectCategory(targetCat, true);
  }

  const chipsApi = {
    init,
    selectCategory,
    setActive,
    clearActive,
    getCategory,
    handleSelect
  };

  window.UltraVid.chips = chipsApi;
  window.ChipsComponent = chipsApi;
})();
