import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Phishing Detector',
    description: 'Detecta dominios de nueva creación como indicador de phishing',
    version: '0.1.0',
    permissions: [
      'webNavigation',
      'storage',
      'activeTab',
      'scripting',
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '128': 'icon/128.png',
      },
    },
  },
});