# Android Build & Development Quick Commands

This reference provides the exact CLI commands for developing, testing, and building UltraVid Android applications from the terminal.

---

## 1. Build Commands

### Build Debug APK
```bash
cd /root/ultravid/android
./gradlew assembleDebug
```
*Output APK*: `/root/ultravid/android/app/build/outputs/apk/debug/app-debug.apk`

### Build Release APK
```bash
cd /root/ultravid/android
./gradlew assembleRelease
```
*Output APK*: `/root/ultravid/android/app/build/outputs/apk/release/app-release-unsigned.apk`

### Build Android App Bundle (.aab)
```bash
cd /root/ultravid/android
./gradlew bundleRelease
```
*Output AAB*: `/root/ultravid/android/app/build/outputs/bundle/release/app-release.aab`

---

## 2. Quality & Verification Commands

### Run Unit Tests
```bash
cd /root/ultravid/android
./gradlew test
```
*Test Report*: `app/build/reports/tests/testDebugUnitTest/index.html`

### Run Android Lint
```bash
cd /root/ultravid/android
./gradlew lint
```
*Lint Report*: `app/build/reports/lint-results-debug.html`

### Clean Build Cache
```bash
cd /root/ultravid/android
./gradlew clean
```

### Stop Background Gradle Daemons (Reclaim RAM)
```bash
./gradlew --stop
```

### Inspect Dependencies
```bash
cd /root/ultravid/android
./gradlew app:dependencies --configuration implementation
```

---

## 3. ADB & Device Deployment Commands

### Check Connected Devices
```bash
adb devices
```

### Pair with Local Phone (Wireless Debugging)
```bash
adb pair localhost:<pairing-port> <6-digit-code>
```

### Connect to Local Phone (Wireless Debugging)
```bash
adb connect localhost:<connect-port>
```

### Install Debug APK via ADB
```bash
adb install -r /root/ultravid/android/app/build/outputs/apk/debug/app-debug.apk
```

### Launch UltraVid Activity via ADB
```bash
adb shell am start -n com.ultravid.app/.MainActivity
```

### View Live App Logs (Logcat)
```bash
adb logcat -v time com.ultravid.app:D *:S
```

### Export APK to Phone's Download Directory (No ADB Required)
```bash
cp /root/ultravid/android/app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/UltraVid.apk
```

---

## 4. Standalone Test Compose Project (`/root/android_test_project`)

### Build Test Compose App
```bash
cd /root/android_test_project
./gradlew assembleDebug
```

### Run Test Compose Unit Tests
```bash
cd /root/android_test_project
./gradlew test
```
