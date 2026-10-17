// Thay module ảo của vite-plugin-pwa khi chạy Vitest (không có service worker trong jsdom).
import { useState } from 'react';

export function useRegisterSW() {
  return {
    needRefresh: useState(false),
    offlineReady: useState(false),
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}
