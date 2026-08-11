import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'id.dms.system',
  appName: 'DMS Lapangan',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
