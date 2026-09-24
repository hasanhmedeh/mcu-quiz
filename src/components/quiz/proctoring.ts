'use client';

/**
 * The camera stream for proctoring.
 *
 * It lives at module level so that switching it on at the name gate carries
 * over into the exam (a client-side navigation keeps this module alive). A
 * reload loses it — browsers never hand a page a camera without asking — so
 * the exam asks again.
 *
 * Nothing here runs without the candidate's say-so: the stream comes from the
 * browser's permission prompt, and the browser shows its own camera indicator
 * on top of the one the exam shows.
 *
 * There is deliberately no screen capture. A page cannot choose which monitor
 * gets shared — the browser always lets the person pick — so on a two-screen
 * setup it would record whichever screen they liked, and prove nothing.
 */

export type ProctorStatus = {
  readonly camera: boolean;
};

let cameraStream: MediaStream | null = null;
let video: HTMLVideoElement | null = null;
const listeners = new Set<() => void>();

const CAMERA_ON: ProctorStatus = { camera: true };
const CAMERA_OFF: ProctorStatus = { camera: false };

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeToProctoring(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isLive(stream: MediaStream | null): boolean {
  return stream !== null && stream.getVideoTracks().some((track) => track.readyState === 'live');
}

/** Stable objects, so useSyncExternalStore sees no change unless there is one. */
export function getProctorStatus(): ProctorStatus {
  return isLive(cameraStream) ? CAMERA_ON : CAMERA_OFF;
}

/** For useSyncExternalStore during SSR: nothing is on until the browser says so. */
export const SERVER_PROCTOR_STATUS: ProctorStatus = CAMERA_OFF;

export function isProctoringReady(status: ProctorStatus): boolean {
  return status.camera;
}

export class ProctorError extends Error {
  constructor(
    readonly code: 'denied' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'ProctorError';
  }
}

/** Must be called from a click: browsers only prompt for the camera from a user gesture. */
export async function startCamera(): Promise<void> {
  if (isLive(cameraStream)) return;
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    throw new ProctorError('unavailable', 'This browser cannot use a camera. Try Chrome, Edge or Safari.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    throw new ProctorError(
      name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'denied',
      name === 'NotFoundError'
        ? 'No camera was found on this device.'
        : 'Camera access was blocked. Allow it in the address bar, then try again.',
    );
  }

  cameraStream = stream;
  video ??= document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => {});

  for (const track of stream.getVideoTracks()) {
    track.addEventListener('ended', notify);
  }
  notify();
}

export function stopProctoring(): void {
  for (const track of cameraStream?.getTracks() ?? []) track.stop();
  cameraStream = null;
  if (video) video.srcObject = null;
  notify();
}

/** The live camera stream, for an on-screen preview. */
export function getCameraStream(): MediaStream | null {
  return isLive(cameraStream) ? cameraStream : null;
}

const MAX_WIDTH = 480;
const QUALITY = 0.6;

/** A JPEG still from the camera, sized and compressed to a few tens of kilobytes. */
export function captureStill(): string | null {
  if (!video || !isLive(cameraStream) || video.videoWidth === 0) return null;

  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', QUALITY);
}
