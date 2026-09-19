# UltraVid — Super VidMate (Hybrid Python Engine + Native Android App)

UltraVid is a fast, ad-free, VidMate-style media app: search YouTube / Instagram / Facebook / X,
stream instantly with sound, and save MP4 (merged video+audio) or MP3 offline.
It pairs a Python FastAPI streaming engine (Termux / laptop / server) with a lightweight
native Android WebView wrapper that downloads directly on-device.

## Hybrid Architecture

```
┌─────────────────────────┐      InnerTube / yt-dlp       ┌──────────────────┐
│  Android App (Kotlin)   │      HTTPS / streams          │  YouTube, IG, FB │
│  MainActivity + WebView │◄──────────────────────────────│  X, TikTok, ...  │
│  AndroidBridge (native  │                               └──────────────────┘
│   DownloadManager)      │      JSON API (FastAPI)
│  assets/index.html+app  │◄──── /api/search /extract ────►┌──────────────────┐
└─────────────────────────┘      /api/download /feed      │ ultravid backend │
                                                          │ app/innertube.py │
                                                          │ app/extractor.py │
                                                          └──────────────────┘
```

- **Turbo path (sub-second):** `app/innertube.py` talks directly to YouTube InnerTube
  (`/youtubei/v1/search`, `/youtubei/v1/player`) over persistent HTTP/2 with an
  in-memory TTL cache. ANDROID client for player streams, TVHTML5/WEB fallback for search.
- **Fallback path:** `yt-dlp` in `app/extractor.py` for full DASH format lists and
  Instagram / Facebook / X / TikTok URLs.
- **Downloads:** `app/download_manager.py` background queue — yt-dlp + ffmpeg merge
  (`-c copy` to MP4, no re-encode lag) or MP3 extract, with per-task progress polling.

## Directory Structure

```
ultravid/
├── app/
│   ├── main.py              # FastAPI: /health, /api/search|extract|download|feed, static UI
│   ├── innertube.py         # Turbo InnerTube engine (persistent HTTP/2 + TTL cache)
│   ├── extractor.py         # yt-dlp universal extractor + turbo-first routing
│   ├── download_manager.py  # async download queue (ffmpeg merge / MP3)
│   ├── models.py            # Pydantic schemas
│   ├── static/index.html    # zero-dependency dark mobile-first UI
│   ├── static/app.js        # search, watch view, quality switch, bottom-sheet downloads,
│   │                        # auto-feed + infinite scroll (IntersectionObserver)
│   └── downloads/           # server-side downloads (gitignored)
├── android/                 # native wrapper (WebView + DownloadManager bridge)
│   ├── app/src/main/java/com/ultravid/app/MainActivity.kt
│   ├── app/src/main/AndroidManifest.xml
│   ├── app/src/main/assets/{index.html,app.js}  # synced copy of web UI
│   ├── build.gradle / app/build.gradle / settings.gradle
│   └── gradle.properties (AndroidX) + gradle wrapper
├── .github/workflows/build-apk.yml  # CI: assembleDebug + artifact UltraVid-v1.0-debug
├── run.sh                   # `bash run.sh` → uvicorn on 0.0.0.0:8000
└── newpipe_analysis.json    # NewPipeExtractor InnerTube research notes
```

## JavaScript-to-Native Bridge

`MainActivity` injects `AndroidBridge` into the WebView (`addJavascriptInterface`):

| JS call | Native behavior |
|---|---|
| `AndroidBridge.downloadMedia(url, title, ext)` | Enqueues via Android `DownloadManager` into Public Downloads with completion notification |
| `AndroidBridge.toast(msg)` | Short Toast for feedback |
| `AndroidBridge.shareText(text)` | System share sheet (`ACTION_SEND`) |

The activity extends plain `android.app.Activity` (no AppCompat theme dependency → zero
`IllegalStateException` crash on launch), builds the WebView programmatically, enables
JS + DOM storage + file access, and routes links/back-press inside the WebView.

## GitHub Actions CI/CD

`.github/workflows/build-apk.yml` on every `push` to `main` (plus manual dispatch):

1. `actions/checkout@v4`, `setup-java@v4` (Temurin 17), `gradle/actions/setup-gradle@v4`
2. Accept SDK licenses non-interactively:
   `yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses`
3. Sync `app/static/*` → `android/app/src/main/assets/`
4. `./gradlew assembleDebug --no-daemon --stacktrace` (wrapper jar committed;
   AGP 8.2.2, Kotlin 1.9.22, SDK 34, Java 17)
5. Upload `android/app/build/outputs/apk/debug/*.apk` as artifact `UltraVid-v1.0-debug`

## Local Setup on Laptop

```bash
git clone https://github.com/rahulbaiga/ultravid.git && cd ultravid
python3 -m venv venv && ./venv/bin/pip install fastapi uvicorn yt-dlp httpx
bash run.sh            # serves http://localhost:8000
# Endpoints: GET /health, GET /api/search?q=.., POST /api/extract,
#            GET /api/feed?page=1&limit=10, POST /api/download
```

Android (needs SDK 34 + Java 17): `cd android && ./gradlew assembleDebug`.

## Roadmap

- [ ] Offline vault (PIN + encrypted storage)
- [ ] Auto subtitles + translate, built-in MP4/MKV/MP3 converter
- [ ] Cloud sync (Drive / S3), background + PiP playback
- [ ] Adaptive HLS/DASH in-player for 1080p+ with sound
- [ ] Release signing + Play-ready `assembleRelease` lane

## Agent Guidelines

- Backend is sync-first FastAPI; `innertube.py` exposes both `async` and `*_sync`
  variants — endpoints are `async` and must use the `async` variants.
- Never create per-request `httpx` clients; reuse the persistent pooled singletons.
- `extractor.extract()` routes YouTube → turbo first, IG/FB/X → yt-dlp; keep it that way.
- Web UI must stay dependency-free (no CDNs); keep `#mediaGrid` + `#scrollSentinel`
  contract for infinite scroll, and downloads inside the bottom-sheet only.
- Every Android change must keep `Activity` (not AppCompat), no layout XML requirement,
  and valid Groovy DSL (`minifyEnabled`, never `isMinifyEnabled`).
