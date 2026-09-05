import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.runlu.warehouseos',
  appName: 'RUNLU Warehouse OS',
  webDir: 'www',
  loggingBehavior: 'debug',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    webContentsDebuggingEnabled: false
  }
};

export default config;
