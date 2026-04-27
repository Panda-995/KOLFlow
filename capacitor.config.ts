import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kolflow.app',
  appName: 'KOLFlow',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'http'
  },
  android: {
    allowMixedContent: true
  }
};

export default config;