# Phase 16 — UltraVid Multi-Tier Cache Engine Specification

**System Objective:** Eradicate playback delays and eliminate the "Stale Cache 403 Forbidden" spinner bug through an active, tiered caching hierarchy.

---

## 1. Multi-Tier Cache Hierarchy Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   ULTRAVID MULTI-TIER CACHE ARCHITECTURE               │
├───────┬──────────────────────┬─────────────┬───────────┬───────────────┤
│ Tier  │ Subsystem            │ Medium      │ Latency   │ Max Size      │
├───────┼──────────────────────┼─────────────┼───────────┼───────────────┤
│ **L1**│ Stream Ring Buffer   │ Off-Heap RAM│ **<1ms**  │ 16 MB         │
│ **L2**│ Media Segment Cache  │ Flash Disk  │ **<15ms** │ 256 MB – 1 GB │
│ **L3**│ Extracted Manifests  │ RAM Memory  │ **<2ms**  │ 100 Entities  │
│ **L4**│ Relational DB (Room) │ SQLite Disk │ **<25ms** │ Unbounded     │
│ **L5**│ Thumbnail Cache      │ Coil Hybrid │ **<10ms** │ 250 MB Disk   │
└───────┴──────────────────────┴─────────────┴───────────┴───────────────┘
```

---

## 2. Technical Subsystem Specifications

### 2.1 L1: In-Memory Fast Ring Buffer (RAM)
- **Role:** Holds the first 500ms–2,000ms of audio and video frames for the current video and the next queued video.
- **Mechanism:** Implemented as a circular direct `ByteBuffer` ring. When the user taps play, ExoPlayer does not wait on flash disk reads or network sockets; it immediately reads the pre-buffered initialization segment and initial media samples directly from RAM.
- **Advantage:** Guarantees Time-to-First-Frame under **200ms**.

### 2.2 L2: Media Segment Cache (Flash Disk)
- **Engine:** AndroidX Media3 `SimpleCache` with `LeastRecentlyUsedCacheEvictor`.
- **Dynamic Sizing Policy:**
  ```kotlin
  fun calculateOptimalCacheSize(context: Context): Long {
      val stat = StatFs(context.cacheDir.path)
      val availableBytes = stat.availableBlocksLong * stat.blockSizeLong
      return when {
          availableBytes > 30L * 1024 * 1024 * 1024 -> 1024L * 1024 * 1024 // 1 GB on high-storage devices
          availableBytes > 10L * 1024 * 1024 * 1024 -> 512L * 1024 * 1024  // 512 MB standard
          else -> 128L * 1024 * 1024                                       // 128 MB budget phones
      }
  }
  ```
- **Chunk Slicing:** Writes 2 MB fragment blocks via `CacheDataSink`, allowing fine-grained LRU eviction without deleting full video files.

### 2.3 L3 & Active URL Expiration Guard ("Anti-403 Engine")
The most notorious bug in YouTube clients is the **Infinite Spinner / 403 Forbidden Bug**, caused by cached `googlevideo.com` CDN URLs that expire or become invalid.

UltraVid resolves this by embedding an **Active Expiration Sentinel**:
```kotlin
data class CachedStreamInfo(
    val streamInfo: StreamInfo,
    val resolvedAt: Long = System.currentTimeMillis(),
    val expiresAt: Long = extractCdnExpiry(streamInfo)
) {
    fun isStale(): Boolean {
        // Enforce a 5-minute safety threshold prior to CDN expiration
        val safetyMarginMs = 5 * 60 * 1000L
        return System.currentTimeMillis() > (expiresAt - safetyMarginMs)
    }

    companion object {
        fun extractCdnExpiry(info: StreamInfo): Long {
            val firstUrl = info.videoStreams.firstOrNull()?.content
                ?: info.audioStreams.firstOrNull()?.content
                ?: return System.currentTimeMillis() + (60 * 60 * 1000L) // 1h fallback

            val uri = Uri.parse(firstUrl)
            val expireSec = uri.getQueryParameter("expire")?.toLongOrNull()
            return if (expireSec != null) expireSec * 1000L else System.currentTimeMillis() + (60 * 60 * 1000L)
        }
    }
}
```

- **Behavior:**
  When `StreamRepository.getStream(videoId)` is called:
  1. Checks if cached item exists.
  2. If `cached.isStale() == true`: Immediately drops the entry and fires a fresh background extraction to InnerTube.
  3. The player is **never** handed an expired URL; HTTP 403 errors are prevented before they can occur!

### 2.4 L4: Room Database Schema (`ultravid.db`)
- **Entities:**
  - `StreamHistoryEntity`: Tracks view timestamp, watch duration, and completion percentage.
  - `PlaybackProgressEntity`: Saves resume position for all videos played >5 seconds.
  - `SubscriptionEntity`: Offline cache of channel subscriptions and metadata.
  - `BookmarkEntity`: User playlists and saved videos.

### 2.5 L5: Image & Thumbnail Optimization
- **Image Pipeline:** Coil 3.x with OkHttp network fetcher.
- **Memory Optimization:** Automatically activates `Bitmap.Config.RGB_565` (16 bits per pixel instead of 32 bits) on devices with <4 GB RAM, saving 50% bitmap memory.
- **Bitmap Pool:** Recycles bitmap allocations during feed scrolling, eliminating Dalvik GC frame drops.
