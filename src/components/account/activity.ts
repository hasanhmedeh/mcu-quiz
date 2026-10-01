'use client';

import type { ClientActivityType } from '@/lib/account/activityTypes';

/**
 * Tells the server what a viewer just did. Fire and forget: `keepalive` lets
 * it finish even when the page is being left, and a failure is ignored. The
 * server drops it unless someone is signed in.
 */
export function trackActivity(type: ClientActivityType, extras: { title?: string } = {}): void {
  try {
    void fetch('/api/account/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, path: window.location.pathname, ...extras }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Never let tracking break the page.
  }
}
