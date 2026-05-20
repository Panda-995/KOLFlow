import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kolflow.app',
  appName: 'KOLFlow',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#111111',
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: '#111111',
      style: 'LIGHT',
    },
  },
};

export default config;
