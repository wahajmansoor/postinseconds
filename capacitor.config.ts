import type { CapacitorConfig } from '@capacitor/cli';

// Points at the real production deployment (Vercel), not a local dev
// server — this is what makes the built APK actually shareable: it works
// on any phone with internet access, independent of this PC being on or
// running `npm run dev`. HTTPS needs no `cleartext` flag (that's only ever
// needed to permit plain HTTP, which a real deployment should never use).
//
// To go back to local-dev-server iteration instead (instant reload, no
// rebuild/redeploy step), swap `url` for your PC's LAN IP or the emulator's
// 10.0.2.2 alias and add `cleartext: true` back — see git history for the
// exact dev config this replaced.
const config: CapacitorConfig = {
  appId: 'com.postinseconds.app',
  appName: 'Post In Seconds',
  webDir: 'dist',
  server: {
    // TEMP: local dev server for testing the native Google Sign-In change
    // before it's deployed — switch back to 'https://post.buildinseconds.com'
    // (and drop cleartext) once verified and pushed live.
    url: 'http://192.168.18.20:8080',
    cleartext: true,
  },
  plugins: {
    // Only Google is actually used — disabling the other providers keeps
    // their native dependencies (Facebook SDK, etc.) out of the APK
    // entirely rather than just unused.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
