/**
 * UltraVid Bottom Navigation Bar Component (Tier 1 Tab Controller)
 */
window.UltraVid = window.UltraVid || {};

(function() {
  let navHome = null;
  let navTrending = null;
  let navLibrary = null;

  function init(callbacks = {}) {
    navHome = document.getElementById("navHome");
    navTrending = document.getElementById("navTrending");
    navLibrary = document.getElementById("navLibrary");

    if (navHome) {
      navHome.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const feed = window.UltraVid.feed;
        if (feed && typeof feed.switchTab === "function") {
          feed.switchTab("home");
        } else {
          setActive("navHome");
          if (typeof callbacks.onHome === "function") callbacks.onHome();
        }
      };
    }

    if (navTrending) {
      navTrending.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const feed = window.UltraVid.feed;
        if (feed && typeof feed.switchTab === "function") {
          feed.switchTab("trending");
        } else {
          setActive("navTrending");
          if (typeof callbacks.onTrending === "function") callbacks.onTrending();
        }
      };
    }

    if (navLibrary) {
      navLibrary.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const feed = window.UltraVid.feed;
        if (feed && typeof feed.switchTab === "function") {
          feed.switchTab("library");
        } else {
          setActive("navLibrary");
          if (typeof callbacks.onLibrary === "function") callbacks.onLibrary();
        }
      };
    }
  }

  function setActive(tabId) {
    document.querySelectorAll(".nav-tab").forEach(t => {
      t.classList.toggle("active", t.id === tabId);
    });
  }

  window.UltraVid.bottomNav = {
    init,
    setActive
  };
})();
