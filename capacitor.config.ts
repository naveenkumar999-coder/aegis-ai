import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.monday.ai',
  appName: 'MONDAY AI',
  webDir: 'public',
  server: {
    url: 'http://localhost:3000',
    cleartext: true
  }
};

export default config;
