# Android APK Build

DMS bisa dibungkus menjadi APK dengan Capacitor tanpa membuat codebase baru.

## Konsep

- Web/PWA tetap menjadi sumber utama.
- APK Android memuat hasil build `dist` yang sama.
- Role user tetap menentukan tampilan: management atau lapangan.
- Label aplikasi Android: `DMS Lapangan`.

## Requirement Lokal

- JDK 21 atau JDK 17 aktif.
- Android Studio atau Android SDK command line tools.
- `ANDROID_HOME` mengarah ke Android SDK.

Di workspace lokal ini sudah disiapkan:

- JDK lokal: `.local-tools/jdk/current`
- Android SDK lokal: `.local-tools/android-sdk`

## Command

```bash
npm run android:sync
npm run android:apk
```

APK debug akan dibuat di:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install langsung ke HP yang tersambung dengan USB debugging:

```bash
.local-tools/android-sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Permission Android

APK sudah disiapkan dengan permission:

- `CAMERA` untuk face enrollment dan face check.
- `ACCESS_FINE_LOCATION` untuk GPS radius.
- `ACCESS_COARSE_LOCATION` sebagai fallback lokasi.
- `INTERNET` untuk Supabase dan asset online.

## Catatan

Build APK membutuhkan Java Runtime/JDK. Script `npm run android:apk` akan memakai JDK/SDK lokal di `.local-tools` bila tersedia.
