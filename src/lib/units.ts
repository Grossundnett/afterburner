/**
 * Unit conversion at the UI boundary.
 *
 * Distance is stored in metres and duration in seconds, always. Kilometres and
 * minutes exist only in the form and on screen, because those are the units a
 * person thinks in. Both directions live here so the round trip cannot drift —
 * if the two halves lived apart, one of them would eventually be corrected
 * without the other.
 *
 * `distance_m` and `duration_s` are integer columns, so every conversion into
 * storage rounds. 5.35 km lands on 5350 m exactly; 5.333 km lands on 5333 m,
 * which is a tenth of a metre of loss and nothing to worry about.
 */

/** Kilometres from the form into stored metres. */
export function kmToMetres(km: number): number {
  return Math.round(km * 1000);
}

/** Minutes from the form into stored seconds. */
export function minutesToSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

/**
 * Stored metres back to kilometres for display.
 *
 * Two decimals is the resolution a GPS watch actually reports, and more digits
 * would imply a precision the source does not have.
 */
export function metresToKm(metres: number): number {
  return Math.round(metres / 10) / 100;
}

/** Stored seconds back to minutes for display. */
export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 6) / 10;
}

/**
 * Average pace in seconds per kilometre, or null when it would be meaningless.
 *
 * Null rather than zero when there is no distance: a gym session has a duration
 * and no pace, and that is a real absence rather than a pace of nothing. The
 * zero guard also keeps a mistyped zero distance from dividing by it.
 */
export function paceSecondsPerKm(
  distanceMetres: number | null,
  durationSeconds: number | null,
): number | null {
  if (distanceMetres === null || durationSeconds === null) return null;
  if (distanceMetres <= 0 || durationSeconds <= 0) return null;

  return Math.round(durationSeconds / (distanceMetres / 1000));
}

/** Seconds per kilometre as m:ss, the way a pace is read. */
export function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);

  // 4:60 would be wrong; rounding up the seconds has to carry into the minutes.
  if (seconds === 60) return `${minutes + 1}:00`;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
