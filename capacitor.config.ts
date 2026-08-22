import type { CapacitorConfig } from '@capacitor/cli';

// TEMP dev config: the Android app's WebView loads your Vite dev server
// directly over the LAN (same pattern as Capacitor's own live-reload
// workflow), so `npm run dev` + this app on a phone on the same WiFi gives
// you instant iteration with no rebuild/redeploy step. Swap `server` for a
// real production URL (or drop it entirely once webDir:'dist' is a proper
// static export — see PLAN.md) before shipping to the Play Store; cleartext
// HTTP is only acceptable for local dev, never for a released app.
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
