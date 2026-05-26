'use client';

import { useEffect } from 'react';

/**
 * Service Worker client-side registration component.
 * Automatically loads sw.js in standard PWA-supporting browsers on boot.
 */
export default function PWARegistration() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      !('workbox' in window) // Avoid duplicate registrations if workbox is active
    ) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registered successfully, scope:', registration.scope);
          })
          .catch((error) => {
            console.error('[PWA] Service Worker registration failed:', error);
          });
      });
    }
  }, []);

  return null;
}
