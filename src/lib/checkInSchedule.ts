/**
 * Shared check-in schedule helpers.
 * Both the dashboard Check-in card and the voice Check-in dialog use these so
 * slots are always keyed to the same on-the-hour scheduled times.
 */

export const DEFAULT_CHECK_IN_HOURS = [7, 12, 19]; // 7AM, 12PM, 7PM

/** Convert saved "HH:MM" strings into a sorted, de-duplicated list of hours */
export const parseCheckInHours = (times?: string[] | null): number[] => {
  if (!times || times.length === 0) return DEFAULT_CHECK_IN_HOURS;
  const hours = Array.from(
    new Set(
      times
        .map((t) => parseInt(String(t).split(":")[0], 10))
        .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23)
    )
  ).sort((a, b) => a - b);
  return hours.length > 0 ? hours : DEFAULT_CHECK_IN_HOURS;
};

/**
 * Resolve the active check-in hours from user settings.
 * `activeCheckInHours` is the source of truth; `checkInTimes` is the legacy mirror.
 */
export const resolveCheckInHours = (settings?: {
  activeCheckInHours?: number[] | null;
  checkInTimes?: string[] | null;
}): number[] => {
  const hours = settings?.activeCheckInHours;
  if (Array.isArray(hours) && hours.length > 0) {
    const clean = Array.from(
      new Set(hours.filter((h) => Number.isFinite(h) && h >= 0 && h <= 23))
    ).sort((a, b) => a - b);
    if (clean.length > 0) return clean;
  }
  return parseCheckInHours(settings?.checkInTimes);
};

export const getCheckInWindowStart = (hour: number, date: Date = new Date()) => {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Returns the hour of the currently open check-in window, or null. */
export const getCurrentWindow = (CHECK_IN_HOURS: number[]): number | null => {
  const now = new Date();
  const nowMs = now.getTime();

  for (const h of CHECK_IN_HOURS) {
    const windowStart = getCheckInWindowStart(h);
    const nextHourIndex = CHECK_IN_HOURS.indexOf(h) + 1;
    let windowEnd: Date;
    if (nextHourIndex < CHECK_IN_HOURS.length) {
      windowEnd = getCheckInWindowStart(CHECK_IN_HOURS[nextHourIndex]);
    } else {
      windowEnd = new Date(windowStart);
      windowEnd.setHours(23, 59, 59, 999);
    }
    if (nowMs >= windowStart.getTime() && nowMs < windowEnd.getTime()) return h;
  }
  return null;
};

/** True when a row's scheduled_at lines up exactly with one of the scheduled slots. */
export const isScheduledSlot = (scheduledAt: string, hours: number[]): boolean => {
  const d = new Date(scheduledAt);
  return d.getMinutes() === 0 && d.getSeconds() === 0 && hours.includes(d.getHours());
};
