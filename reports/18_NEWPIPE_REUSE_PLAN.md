# Phase 18 — NewPipe Code Reuse & Refactoring Blueprint

**Objective:** Define a concrete, file-by-file catalog detailing what code to **directly import**, what code to **refactor into modern Kotlin**, and what code to **completely discard** in UltraVid.

---

## 1. Subsystem Action Matrix: Keep vs. Refactor vs. Discard

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   NEWPIPE CODE REUSE CLASSIFICATION                    │
├──────────────────────┬─────────────────────────────────────────────────┤
│ **1. DIRECT IMPORT** │ • YouTube DASH Manifest Generators              │
│                      │ • InnerTube Payload Formulas & Schemas          │
│                      │ • Storyboard Sprite Sheet Math                  │
│                      │ • Itag Database & Codec Bitmaps                 │
│                      │ • Botguard PO-Token WebView Logic               │
├──────────────────────┼─────────────────────────────────────────────────┤
│ **2. REFACTOR**      │ • YoutubeHttpDataSource ➔ OkHttp Interceptor    │
│                      │ • InfoCache ➔ Expiration-Guarded Cache          │
│                      │ • LoadController ➔ Fast-Start Media3 Control    │
│                      │ • Room Database ➔ Coroutine Flow DAOs           │
│                      │ • RxJava Streams ➔ Kotlin Coroutines & Flow     │
├──────────────────────┼─────────────────────────────────────────────────┤
│ **3. DISCARD**       │ • GigaGet (us.shandian.giga) & Java MP4 Muxer   │
│                      │ • Legacy PlayerService & MediaBrowserCompat     │
│                      │ • All XML Layouts, Views, and Fragments         │
│                      │ • Mozilla Rhino JavaScript Engine               │
│                      │ • SerializedCache (Java ObjectOutputStream)     │
└──────────────────────┴─────────────────────────────────────────────────┘
```

---

## 2. Granular File-by-File Reuse Inventory

### 2.1 Category 1: Direct Code Reuse (Import with Minor Cleanup)

1. **`org.schabi.newpipe.extractor.services.youtube.dashmanifestcreators.*`**
   - Files: `YoutubeProgressiveDashManifestCreator.java`, `YoutubeOtfDashManifestCreator.java`, `YoutubePostLiveStreamDvrDashManifestCreator.java`.
   - *Rationale:* These classes contain flawless, battle-tested algorithms for synthesizing compliant MPEG-DASH XML documents from YouTube's `initRange` and `indexRange` byte offsets.
   - *Action:* Port directly into Kotlin under `core:extractor:dash`.
2. **`org.schabi.newpipe.extractor.services.youtube.ItagItem.java`**
   - *Rationale:* Complete dictionary mapping every YouTube video and audio itag (e.g. 18, 22, 137, 248, 251, 313) to its codec, container, resolution, bitrate, and FPS.
   - *Action:* Import directly into `core:model:ItagItem.kt`.
3. **`org.schabi.newpipe.util.potoken.PoTokenWebView.kt` & `PoTokenProviderImpl.kt`**
   - *Rationale:* Extracts genuine YouTube Botguard PO-Tokens using the Android system WebView, preventing bot blocks on web client requests.
   - *Action:* Retain as fallback PO-token generator under `core:extractor:potoken`.
4. **`org.schabi.newpipe.player.seekbarpreview.SeekbarPreviewThumbnailHolder.java`**
   - *Rationale:* Contains exact mathematical bounds calculations for cutting storyboard preview tiles from YouTube sprite sheets.
   - *Action:* Port tile calculation math into `feature:player:storyboard`.
5. **`org.schabi.newpipe.player.helper.YoutubeDashLiveManifestParser.java`**
   - *Rationale:* Corrects YouTube live DASH manifests for ExoPlayer ingestion.
   - *Action:* Import directly into `core:media:dash`.

---

### 2.2 Category 2: Refactor & Modernize (Clean-Slate Redesign)

1. **`YoutubeHttpDataSource.java` ➔ `YouTubeOkHttpInterceptor.kt`**
   - *Current:* Subclasses ExoPlayer `DefaultHttpDataSource` and establishes connections using `java.net.HttpURLConnection`.
   - *Refactoring:* Convert into an OkHttp `Interceptor` that appends `&rn=` and `&range=` query parameters, feeding directly into Media3's `OkHttpDataSource.Factory`.
2. **`InfoCache.java` ➔ `ActiveStreamCache.kt`**
   - *Current:* Caches `StreamInfo` for 1 hour without checking underlying Google Video CDN token expiration, causing 403 Forbidden errors.
   - *Refactoring:* Add an active `expire=` query parameter parser that triggers a silent background re-resolution 5 minutes prior to CDN URL expiration.
3. **`LoadController.java` ➔ `UltraVidLoadControl.kt`**
   - *Current:* Uses ExoPlayer default 2,500ms playback start buffer and 0s back-buffer.
   - *Refactoring:* Implement Media3 `DefaultLoadControl` configured with **300ms fast-start buffer** and **30-second keyframe back-buffer**.
4. **`AppDatabase.kt` & DAOs ➔ Kotlin Coroutine Flow Room Database**
   - *Current:* Uses Room with RxJava `Single`/`Completable` return types.
   - *Refactoring:* Migrate DAOs to return Kotlin `Flow<List<T>>` and `suspend fun`, integrating natively with Jetpack Compose `collectAsStateWithLifecycle()`.
5. **`ExtractorHelper.java` ➔ `StreamRepository.kt`**
   - *Current:* Wraps extraction in RxJava `Single.fromCallable()`.
   - *Refactoring:* Re-architect as a Clean Architecture Repository using `suspend fun getStreamInfo(videoId: String): Result<StreamInfo>`.

---

### 2.3 Category 3: Completely Discard & Replace

1. **`us.shandian.giga.*` (GigaGet & `Mp4FromDashWriter.java`)**
   - *Why Discard:* Custom pure Java bitstream muxing consumes extreme CPU time and produces significant battery drain during downloads.
   - *Replacement:* AndroidX Media3 `DownloadManager` for segmented caching, and Android native `MediaMuxer` API for hardware-accelerated container muxing.
2. **`PlayerService.java` & `MediaBrowserCompat`**
   - *Why Discard:* Legacy pre-Media3 architecture with complex notification handlers and foreground service startup edge cases.
   - *Replacement:* AndroidX `androidx.media3.session.MediaSessionService`.
3. **All XML Layouts, ViewBinding, and Legacy Fragments**
   - *Why Discard:* Fragment transactions and XML view inflation introduce UI thread jank and 300ms–600ms of startup lag.
   - *Replacement:* 100% Jetpack Compose and Material 3 design system.
4. **`org.mozilla.javascript` (Mozilla Rhino)**
   - *Why Discard:* Interprets JavaScript in Java bytecode, introducing 200ms CPU lag during cipher deciphering.
   - *Replacement:* QuickJS C-JNI engine (<2ms execution) or pre-compiled AST regex evaluation.
5. **`SerializedCache.java`**
   - *Why Discard:* Uses slow Java `ObjectOutputStream` serialization to bypass 1 MB Binder limits.
   - *Replacement:* In-memory singleton state repository with immutable Kotlin data classes.
