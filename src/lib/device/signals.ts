/**
 * Browser-side device signals.
 *
 * These are collected once, on the landing page, and posted to the server,
 * which hashes them into a device identifier. The point is to recognise the
 * *same machine* coming back under a different name after cookies have been
 * cleared.
 *
 * Signal choice is deliberately conservative — only properties that stay put
 * across ordinary use are included:
 *
 *   included  canvas render, WebGL adapter, platform, CPU cores, memory,
 *             touch points, colour depth, time zone, primary language
 *   excluded  window size and devicePixelRatio (change with zoom and with a
 *             second monitor), screen dimensions (change when a window moves
 *             between displays), full UA string (changes every browser update)
 *
 * This is not a security boundary and is not treated as one. A determined
 * person can spoof every value here from the console; the server therefore
 * uses it as one signal among several, and the organiser can release any lock.
 */

export interface DeviceSignals {
  readonly canvas: string;
  readonly webgl: string;
  readonly platform: string;
  readonly cores: number;
  readonly memory: number;
  readonly touchPoints: number;
  readonly colorDepth: number;
  readonly timeZone: string;
  readonly language: string;
}

/** Stable, non-cryptographic hash used to condense long strings before sending. */
function digest(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Renders text and shapes to a canvas and hashes the result. The output varies
 * with GPU, driver, and font rasterisation, which is what distinguishes two
 * otherwise identical phones.
 */
function canvasSignal(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;

    const context = canvas.getContext('2d');
    if (!context) return 'no-2d';

    context.textBaseline = 'top';
    context.font = '14px "Arial"';
    context.fillStyle = '#f60';
    context.fillRect(10, 5, 90, 30);
    context.fillStyle = '#069';
    context.fillText('Endgame Encore ✨', 2, 15);
    context.fillStyle = 'rgba(102, 204, 0, 0.7)';
    context.fillText('Endgame Encore ✨', 4, 22);

    context.globalCompositeOperation = 'multiply';
    context.beginPath();
    context.arc(60, 30, 20, 0, Math.PI * 2, true);
    context.fill();

    return digest(canvas.toDataURL());
  } catch {
    return 'no-canvas';
  }
}

/** The GPU string is one of the most stable cross-session signals available. */
function webglSignal(): string {
  try {
    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl') ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!context) return 'no-webgl';

    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return digest(context.getParameter(context.VERSION) as string);

    const vendor = context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
    const renderer = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
    return digest(`${vendor}|${renderer}`);
  } catch {
    return 'no-webgl';
  }
}

function platformSignal(): string {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  if (data?.platform) return data.platform;
  return navigator.platform || 'unknown';
}

/** Collects every signal. Never throws — a partial fingerprint is still useful. */
export function collectDeviceSignals(): DeviceSignals {
  const extended = navigator as Navigator & { deviceMemory?: number };

  let timeZone = 'unknown';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    // Older engines without a resolved zone; the other signals carry it.
  }

  return {
    canvas: canvasSignal(),
    webgl: webglSignal(),
    platform: platformSignal(),
    cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 0,
    memory: typeof extended.deviceMemory === 'number' ? extended.deviceMemory : 0,
    touchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0,
    colorDepth: typeof screen?.colorDepth === 'number' ? screen.colorDepth : 0,
    timeZone,
    language: navigator.language || 'unknown',
  };
}
