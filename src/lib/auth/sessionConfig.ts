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
export const OWNER_COOKIE = 'mcu_owner';

/**
 * Which participants this browser has played as. It is what lets someone see
 * their own result again later, while typing another person's name shows
 * nothing. Long-lived for the same reason as the device marker.
 */
export const OWNER_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 365;

/** A shared family laptop might see a few names; this just bounds the cookie. */
export const MAX_OWNED_USER_IDS = 10;

/** An exam session stays resumable for three hours; there is no countdown. */
export const QUIZ_SESSION_TTL_SECONDS = 60 * 60 * 3;
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

/**
 * The device marker outlives the event by a wide margin. It is the cheap,
 * zero-false-positive half of device recognition; the fingerprint is what
 * catches someone who clears it.
 */
export const DEVICE_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 365;
