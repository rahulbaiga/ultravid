# Android Command-Line Native Development Setup Guide

**Environment**: Android 16 (SDK 36) • PRoot-Distro Debian 13 (Trixie) • ARM64 (`aarch64`)  
**Project**: UltraVid Native Android  
**Workspace**: `/root/ultravid/android` & `/root/android_test_project`

---

## 1. System & Architecture Overview
- **Host Device**: Android Phone running Android 16 (API Level 36), Linux 6.17 Kernel (`aarch64`).
- **Development Layer**: PRoot-Distro Debian 13 (Trixie) inside Termux.
- **CPU Architecture**: `arm64` / `aarch64`.
- **System RAM**: 7.0 GiB (Gradle JVM tuned to `-Xmx2048m`).
- **Storage**: Root ext4 partition in `/root` (126 GiB free space).
- **Tooling Compatibility**:
  - **JDK**: OpenJDK 21 LTS (`21.0.12.1`) (`/usr/lib/jvm/java-21-openjdk-arm64`)
  - **Gradle**: 8.7 (managed via `./gradlew`)
  - **Android Gradle Plugin (AGP)**: 8.2.2
  - **Android SDK**: `/root/Android/Sdk`
  - **compileSdk**: 34 (Android 14)
  - **build-tools**: 34.0.0
  - **platforms**: `android-34`
  - **Kotlin Version**: 1.9.22
  - **Compose Compiler**: 1.5.8 (Compose BOM `2024.02.00`)
  - **ADB**: Native Debian ARM64 (`adb` 34.0.5)

---

## 2. Environment Variables & Profile Configuration
The environment variables are permanently configured in `/etc/profile.d/android-sdk.sh` and `/root/.bashrc`:

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-arm64
export ANDROID_HOME=/root/Android/Sdk
export ANDROID_SDK_ROOT=/root/Android/Sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
```

---

## 3. The ARM64 AAPT2 Bridge Architecture
Google does not publish prebuilt `linux-aarch64` binaries for `aapt2` on Google Maven or SDK distributions. To achieve seamless, official, native Gradle compilation on ARM64 PRoot:

1. `qemu-user` with multiarch `libc6:amd64` and `libstdc++6:amd64` is installed.
2. A lightweight execution bridge is placed at `/root/Android/Sdk/build-tools/34.0.0/aapt2`:
   ```sh
   #!/bin/sh
   exec /usr/bin/qemu-x86_64 /root/Android/Sdk/build-tools/34.0.0/aapt2.real "$@"
   ```
3. Gradle is configured in `/root/.gradle/gradle.properties`:
   ```properties
   android.aapt2FromMavenOverride=/root/Android/Sdk/build-tools/34.0.0/aapt2
   ```
This provides 100% compatibility with official Google AAPT2 releases without modifying project build scripts.

---

## 4. Gradle Performance Tuning (`~/.gradle/gradle.properties`)
Configured specifically for phone constraints (prevents Linux OOM killer & CPU throttling in PRoot):

```properties
# JVM Heap: 2GB (Safe for 7GB RAM device with 1.1GB free + 8GB swap)
org.gradle.jvmargs=-Xmx2048m -XX:+UseG1GC -XX:SoftRefLRUPolicyMSPerMB=1 -Dfile.encoding=UTF-8

# Limit worker threads to 2 concurrent tasks
org.gradle.workers.max=2
org.gradle.parallel=true

# Cache intermediate compilation units
org.gradle.caching=true

# Android modern pipeline flags
android.useAndroidX=true
android.nonTransitiveRClass=true
android.aapt2FromMavenOverride=/root/Android/Sdk/build-tools/34.0.0/aapt2
```

---

## 5. Physical Device Testing & ADB Workflows

Because PRoot runs inside the Android phone itself, standard USB cable detection does not loop back to the host device. Direct deployment is accomplished via two methods:

### Method A: Wireless Debugging (Direct ADB on Device)
1. On your phone, go to **Settings > Developer Options > Wireless Debugging** and turn it ON.
2. Tap **Pair device with pairing code**. Note the Wi-Fi pairing port and 6-digit code.
3. In your terminal:
   ```bash
   adb pair localhost:<pairing_port> <code>
   ```
4. Note the main Wireless Debugging port (shown on the main Wireless Debugging screen), then connect:
   ```bash
   adb connect localhost:<connect_port>
   ```
5. Confirm device connection:
   ```bash
   adb devices
   ```
6. Install and run APK:
   ```bash
   adb install -r /root/ultravid/android/app/build/outputs/apk/debug/app-debug.apk
   adb shell am start -n com.ultravid.app/.MainActivity
   ```

### Method B: Shared Storage Direct Package Install
If Wireless Debugging is disabled, copy the APK directly to your phone's Download directory:
```bash
cp /root/ultravid/android/app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/UltraVid-debug.apk
```
Then tap the file in your phone's File Manager / Downloads notification to install.

---

## 6. Known PRoot / Termux Limitations & Solutions
1. **Kernel binfmt_misc**: PRoot cannot register kernel-level binfmt handlers without root. *Solution*: Our `aapt2` wrapper script invokes `/usr/bin/qemu-x86_64` directly with zero kernel dependencies.
2. **FUSE /sdcard File Permissions**: `/sdcard` does not support POSIX `chmod +x` or symlinks. *Solution*: Keep all source code, Gradle caches, and SDK files in `/root` (ext4 filesystem). Only output final APKs to `/sdcard/Download/` when installing manually.
3. **Daemon Memory Leaks**: On low RAM, kill lingering background daemons using `./gradlew --stop`.
