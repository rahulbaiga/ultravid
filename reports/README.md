# UltraVid Engineering Reports, Architecture Audits & Forensic Scans

This folder contains all comprehensive architectural research, reverse-engineering forensics, environment audits, and system specifications conducted for UltraVid.

---

## 1. Executive Summaries & Verification Passes

| Report | Description |
| :--- | :--- |
| [**`MASTER_FORENSIC_EXECUTIVE_SUMMARY.md`**](./MASTER_FORENSIC_EXECUTIVE_SUMMARY.md) | High-level architectural synthesis of the entire NewPipe forensic investigation and key technical takeaways. |
| [**`19_FORENSIC_VERIFICATION.md`**](./19_FORENSIC_VERIFICATION.md) | Line-by-line verification pass of all 21 specific architectural claims with exact file paths, line ranges, AST citations, and benchmark harness specifications. |
| [**`benchmark_harness.py`**](./benchmark_harness.py) | Automated hardware benchmark test runner measuring 17 objective performance metrics via ADB. |
| [**`NEWPIPE_FORENSIC_ANALYSIS_REPORT.txt`**](./NEWPIPE_FORENSIC_ANALYSIS_REPORT.txt) | Plain-text consolidated export of all forensic audit sections. |

---

## 2. NewPipe Reverse-Engineering Forensics (Phases 1 – 18)

Comprehensive deep-dive analysis into the official NewPipe and NewPipeExtractor repositories:

- [**`01_NEWPIPE_REPOSITORY_MAP.md`**](./01_NEWPIPE_REPOSITORY_MAP.md) — Complete repository module, package, and dependency inventory.
- [**`02_VIDEO_PLAYBACK_PIPELINE.md`**](./02_VIDEO_PLAYBACK_PIPELINE.md) — Full tap-to-first-frame execution trace with sequence diagram.
- [**`03_STREAM_EXTRACTION_ANALYSIS.md`**](./03_STREAM_EXTRACTION_ANALYSIS.md) — YouTube InnerTube endpoints, `VISIONOS` client persona, and PO-token mechanisms.
- [**`04_CHUNK_AND_SEGMENT_LOADING.md`**](./04_CHUNK_AND_SEGMENT_LOADING.md) — DASH chunk mechanics, custom `&rn=` and `&range=` parameter injection.
- [**`05_BUFFERING_ANALYSIS.md`**](./05_BUFFERING_ANALYSIS.md) — LoadController configuration, buffer thresholds, and startup behavior.
- [**`06_NEWPIPE_CACHE_FORENSICS.md`**](./06_NEWPIPE_CACHE_FORENSICS.md) — Detailed catalog of all 9 NewPipe caches (RAM, disk, SQLite).
- [**`07_DOWNLOAD_ARCHITECTURE.md`**](./07_DOWNLOAD_ARCHITECTURE.md) — GigaGet multi-threaded range downloads, SAF integration, and Java MP4 muxer.
- [**`08_SEEK_AND_QUALITY_SWITCHING.md`**](./08_SEEK_AND_QUALITY_SWITCHING.md) — Position recovery, seek parameters (`EXACT` vs `CLOSEST_SYNC`), and quality reload mechanics.
- [**`09_BACKGROUND_AND_PIP.md`**](./09_BACKGROUND_AND_PIP.md) — MediaPlayback foreground service and WindowManager system overlay PiP implementation.
- [**`10_NETWORKING_ANALYSIS.md`**](./10_NETWORKING_ANALYSIS.md) — OkHttp 5 vs `HttpURLConnection` isolation and HTTP/2 usage.
- [**`11_THREADING_ANALYSIS.md`**](./11_THREADING_ANALYSIS.md) — RxJava 3 schedulers vs Kotlin Coroutines and thread isolation.
- [**`12_ERROR_HANDLING.md`**](./12_ERROR_HANDLING.md) — FailedMediaSource recovery, silent audio bridges, and ACRA crash reporting.
- [**`13_PERFORMANCE_FORENSICS.md`**](./13_PERFORMANCE_FORENSICS.md) — Startup latency breakdown, thread contention, and architectural bottlenecks.
- [**`14_NEWPIPE_ULTRAVID_COMPARISON.md`**](./14_NEWPIPE_ULTRAVID_COMPARISON.md) — Side-by-side comparison matrix across 20 system dimensions.
- [**`15_ULTRAVID_NATIVE_TARGET_ARCHITECTURE.md`**](./15_ULTRAVID_NATIVE_TARGET_ARCHITECTURE.md) — Target AndroidX Media3 + Jetpack Compose multi-module architecture.
- [**`16_ULTRAVID_CACHE_DESIGN.md`**](./16_ULTRAVID_CACHE_DESIGN.md) — Multi-tier cache design with active CDN URL expiration safeguards.
- [**`17_ULTRAVID_PERFORMANCE_DESIGN.md`**](./17_ULTRAVID_PERFORMANCE_DESIGN.md) — Engineering specification for instant playback.
- [**`18_NEWPIPE_REUSE_PLAN.md`**](./18_NEWPIPE_REUSE_PLAN.md) — Detailed catalog of code to reuse, refactor, or discard.

---

## 3. Environment Audits & Native Build Guides

- [**`ENVIRONMENT_AUDIT.md`**](./ENVIRONMENT_AUDIT.md) — Complete environment audit of the Termux + PRoot-Distro Debian Android development environment.
- [**`ANDROID_DEV_SETUP.md`**](./ANDROID_DEV_SETUP.md) — Setup and configuration guide for Android SDK, OpenJDK, and Gradle in PRoot.
- [**`BUILD_COMMANDS.md`**](./BUILD_COMMANDS.md) — Command-line build reference for debug APKs, release APKs, and test suites.
- [**`NATIVE_MIGRATION_PLAN.md`**](./NATIVE_MIGRATION_PLAN.md) — Step-by-step phased roadmap for UltraVid's migration to native Kotlin/Compose/Media3.
