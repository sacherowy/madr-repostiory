/**
 * Friendly relative-time helper for decision cards (task 5.1 / Req 2.3).
 *
 * A small, pure, dependency-free function (no date-fns) that turns a stored ADR
 * `date` string into a plain-language age like "today", "yesterday",
 * "3 days ago", "2 weeks ago", or "1 year ago". The reference instant is
 * injectable so the output is deterministic and unit-testable; it defaults to
 * `new Date()` for live rendering.
 *
 * Day boundaries are computed on the UTC calendar: stored ADR dates are
 * date-only strings ("2026-06-23") which JavaScript parses as UTC midnight, so
 * comparing whole UTC days avoids local-timezone off-by-one drift. A
 * future-dated decision (date after `now`) reads as "today" rather than a
 * negative age. An unparseable input is returned verbatim.
 */

const MS_PER_DAY = 86_400_000;

/** Whole UTC-calendar days between `then` and `now` (positive = in the past). */
function wholeDaysBetween(then: Date, now: Date): number {
  const thenDay = Math.floor(then.getTime() / MS_PER_DAY);
  const nowDay = Math.floor(now.getTime() / MS_PER_DAY);
  return nowDay - thenDay;
}

export function relativeTime(dateInput: string, now: Date = new Date()): string {
  const then = new Date(dateInput);
  if (Number.isNaN(then.getTime())) {
    return dateInput;
  }

  const days = wholeDaysBetween(then, now);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "1 month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  if (days < 730) return "1 year ago";
  return `${Math.floor(days / 365)} years ago`;
}
