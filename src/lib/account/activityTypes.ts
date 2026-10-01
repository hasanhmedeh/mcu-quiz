/**
 * Everything recorded about a signed-in viewer. Shared by the server (which
 * writes them) and the admin pages (which label them), so it carries no
 * server-only imports.
 */
export const ACTIVITY_LABELS = {
  signed_up: 'Signed up',
  signed_in: 'Signed in',
  signed_out: 'Signed out',
  page_view: 'Viewed a page',
  trailer_opened: 'Played a trailer',
  marked_watched: 'Marked as watched',
  unmarked_watched: 'Unmarked as watched',
  exam_started: 'Started the exam',
  exam_resumed: 'Resumed the exam',
  exam_blocked: 'Was turned away from the exam',
  exam_left: 'Left the exam screen',
  exam_submitted: 'Submitted the exam',
  exam_discarded: 'Discarded the exam',
} as const;

export type ActivityType = keyof typeof ACTIVITY_LABELS;

/** The only events a browser may report itself; the rest are recorded by the server. */
export const CLIENT_ACTIVITY_TYPES = ['page_view', 'trailer_opened'] as const satisfies readonly ActivityType[];

export type ClientActivityType = (typeof CLIENT_ACTIVITY_TYPES)[number];

export function activityLabel(type: string): string {
  return (ACTIVITY_LABELS as Record<string, string>)[type] ?? type;
}
