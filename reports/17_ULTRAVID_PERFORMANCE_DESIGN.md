# Phase 17 — UltraVid 0.2s–0.4s Instant Playback Engineering Specification

**Target Benchmark:** Time-to-First-Frame (TTFF) **< 400 milliseconds** (Industry standard for "Instant Playback").  
**Current Baseline (NewPipe & UltraVid Web):** 3,500ms – 6,000ms.

---

## 1. The 5-Layer Latency Elimination Architecture

To bridge the gap from 4.0 seconds down to 0.3 seconds, UltraVid eliminates latency across every layer of the playback pipeline:

```text
┌────────────────────────────────────────────────────────────────────────┐
│               LATENCY WATERFALL: NEWPIPE VS. ULTRAVID TARGET           │
├───────────────────────────────┬───────────────────┬────────────────────┤
│ Operation                     │ NewPipe Latency   │ UltraVid Latency   │
├───────────────────────────────┼───────────────────┼────────────────────┤
│ 1. Stream Resolution          │ 1,200ms – 2,000ms │ **0ms (Pre-warm)** │
│ 2. TCP + TLS Handshake        │ 200ms – 400ms     │ **0ms (Warm Pool)**│
│ 3. Manifest Synthesizer       │ 80ms – 150ms      │ **<5ms (Coroutines)│
│ 4. Playback Buffer Delay      │ 2,500ms (Hardcode)│ **300ms (Fast-Start│
│ 5. Surface & Codec Binding    │ 150ms – 250ms     │ **40ms (Compose)** │
├───────────────────────────────┼───────────────────┼────────────────────┤
│ **TOTAL TIME-TO-FIRST-FRAME** │ **4,130ms – 5,300ms** **345ms (INSTANT)** │
└───────────────────────────────┴───────────────────┴────────────────────┘
```

---

## 2. Technical Implementation Specifications

### 2.1 Viewport Pre-warming & Predictive Fetching
In standard streaming apps, stream extraction only starts **after** the user lifts their finger from the touch screen (`onClick`).

UltraVid introduces **Viewport Predictive Pre-warming** directly inside Jetpack Compose `LazyColumn`:
```kotlin
@Composable
fun FeedVideoCard(
    video: VideoItem,
    lazyListState: LazyListState,
    index: Int,
    prefetchManager: PrefetchManager,
    onClick: () -> Unit
) {
    val isVisible by remember {
        derivedStateOf {
            val layoutInfo = lazyListState.layoutInfo
            val visibleItem = layoutInfo.visibleItemsInfo.find { it.index == index }
            if (visibleItem != null) {
                val viewportHeight = layoutInfo.viewportEndOffset - layoutInfo.viewportStartOffset
                val itemVisibleSize = minOf(visibleItem.offset + visibleItem.size, viewportHeight) - maxOf(visibleItem.offset, 0)
                (itemVisibleSize.toFloat() / visibleItem.size) >= 0.75f // Card is >=75% visible
            } else false
        }
    }

    LaunchedEffect(isVisible) {
        if (isVisible) {
            delay(350) // Dwell time: User paused scrolling on this card
            prefetchManager.prewarmVideo(video.id)
        }
    }

    // Card UI rendering...
}
```

- **Execution:**
  When a card is 75% visible for >350ms, `PrefetchManager` requests InnerTube stream metadata in a low-priority background coroutine.
  When the user taps the card, **stream extraction is already complete**. Latency is reduced to **0ms**.

### 2.2 Fast-Start Load Control (`UltraVidLoadControl`)
- **ExoPlayer Bottleneck:** NewPipe's `DEFAULT_BUFFER_FOR_PLAYBACK_MS = 2500ms` forces the player to wait for 2.5 seconds of media chunks before rendering frame 1.
- **UltraVid Tuning:**
  ```kotlin
  val loadControl = DefaultLoadControl.Builder()
      .setBufferDurationsMs(
          /* minBufferMs = */ 15_000,
          /* maxBufferMs = */ 50_000,
          /* bufferForPlaybackMs = */ 250,              // Starts after only 250ms of audio/video!
          /* bufferForPlaybackAfterRebufferMs = */ 1000 // Fast resume on hiccup
      )
      .setBackBuffer(30_000, true)                      // 30s keyframe back-buffer
      .build()
  ```
- **Result:** Renders the first video frame as soon as the initial 250ms chunk arrives! The remaining 15 seconds buffer smoothly in the background while the video is already playing.

### 2.3 OkHttp 5 Warm Socket Pool & HTTP/2 Multiplexing
- **ExoPlayer Bottleneck:** NewPipe's `YoutubeHttpDataSource` uses `HttpURLConnection`, suffering cold TCP handshakes on chunk requests.
- **UltraVid Tuning:**
  Shares a single singleton `OkHttpClient` between the extraction engine, Coil image loader, and `OkHttpDataSource.Factory`.
  Pre-warms connections to `https://rr---sn-*.googlevideo.com` and `https://youtubei.googleapis.com`.
  Media chunks stream over pre-existing HTTP/2 connections with zero TLS negotiation overhead.

### 2.4 QuickJS Native Cipher Deciphering Engine
- **ExoPlayer Bottleneck:** Mozilla Rhino interprets JavaScript in Java bytecode, consuming 200ms of CPU time to decode YouTube's `n` parameter and signature.
- **UltraVid Tuning:**
  Integrates `QuickJS-Android` (a lightweight C-based JavaScript runtime via JNI). QuickJS executes YouTube's base deobfuscation function in **<2ms**, cutting CPU overhead by 98%.

### 2.5 Composite Multi-Representation DASH Manifest Generator
- **NewPipe Bottleneck:** Changing quality (e.g. 720p to 1080p) destroys the `MediaSource`, generating a 1.5s black-screen reload.
- **UltraVid Tuning:**
  Synthesizes an in-memory MPEG-DASH XML manifest containing **all available video resolutions (360p, 720p, 1080p, 1440p, 4K)** inside a single `<AdaptationSet>`.
  ExoPlayer's `AdaptiveTrackSelection` smoothly switches resolutions dynamically based on bandwidth, with **zero screen freezes and zero reloads**.
