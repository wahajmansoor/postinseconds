import type { CapacitorConfig } from '@capacitor/cli';

// TEMP dev config: the Android app's WebView loads your Vite dev server
// directly, so `npm run dev` + this app gives you instant iteration with no
// rebuild/redeploy step. Swap `server` for a real production URL (or drop it
// entirely once webDir:'dist' is a proper static export — see PLAN.md)
// before shipping to the Play Store; cleartext HTTP is only acceptable for
// local dev, never for a released app.
//
// The URL depends on WHERE the app is running, and you have to rebuild
// (`cd android && .\gradlew.bat installDebug`) after switching:
//   - Physical phone on the same WiFi: your PC's real LAN IP, e.g.
//     'http://192.168.18.20:8080' — the emulator CANNOT reach this; its
//     virtual network doesn't route to the host's real LAN-facing IP.
//   - Android emulator: 'http://10.0.2.2:8080' — a special QEMU alias that
//     only exists inside the emulator's virtual network and always maps to
//     the host machine, regardless of the host's actual IP.
const config: CapacitorConfig = {
  appId: 'com.postinseconds.app',
  appName: 'Post In Seconds',
  webDir: 'dist',
  server: {
    url: 'http://192.168.18.20:8080',
    cleartext: true,
  },
};

export default config;
