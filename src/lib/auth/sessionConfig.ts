/**
 * Session constants.
 *
 * Deliberately free of `server-only` and `next/headers` so that the quiz
 * service (and the test suite) can read the TTLs without dragging in the
 * request-scoped cookie machinery.
 */

export const QUIZ_COOKIE = 'mcu_attempt';
export const ADMIN_COOKIE = 'mcu_admin';
export const DEVICE_COOKIE = 'mcu_device';

/** An exam session stays resumable for three hours; there is no countdown. */
export const QUIZ_SESSION_TTL_SECONDS = 60 * 60 * 3;
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

/**
 * The device marker outlives the event by a wide margin. It is the cheap,
 * zero-false-positive half of device recognition; the fingerprint is what
 * catches someone who clears it.
 */
export const DEVICE_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 365;
