/**
 * Robocall / IVR detection (A11 / C34, 2026-08-22).
 *
 * Call cmt3wpci3 (00:57, store closed): a DoorDash store-status IVR — "a
 * dasher has reported your store as being closed … press one if open, press
 * four if closed" — was answered conversationally three times, then the line
 * sat idle for 27 s. A machine reading a menu is not a caller: the session
 * classifies the call `spam` and ends it (the after-stream table hangs up).
 *
 * Pure. STRONG cues classify on their own; WEAK cues need two utterances.
 */
const STRONG: RegExp[] = [
  /\bpress\s+(?:one|two|three|four|five|six|seven|eight|nine|zero|\d)\b[^.]{0,60}\b(?:if|to|for|when)\b/i,
  /\b(?:if|to|for)\b[^.]{0,60}\bpress\s+(?:one|two|three|four|five|six|seven|eight|nine|zero|\d)\b/i,
  /\bthis is an automated (?:call|message|notification)\b/i,
  /\ba dasher has reported\b/i,
  /\bto (?:accept|confirm|reject) this order,? press\b/i,
  /\bpara (?:español|espanol),? (?:oprima|presione|marque)\b/i,
  /\bthis call (?:may|will) be (?:monitored|recorded)\b/i,
];
const WEAK: RegExp[] = [
  /\byour call is important to us\b/i,
  /\bplease (?:hold|stay on the line)\b/i,
  /\bmain menu\b/i,
  /\bpress\s+(?:one|two|three|four|five|six|seven|eight|nine|zero|\d|the pound key|star)\b/i,
  /\bstore (?:status|is currently closed|as being closed)\b/i,
  /\bautomated (?:system|attendant|message)\b/i,
  /\bleave a message after the tone\b/i,
];

export type RobocallVerdict = { strong: boolean; weak: boolean };

export function robocallCues(text: string): RobocallVerdict {
  const t = String(text ?? "").trim();
  if (!t) return { strong: false, weak: false };
  return { strong: STRONG.some((re) => re.test(t)), weak: WEAK.some((re) => re.test(t)) };
}

/** Stateful per call: one strong cue, or two utterances with weak cues. */
export function createRobocallDetector() {
  let weakHits = 0;
  return {
    note(text: string): boolean {
      const v = robocallCues(text);
      if (v.strong) return true;
      if (v.weak) weakHits++;
      return weakHits >= 2;
    },
    get weakHits() {
      return weakHits;
    },
  };
}
