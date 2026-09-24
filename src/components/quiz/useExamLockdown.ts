'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ExamExitKind } from '@/types';

/**
 * Exam lockdown, as far as a web page can take it.
 *
 * A page cannot stop anyone switching tab, switching app or opening another
 * program — browsers deliberately give sites no such power. What it can do is
 * notice every time it happens, and that is what this hook does: it reports
 * each spell away from the exam exactly once, keeps the exam in fullscreen
 * where the browser supports it, and makes the questions awkward to copy out.
 */

/**
 * Losing focus for less than this is ignored. It keeps a stray click on the
 * browser's own UI (or a permission prompt) from counting as leaving.
 */
const BLUR_GRACE_MS = 1200;

function subscribeToFullscreen(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}

function subscribeToNothing(): () => void {
  return () => {};
}

export function isFullscreenSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function'
  );
}

/** Must run inside a click or key handler: browsers refuse fullscreen otherwise. */
export function enterFullscreen(): void {
  if (!isFullscreenSupported() || document.fullscreenElement) return;
  try {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  } catch {
    // Refused (no user gesture, or an embedded frame): the overlay asks again.
  }
}

export function exitFullscreen(): void {
  if (typeof document === 'undefined' || !document.fullscreenElement) return;
  document.exitFullscreen().catch(() => {});
}

/** Shortcuts for copying, saving, printing and view-source. Best effort only. */
function isBlockedShortcut(event: KeyboardEvent): boolean {
  if (event.key === 'F12' || event.key === 'PrintScreen') return true;
  if (!(event.ctrlKey || event.metaKey)) return false;
  return ['c', 'x', 'a', 'p', 's', 'u'].includes(event.key.toLowerCase());
}

interface LockdownOptions {
  /** Off once the exam has been submitted or discarded. */
  readonly active: boolean;
  /** Called once per spell away; not again until the candidate is back. */
  readonly onExit: (kind: ExamExitKind) => void;
}

export function useExamLockdown({ active, onExit }: LockdownOptions) {
  const fullscreenSupported = useSyncExternalStore(
    subscribeToNothing,
    isFullscreenSupported,
    () => false,
  );
  // Assumed fullscreen on the server so the overlay never flashes before hydration.
  const isFullscreen = useSyncExternalStore(
    subscribeToFullscreen,
    () => document.fullscreenElement !== null,
    () => true,
  );

  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  });

  // --- Detect leaving -------------------------------------------------------
  useEffect(() => {
    if (!active) return;

    let away = false;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const isBack = () =>
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      (!fullscreenSupported || document.fullscreenElement !== null);

    const leave = (kind: ExamExitKind) => {
      if (away) return;
      away = true;
      onExitRef.current(kind);
    };

    const settle = () => {
      if (isBack()) away = false;
    };

    function handleVisibility() {
      if (document.visibilityState === 'hidden') leave('tab_hidden');
      else settle();
    }

    function handleBlur() {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (!document.hasFocus()) leave('window_blur');
      }, BLUR_GRACE_MS);
    }

    function handleFocus() {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      settle();
    }

    function handleFullscreen() {
      if (fullscreenSupported && document.fullscreenElement === null) leave('fullscreen_exit');
      else settle();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('fullscreenchange', handleFullscreen);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('fullscreenchange', handleFullscreen);
    };
  }, [active, fullscreenSupported]);

  // --- Make the questions hard to copy out -----------------------------------
  useEffect(() => {
    if (!active) return;

    const block = (event: Event) => event.preventDefault();
    function handleKeyDown(event: KeyboardEvent) {
      if (isBlockedShortcut(event)) event.preventDefault();
    }

    const events = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'] as const;
    for (const name of events) document.addEventListener(name, block);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      for (const name of events) document.removeEventListener(name, block);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [active]);

  return {
    fullscreenSupported,
    /** True when the browser supports fullscreen and the exam is not in it. */
    needsFullscreen: active && fullscreenSupported && !isFullscreen,
  };
}
