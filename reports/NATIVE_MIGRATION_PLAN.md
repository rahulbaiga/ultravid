# UltraVid Native Android Architecture & Migration Plan

This plan documents the step-by-step roadmap to transition UltraVid from its current WebView wrapper into a 100% native Android application built with Jetpack Compose, Media3 (ExoPlayer), Room, and Kotlin Coroutines.

---

## 1. Current Architecture Audit

| Component | Current Implementation | Migration Target |
| :--- | :--- | :--- |
| **UI Framework** | WebView (`MainActivity.kt`) rendering HTML5/CSS SPA | 100% Jetpack Compose (Declarative UI) |
| **Media Playback** | HTML5 `<video>` & HLS.js inside WebView | Media3 / ExoPlayer with custom Compose controls |
| **State Management** | Global JavaScript objects / DOM state | AndroidX `ViewModel` + `StateFlow` / `SharedFlow` |
| **Networking** | JavaScript `fetch()` -> Localhost Python backend | Ktor HTTP Client / Retrofit + Kotlinx Serialization |
| **Persistence** | LocalStorage / SQLite via Python cache | Android Room Database (Offline cache, history, playlists) |
| **Downloads** | `AndroidBridge.downloadMedia` -> Android DownloadManager | WorkManager + Media3 DownloadManager (segmented resume) |
| **Background Audio** | Limited to WebView focus/wakelocks | `MediaSessionService` (Media3 background audio + notifications) |

---

## 2. Target Layered Architecture

```
┌────────────────────────────────────────────────────────┐
│               Jetpack Compose UI Layer                 │
│  (HomeScreen, WatchScreen, SearchBar, VideoCards, etc) │
└───────────────────────────┬────────────────────────────┘
                            │ observes StateFlow
┌───────────────────────────▼────────────────────────────┐
│                    ViewModel Layer                     │
│  (HomeViewModel, WatchViewModel, DownloadsViewModel)   │
└───────────────────────────┬────────────────────────────┘
                            │ delegates
┌───────────────────────────▼────────────────────────────┐
│                    Repository Layer                    │
│   (VideoRepository, StreamRepository, DownloadRepo)    │
└─────────────┬──────────────────────────────┬───────────┘
              │                              │
    ┌─────────▼─────────┐          ┌─────────▼─────────┐
    │  Room Database    │          │  Network Service  │
    │  - Watch History  │          │  - UltraVid API   │
    │  - Bookmarks      │          │  - InnerTube      │
    │  - Offline Media  │          │  - Direct Proxy   │
    └───────────────────┘          └───────────────────┘
              │                              │
┌─────────────▼──────────────────────────────▼───────────┐
│               Platform Engines / Services              │
│  - Media3 ExoPlayer Engine (HLS, DASH, Progressive)    │
│  - MediaSessionService (Lock screen controls & audio)  │
│  - WorkManager (Background video/audio downloading)    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Incremental Migration Phases

### Phase A: Core Domain Models & Networking (Foundation)
- Create data models: `VideoItem`, `StreamManifest`, `QualityOption`, `ChannelInfo`.
- Implement `UltraVidApiService` using `Ktor-client-android` with `kotlinx.serialization`.
- Bind to existing local FastAPI backend endpoints (`/api/feed`, `/api/stream/resolve`, `/api/search`).

### Phase B: Media3 Native Playback Engine
- Add `androidx.media3:media3-exoplayer`, `media3-ui`, and `media3-session`.
- Implement `UltraVidPlayerManager` wrapping `ExoPlayer`:
  - Direct progressive MP4 playback with hardware AAC audio.
  - Adaptive HLS playlist streaming for live broadcasts.
  - Non-destructive quality switching without buffer flushes.
  - Background audio playback via foreground `MediaSessionService`.

### Phase C: Jetpack Compose UI Screens
- **Design System**: Compose Material 3 theme matching YouTube dark-mode aesthetics.
- **Components**:
  - `VideoFeedCard`: Thumbnail, title, duration pill, channel avatar, view count.
  - `WatchPlayerView`: AndroidView embedding `PlayerView` with custom Compose gesture overlay (tap to play/pause, double-tap 10s skip, brightness/volume gestures).
  - `QualitySelectionBottomSheet`: Dynamic stream selection sheet.
  - `SearchScreen`: Debounced search suggestions and results.

### Phase D: Persistence with Room Database
- Database entities:
  - `HistoryEntity`: Video ID, title, channel, timestamp, resume position.
  - `DownloadEntity`: File path, stream URL, resolution, file size, status.
  - `BookmarkEntity`: User-saved playlists and favorites.
- Expose data as reactive `Flow<List<T>>` to ViewModels.

### Phase E: Background Downloads via WorkManager
- Implement `DownloadWorker` using Android `WorkManager`.
- Resume interrupted downloads with `Range: bytes=X-` support.
- Automatically save metadata to Room.
