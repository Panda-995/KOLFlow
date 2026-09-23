import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kolflow.app',
  appName: 'KOLFlow',
  webDir: 'dist',
  server: {
    // 不注入 server.url：WebView 加载本地打包资源；后端地址由应用内配置
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
