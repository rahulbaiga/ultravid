/**
 * UltraVid 3-Dot Quick Action Sheet Component
 */
window.UltraVid = window.UltraVid || {};

(function() {
  const { refreshIcons } = window.UltraVid.utils;

  let overlay = null;
  let sheet = null;
  let qaTitle = null;
  let qaClose = null;
  let qaDlMp4 = null;
  let qaDlMp3 = null;
  let qaShare = null;
  let selectedVideo = null;

  function init(callbacks = {}) {
    overlay = document.getElementById("quickActionOverlay");
    sheet = document.getElementById("quickActionSheet");
    qaTitle = document.getElementById("qaTitle");
    qaClose = document.getElementById("qaClose");
    qaDlMp4 = document.getElementById("qaDlMp4");
    qaDlMp3 = document.getElementById("qaDlMp3");
    qaShare = document.getElementById("qaShare");

    if (qaClose) qaClose.onclick = close;
    if (overlay) {
      overlay.onclick = (e) => {
        if (e.target === overlay) close();
      };
    }

    if (qaDlMp4) {
      qaDlMp4.onclick = () => {
        const vid = selectedVideo;
        close();
        if (vid && typeof callbacks.onDownloadMp4 === "function") {
          callbacks.onDownloadMp4(vid);
        }
      };
    }

    if (qaDlMp3) {
      qaDlMp3.onclick = () => {
        const vid = selectedVideo;
        close();
        if (vid && typeof callbacks.onDownloadMp3 === "function") {
          callbacks.onDownloadMp3(vid);
        }
      };
    }

    if (qaShare) {
      qaShare.onclick = async () => {
        const vid = selectedVideo;
        close();
        if (vid && typeof callbacks.onShare === "function") {
          callbacks.onShare(vid);
        } else if (vid && vid.url) {
          try {
            await navigator.clipboard.writeText(vid.url);
            const shareMsg = document.getElementById("shareMsg");
            if (shareMsg) {
              shareMsg.textContent = "Link copied: " + (vid.title || "");
              shareMsg.classList.remove("hidden");
              setTimeout(() => shareMsg.classList.add("hidden"), 2500);
            } else {
              const toast = document.createElement("div");
              toast.textContent = "Link copied to clipboard";
              toast.style.cssText = "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);";
              document.body.appendChild(toast);
              setTimeout(() => toast.remove(), 2500);
            }
          } catch (e) {
            console.warn("Clipboard write failed:", e);
          }
        }
      };
    }
  }

  function open(videoItem) {
    selectedVideo = videoItem;
    if (qaTitle) {
      qaTitle.textContent = (videoItem && videoItem.title) || "Video Options";
    }
    if (overlay && sheet) {
      overlay.classList.remove("hidden");
      requestAnimationFrame(() => sheet.classList.remove("sheet-hidden"));
    }
    refreshIcons();
  }

  function close() {
    if (sheet) sheet.classList.add("sheet-hidden");
    if (overlay) setTimeout(() => overlay.classList.add("hidden"), 220);
  }

  function getSelectedVideo() {
    return selectedVideo;
  }

  window.UltraVid.actionSheet = {
    init,
    open,
    close,
    getSelectedVideo
  };
})();
