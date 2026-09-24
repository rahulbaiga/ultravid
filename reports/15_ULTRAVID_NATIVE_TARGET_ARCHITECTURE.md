# Phase 15 — UltraVid Native Target Architecture Blueprint

**Target Platform:** Native Android (Min SDK 26, Target SDK 34 / 35, ARM64-v8a + armeabi-v7a)  
**Primary Tech Stack:** Kotlin 2.x, AndroidX Media3 1.3+, Jetpack Compose (BOM 2024.x), Room 2.6+, OkHttp 5, Koin / Hilt, Kotlin Coroutines & Flow

---

## 1. Modular Architecture Overview

UltraVid will be structured as a scalable, clean-architecture multi-module project:

```text
ultravid/
├── app/                              # Application bootstrap, routing, navigation host
├── core/
│   ├── common/                       # Utilities, dispatchers, extensions, constants
│   ├── model/                        # Domain entities (Video, StreamInfo, Channel, Format)
│   ├── network/                      # OkHttp 5 singleton, HTTP/2/3 pool, interceptors
│   ├── database/                     # AndroidX Room (AppDatabase, DAOs, Migrations)
│   ├── extractor/                    # Native Kotlin InnerTube client & cipher deobfuscator
│   └── media/                        # AndroidX Media3 engine, LoadControl, DataSource
└── feature/
    ├── feed/                         # Home trending, subscriptions, search (Compose UI)
    ├── player/                       # Video player view, gestures, controls, PiP, queue
    ├── detail/                       # Video info, comments, related videos sheet
    ├── download/                     # Background download manager & WorkManager workers
    └── settings/                     # User preferences, theme, playback quality defaults
```

---

## 2. Core Subsystem Blueprints

### 2.1 Media Engine (`core:media`)
- **Engine Core:** `androidx.media3.exoplayer.ExoPlayer`
- **Service Hosting:** `androidx.media3.session.MediaSessionService` (Replaces NewPipe's legacy `PlayerService`).
  - Implements `MediaSession.Callback` for external transport controls.
  - Automatically provisions system notifications, Bluetooth AVRCP metadata, and lockscreen artwork without manual notification builder boilerplate.
- **Fast-Start Load Control:**
  ```kotlin
  @Provides
  fun provideUltraVidLoadControl(): LoadControl = DefaultLoadControl.Builder()
      .setBufferDurationsMs(
          /* minBufferMs = */ 20_000,
          /* maxBufferMs = */ 60_000,
          /* bufferForPlaybackMs = */ 300,              // 300ms playback start!
          /* bufferForPlaybackAfterRebufferMs = */ 1000 // Fast recover
      )
      .setBackBuffer(
          /* backBufferDurationMs = */ 30_000,          // 30s keyframe back-buffer
          /* retainBackBufferFromKeyframe = */ true
      )
      .setPrioritizeTimeOverSizeThresholds(true)
      .build()
  ```
- **Unified MediaDataSource:**
  ```kotlin
  @Provides
  fun provideMediaDataSourceFactory(
      okHttpClient: OkHttpClient,
      cache: SimpleCache
  ): DataSource.Factory {
      val okHttpFactory = OkHttpDataSource.Factory(okHttpClient)
          .setUserAgent(NetworkConstants.SPOOFED_USER_AGENT)

      return CacheDataSource.Factory()
          .setCache(cache)
          .setUpstreamDataSourceFactory(okHttpFactory)
          .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
  }
  ```

### 2.2 Extraction Engine (`core:extractor`)
- **Native Pure-Kotlin Extraction:** Direct port of NewPipe's `YoutubeStreamExtractor` and `YoutubeStreamHelper` into idiomatic Kotlin with coroutine suspending functions.
- **Multi-Persona InnerTube Client:**
  - Primary Persona: **`VISIONOS`** (bypasses bot checks, unthrottled 4K streams).
  - Secondary Persona: **`IOS`** (fallback for mobile formats and audio streams).
  - Tertiary Persona: **`WEB`** with Botguard PO-Token.
- **Pre-Compiled Cipher Dispatcher:**
  - Deciphers `n` parameters and signatures using pre-compiled AST regex evaluation or an ultra-lightweight QuickJS C-JNI bridge (<100 KB binary), eliminating Mozilla Rhino's 200ms interpretation lag.

### 2.3 UI Layer (`feature:player` & `feature:feed`)
- **100% Jetpack Compose:**
  - Main Activity hosts a single `NavHost` managing destinations: `FeedScreen`, `SearchScreen`, `LibraryScreen`, `SettingsScreen`.
- **Sliding Video Player Sheet:**
  - Implemented using Compose `BottomSheetScaffold` or a custom drag-gesture layout.
  - Fullscreen mode: Expands over the screen.
  - Minimized mode: Anchors as a mini-player bar above the bottom navigation, maintaining uninterrupted playback.
- **Hardware Compose Player Binding:**
  ```kotlin
  @Composable
  fun VideoSurface(
      player: Player,
      modifier: Modifier = Modifier
  ) {
      AndroidView(
          factory = { context ->
              PlayerView(context).apply {
                  useController = false
                  this.player = player
                  resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
              }
          },
          modifier = modifier
      )
  }
  ```

---

## 3. Playback State Machine (MVI / Unidirectional Data Flow)

```text
[User Gesture / Scroll Event]
             │
             ▼
    [FeedViewModel] ──── (Card in Viewport > 400ms) ───► [PrefetchManager]
             │                                                  │
             │ (User Clicks Video)                              ▼
             ▼                                          [Pre-warm Manifest]
   [PlayerViewModel]                                            │
             │                                                  ▼
             ├──► Emit PlaybackUiState.Loading (0ms UI Feedback)
             │
             ├──► Read Manifest from L1 Cache (Instant!)
             │
             ├──► MediaSessionService.prepare(mediaSource)
             │
             └──► Media3 Transitions: BUFFERING (300ms) ──► READY
                                                                │
                                                                ▼
                                                [FIRST FRAME RENDERED]
```
