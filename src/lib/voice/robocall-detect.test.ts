/**
 * A11 / C34 — IVR / robocall detection (services/nabil-voice/src/robocall-detect.ts).
 * Call cmt3wpci3: a DoorDash store-status IVR was answered three times.
 */
import { describe, expect, it } from "vitest";
import { createRobocallDetector, robocallCues } from "../../../services/nabil-voice/src/robocall-detect";

describe("robocallCues", () => {
  it("strong: an IVR menu, an automated-message banner, the DoorDash dasher line", () => {
    expect(robocallCues("A dasher has reported your store as being closed. Press one if your store is open, press four if it is closed.").strong).toBe(true);
    expect(robocallCues("To accept this order press one.").strong).toBe(true);
    expect(robocallCues("This is an automated message from your pharmacy.").strong).toBe(true);
    expect(robocallCues("This call may be recorded for quality purposes.").strong).toBe(true);
    expect(robocallCues("Para español, oprima el dos.").strong).toBe(true);
  });
  it("weak alone is not enough; real callers are never flagged", () => {
    expect(robocallCues("Please hold.").strong).toBe(false);
    expect(robocallCues("Please hold.").weak).toBe(true);
    for (const t of ["Hi, can I get a large pepperoni for pickup?", "Is my order ready?", "I'd like to press my luck and try the Philly steak.", "Four wings please.", "Can I talk to a person?", "What time do you close?"]) {
      const v = robocallCues(t);
      expect(v.strong, t).toBe(false);
      expect(v.weak, t).toBe(false);
    }
  });
});

describe("createRobocallDetector", () => {
  it("one strong cue classifies; two weak utterances classify; one weak does not", () => {
    const d1 = createRobocallDetector();
    expect(d1.note("A dasher has reported your store as being closed.")).toBe(true);
    const d2 = createRobocallDetector();
    expect(d2.note("Please hold while we connect you.")).toBe(false);
    expect(d2.note("Your call is important to us.")).toBe(true);
    const d3 = createRobocallDetector();
    expect(d3.note("Please stay on the line.")).toBe(false);
    expect(d3.note("Hi, one large pepperoni please.")).toBe(false);
    expect(d3.weakHits).toBe(1);
  });
});
