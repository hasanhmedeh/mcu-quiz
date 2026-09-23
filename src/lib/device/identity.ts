import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Turns browser signals into a stable device identifier.
 *
 * The hash deliberately mixes in a *normalised* User-Agent — major browser and
 * OS family only — rather than the full string, so a routine browser update
 * does not mint a brand-new device. The client's raw signals are never stored;
 * only the digest is.
 */

export const deviceSignalsSchema = z.object({
  canvas: z.string().max(64),
  webgl: z.string().max(64),
  platform: z.string().max(64),
  cores: z.number().int().min(0).max(1024),
  memory: z.number().min(0).max(1024),
  touchPoints: z.number().int().min(0).max(64),
  colorDepth: z.number().int().min(0).max(64),
  timeZone: z.string().max(64),
  language: z.string().max(32),
});

export type DeviceSignalsInput = z.infer<typeof deviceSignalsSchema>;

/**
 * Reduces a User-Agent to browser family + OS family.
 *
 * "Chrome/124.0.6367.60 ... Windows NT 10.0" and the same browser three
 * versions later both collapse to `chrome|windows`.
 */
export function normalizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'unknown|unknown';

  const browser =
    /Edg\//.test(userAgent) ? 'edge'
    : /OPR\/|Opera/.test(userAgent) ? 'opera'
    : /Firefox\//.test(userAgent) ? 'firefox'
    : /Chrome\//.test(userAgent) ? 'chrome'
    : /Safari\//.test(userAgent) ? 'safari'
    : 'other';

  const platform =
    /iPhone|iPad|iPod/.test(userAgent) ? 'ios'
    : /Android/.test(userAgent) ? 'android'
    : /Windows/.test(userAgent) ? 'windows'
    : /Mac OS X/.test(userAgent) ? 'macos'
    : /CrOS/.test(userAgent) ? 'chromeos'
    : /Linux/.test(userAgent) ? 'linux'
    : 'other';

  return `${browser}|${platform}`;
}

/** Derives the Firestore document id for a device. */
export function deviceIdFromSignals(
  signals: DeviceSignalsInput,
  userAgent: string | null,
): string {
  const parts = [
    signals.canvas,
    signals.webgl,
    signals.platform,
    String(signals.cores),
    String(signals.memory),
    String(signals.touchPoints),
    String(signals.colorDepth),
    signals.timeZone,
    // Language is taken as the primary subtag: `en-GB` and `en-US` are the
    // same machine with a settings change.
    signals.language.split('-')[0] ?? 'unknown',
    normalizeUserAgent(userAgent),
  ];

  return createHash('sha256').update(parts.join('~'), 'utf8').digest('hex').slice(0, 32);
}

/** `DEVICE_LOCK_ENABLED=false` turns the whole mechanism off. */
export function isDeviceLockEnabled(): boolean {
  return process.env.DEVICE_LOCK_ENABLED?.trim().toLowerCase() !== 'false';
}
