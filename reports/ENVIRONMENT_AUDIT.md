# Environment Audit Report: Android Phone + Termux + PRoot Debian

**Date**: 2026-09-23  
**Target Architecture**: Native Android Command-Line Development Machine  
**Environment**: PRoot-Distro Debian 13 (Trixie) on ARM64 Android

---

## 1. System & Architecture
- **CPU Architecture**: `aarch64` (`dpkg --print-architecture` = `arm64`)
- **Kernel**: `Linux localhost 6.17.0-PRoot-Distro #1 SMP PREEMPT_DYNAMIC aarch64 GNU/Linux`
- **Host Android OS**:
  - Release Version: **Android 16** (`ro.build.version.release = 16`)
  - API Level: **SDK 36** (`ro.build.version.sdk = 36`)
  - Device Manufacturer/SoC: Vivo / Qualcomm Snapdragon (derived from framework/bootclasspath)
- **Linux Distribution**: Debian GNU/Linux 13 (Trixie) version 13.6
- **Runtime Virtualization**: PRoot-Distro inside Termux app sandbox

## 2. Resources (Memory & Disk)
- **Total RAM**: 7.0 GiB
- **Available RAM**: ~1.1 GiB available (5.6 GiB used by background/system, 1.3 GiB buffer/cache)
- **Swap**: 8.0 GiB total (2.5 GiB free, 5.5 GiB used)
  > [!IMPORTANT]
  > Gradle JVM heap and worker count must be conservatively configured (e.g., `-Xmx2048m`, 2 workers) to prevent OOM kills within PRoot.
- **Root Storage (`/`)**: 220 GiB total, 94 GiB used, **126 GiB available** (43% utilization)
- **Shared Storage (`/sdcard`)**: Mounted at `/storage/emulated/0` (FUSE/sdcardfs, 126 GiB available).
  - *Recommendation*: Keep SDK, Gradle, and source code strictly in `/root` for ext4 POSIX permissions, symlink support, and fast I/O.

## 3. Existing Software & Tooling
| Tool / Component | Status | Details |
| :--- | :--- | :--- |
| **Git** | Installed | `git version 2.47.3` (`/usr/bin/git`) |
| **Bash** | Installed | `5.2.37-2+b9` |
| **Build Essential** | Installed | `12.12` (`make 4.4.1`, `gcc`, etc.) |
| **Python** | Installed | `Python 3.13.5`, `pip 25.1.1` |
| **Java / JDK** | Not Installed | `java`, `javac` not present in PATH |
| **Gradle** | Not Installed | No global Gradle; UltraVid has wrapper |
| **Android SDK** | Not Installed | Neither `$ANDROID_HOME` nor `~/Android` exists |
| **ADB** | Not Installed | Available as `adb` 34.0.5 in Debian repo |
| **Kotlin** | Not Installed | Will be managed per-project via Gradle |
| **Antigravity CLI** | Active | Located at `/root/.gemini/antigravity-cli`, preserved |
| **UltraVid Repo** | Present | `/root/ultravid` (has `android/` subproject) |

## 4. UltraVid Android Project Baseline
- **Build File**: `/root/ultravid/android/build.gradle`
- **Android Gradle Plugin (AGP)**: `8.2.2`
- **Kotlin Version**: `1.9.22`
- **Gradle Wrapper**: Gradle `8.7-bin`
- **Target Java**: Java 17
- **Compile SDK**: `34`
- **Target SDK**: `34`
- **Min SDK**: `24`
- **Application ID**: `com.ultravid.app`

## 5. Compatibility & Selection Decisions
1. **JDK Choice**:
   - Debian Trixie provides `openjdk-21-jdk-headless` (v21.0.12).
   - Gradle 8.7 has full native support for JDK 21.
   - AGP 8.2.2+ supports JDK 21 execution while compiling byte-code targeting Java 17 / Java 21.
   - Setting `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-arm64`.
2. **Android SDK Choice**:
   - Location: `/root/Android/Sdk`
   - Command-line tools: Official Google Android `cmdline-tools` (pure Java, runs on JVM on ARM64).
   - Platform: `platforms;android-34`
   - Build-tools: `build-tools;34.0.0`
   - Native AAPT2: Handled automatically by AGP from Google Maven (`linux-aarch64`).
   - Native ADB: Debian ARM64 package (`adb`).
