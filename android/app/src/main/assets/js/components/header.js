/**
 * UltraVid Header & Full-Screen YouTube Search Overlay Component
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { escapeHtml, isUrl, refreshIcons } = window.UltraVid.utils;

  let logoBtn = null;
  let searchTriggerBtn = null;
  let searchOverlay = null;
  let searchBackBtn = null;
  let fullSearchInput = null;
  let searchClearBtn = null;
  let searchSuggestionsList = null;

  let isOverlayOpen = false;
  let suggestTimer = null;
  let currentSuggestions = [];
  let activeSuggestIdx = -1;

  function init(callbacks = {}) {
    logoBtn = document.getElementById("logoBtn");
    searchTriggerBtn = document.getElementById("searchTriggerBtn");
    searchOverlay = document.getElementById("searchOverlay");
    searchBackBtn = document.getElementById("searchBackBtn");
    fullSearchInput = document.getElementById("fullSearchInput");
    searchClearBtn = document.getElementById("searchClearBtn");
    searchSuggestionsList = document.getElementById("searchSuggestionsList");

    if (logoBtn && typeof callbacks.onLogoClick === "function") {
      logoBtn.onclick = () => {
        closeSearch(false);
        setValue("");
        callbacks.onLogoClick();
      };
    }

    if (searchTriggerBtn) {
      searchTriggerBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        openSearch();
      };
    }

    if (searchBackBtn) {
      searchBackBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        closeSearch(true);
      };
    }

    // Handle physical Android back button via History API
    window.addEventListener("popstate", (e) => {
      if (isOverlayOpen || (searchOverlay && !searchOverlay.classList.contains("hidden"))) {
        closeSearch(false);
      }
    });

    if (searchClearBtn) {
      searchClearBtn.onclick = () => {
        if (fullSearchInput) {
          fullSearchInput.value = "";
          fullSearchInput.focus();
        }
        searchClearBtn.classList.add("hidden");
        if (searchSuggestionsList) searchSuggestionsList.innerHTML = "";
        window.scrollTo(0, 0);
        if (typeof callbacks.onClear === "function") {
          callbacks.onClear();
        }
      };
    }

    if (fullSearchInput) {
      fullSearchInput.addEventListener("input", () => {
        const val = fullSearchInput.value.trim();
        if (searchClearBtn) searchClearBtn.classList.toggle("hidden", !val);
        clearTimeout(suggestTimer);
        if (!val) {
          if (searchSuggestionsList) searchSuggestionsList.innerHTML = "";
          currentSuggestions = [];
          activeSuggestIdx = -1;
        } else {
          suggestTimer = setTimeout(() => fetchAndShowSuggestions(val, callbacks), 140);
        }
      });

      fullSearchInput.addEventListener("keydown", (e) => {
        if (isOverlayOpen && currentSuggestions.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            activeSuggestIdx = (activeSuggestIdx + 1) % currentSuggestions.length;
            highlightSuggestion(activeSuggestIdx);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            activeSuggestIdx = (activeSuggestIdx - 1 + currentSuggestions.length) % currentSuggestions.length;
            highlightSuggestion(activeSuggestIdx);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            closeSearch(true);
            return;
          }
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const q = fullSearchInput.value.trim();
          if (q) {
            closeSearch(true);
            if (typeof callbacks.onSearch === "function") {
              callbacks.onSearch(q);
            }
          }
        }
      });
    }
  }

  function openSearch() {
    if (!searchOverlay) return;
    document.body.classList.add('search-locked');
    window.scrollTo(0, 0);
    if (searchSuggestionsList) searchSuggestionsList.scrollTop = 0;

    searchOverlay.classList.remove("hidden");
    isOverlayOpen = true;

    try {
      history.pushState({ searchOpen: true }, "");
    } catch (e) {}

    requestAnimationFrame(() => {
      if (fullSearchInput) {
        fullSearchInput.focus();
        const val = fullSearchInput.value.trim();
        if (searchClearBtn) searchClearBtn.classList.toggle("hidden", !val);
        if (val) {
          fetchAndShowSuggestions(val);
        }
      }
    });
    refreshIcons();
  }

  function closeSearch(triggerHistoryBack = false) {
    isOverlayOpen = false;

    document.body.classList.remove('search-locked');
    if (searchOverlay) searchOverlay.classList.add("hidden");
    if (fullSearchInput) fullSearchInput.blur();
    hideSuggestions();

    if (triggerHistoryBack) {
      if (history.state && history.state.searchOpen) {
        history.back();
      }
    }
  }

  async function fetchAndShowSuggestions(val, callbacks = {}) {
    val = (val || "").trim();
    if (!val || isUrl(val)) {
      if (searchSuggestionsList) searchSuggestionsList.innerHTML = "";
      return;
    }
    try {
      const data = await window.UltraVid.api.fetchSuggestions(val);
      const suggs = (data && data.suggestions) || [];
      if (!fullSearchInput || fullSearchInput.value.trim().toLowerCase() !== val.toLowerCase()) return;
      if (suggs.length === 0) {
        if (searchSuggestionsList) searchSuggestionsList.innerHTML = "";
        return;
      }
      currentSuggestions = suggs;
      activeSuggestIdx = -1;
      renderSuggestions(suggs, val, callbacks);
    } catch (e) {
      if (searchSuggestionsList) searchSuggestionsList.innerHTML = "";
    }
  }

  function renderSuggestions(suggs, query, callbacks = {}) {
    if (!searchSuggestionsList) return;
    searchSuggestionsList.innerHTML = "";
    const qLower = query.toLowerCase();

    suggs.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "suggestion-row";
      row.setAttribute("data-idx", idx);

      let label = escapeHtml(item);
      const itemLower = item.toLowerCase();
      if (itemLower.startsWith(qLower)) {
        label = `${escapeHtml(item.slice(0, query.length))}<b>${escapeHtml(item.slice(query.length))}</b>`;
      }

      row.innerHTML = `
        <span class="sugg-icon-left"><i data-lucide="search"></i></span>
        <span class="sugg-label">${label}</span>
        <button type="button" class="insert-query-btn" title="Insert query" aria-label="Insert query">
          <i data-lucide="arrow-up-left"></i>
        </button>
      `;

      row.onclick = () => {
        if (fullSearchInput) fullSearchInput.value = item;
        closeSearch(true);
        if (window.UltraVid && typeof window.UltraVid.doSearch === "function") {
          window.UltraVid.doSearch(item);
        } else if (typeof callbacks.onSearch === "function") {
          callbacks.onSearch(item);
        }
      };

      const fillBtn = row.querySelector(".insert-query-btn");
      if (fillBtn) {
        fillBtn.onclick = (e) => {
          e.stopPropagation();
          if (fullSearchInput) {
            fullSearchInput.value = item;
            fullSearchInput.focus();
          }
          if (searchClearBtn) searchClearBtn.classList.remove("hidden");
          fetchAndShowSuggestions(item, callbacks);
        };
      }

      searchSuggestionsList.appendChild(row);
    });

    refreshIcons();
  }

  function highlightSuggestion(idx) {
    if (!searchSuggestionsList) return;
    const items = searchSuggestionsList.querySelectorAll(".suggestion-row");
    items.forEach((el, i) => {
      const isSel = (i === idx);
      el.classList.toggle("selected", isSel);
      if (isSel) {
        el.scrollIntoView({ block: "nearest" });
        if (currentSuggestions[i] && fullSearchInput) {
          fullSearchInput.value = currentSuggestions[i];
        }
      }
    });
  }

  function hideSuggestions() {
    if (searchSuggestionsList) searchSuggestionsList.innerHTML = "";
    activeSuggestIdx = -1;
    currentSuggestions = [];
  }

  function getValue() {
    return (fullSearchInput && fullSearchInput.value.trim()) || "";
  }

  function setValue(val) {
    if (fullSearchInput) {
      fullSearchInput.value = val;
      if (searchClearBtn) searchClearBtn.classList.toggle("hidden", !val);
    }
  }

  function focus() {
    if (fullSearchInput) fullSearchInput.focus();
  }

  window.UltraVid.header = {
    init,
    openSearch,
    closeSearch,
    closeSearchOverlay: closeSearch,
    hideSuggestions,
    getValue,
    setValue,
    focus
  };
})();
