/**
 * UltraVid Category Chips Bar Component (Tier 2 Container Controller)
 */
window.UltraVid = window.UltraVid || {};

(function() {
  let chipContainer = null;
  let currentCategory = 'all';

  function init(callbacks = {}) {
    chipContainer = document.getElementById("chipContainer") || document.getElementById("chipsBar");
    if (!chipContainer) return;

    chipContainer.querySelectorAll('.chip').forEach(chip => {
      chip.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const targetCat = chip.dataset.cat || 'all';
        handleSelect(targetCat, callbacks);
      };
    });
  }

  async function handleSelect(targetCat, callbacks = {}) {
    const feed = window.UltraVid.feed;
    if (feed && typeof feed.switchCategory === 'function') {
      await feed.switchCategory(targetCat);
    } else {
      setActive(targetCat);
      if (typeof callbacks.onSelect === "function") {
        callbacks.onSelect(targetCat);
      }
    }
  }

  function setActive(category) {
    currentCategory = category || 'all';
    if (!chipContainer) {
      chipContainer = document.getElementById("chipContainer") || document.getElementById("chipsBar");
    }
    if (!chipContainer) return;
    chipContainer.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', c.dataset.cat === currentCategory);
    });
  }

  function clearActive() {
    if (!chipContainer) {
      chipContainer = document.getElementById("chipContainer") || document.getElementById("chipsBar");
    }
    if (!chipContainer) return;
    chipContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  }

  function getCategory() {
    return currentCategory;
  }

  window.UltraVid.chips = {
    init,
    setActive,
    clearActive,
    getCategory,
    handleSelect
  };
})();
