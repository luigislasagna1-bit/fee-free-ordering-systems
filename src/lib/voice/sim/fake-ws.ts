/**
 * A stand-in for the Twilio ConversationRelay WebSocket, for the simulator.
 *
 * `CallSession` only ever calls `ws.send(json)`. It sends two kinds of frame:
 *   • `{type:"text", token, last}` — spoken tokens; `last:true` closes a turn
 *     (an empty token with last:true is the normal end-of-turn marker).
 *   • `{type:"end", handoffData}` — the agent ended the call (transfer / cap).
 *
 * The fake accumulates tokens since the previous `last:true` into ONE
 * utterance per turn, and hands completed turns to whoever is waiting — so a
 * runner can say something, `await ws.waitForTurnEnd()`, read what the caller
 * heard, and decide what to say next.
 */
export type FakeWsFrame = Record<string, unknown>;

export type TurnEnd = {
  /** Everything spoken since the previous turn end (fillers included). */
  text: string;
  /** True when the turn closed because the agent sent `{type:"end"}`. */
  ended: boolean;
  /** True when `waitForTurnEnd` gave up before any frame closed the turn. */
  timedOut: boolean;
  seq: number;
};

export type FakeWs = {
  /** What `CallSession` calls. */
  send: (raw: string) => void;
  /** Every frame received, parsed, in order. */
  sent: FakeWsFrame[];
  /** All spoken text so far, concatenated. */
  spoken: () => string;
  /** Text spoken in the CURRENT (not yet closed) turn. */
  currentText: () => string;
  /** Completed turns so far, in order. */
  turnEnds: TurnEnd[];
  /** Resolves with the NEXT turn end (or immediately with an unconsumed one). */
  turnEnded: () => Promise<TurnEnd>;
  /**
   * Wait for the next turn end after `afterSeq` (default: any not-yet-consumed
   * one, then the next to arrive). Resolves `{timedOut:true}` after `timeoutMs`.
   */
  waitForTurnEnd: (timeoutMs: number, afterSeq?: number) => Promise<TurnEnd>;
  /** Resolves when the next NON-EMPTY text token arrives (or times out → false). */
  waitForFirstText: (timeoutMs: number) => Promise<boolean>;
  /** Mark everything received so far as consumed (waiters only see later turns). */
  markConsumed: () => number;
  ended: boolean;
  endReason: string | null;
};

export function createFakeWs(): FakeWs {
  const sent: FakeWsFrame[] = [];
  const turnEnds: TurnEnd[] = [];
  let buf = "";
  let all = "";
  let seq = 0;
  let consumedSeq = 0;
  const waiters: Array<{ afterSeq: number; resolve: (t: TurnEnd) => void }> = [];
  const textWaiters: Array<() => void> = [];

  const closeTurn = (ended: boolean) => {
    seq++;
    const t: TurnEnd = { text: buf, ended, timedOut: false, seq };
    buf = "";
    turnEnds.push(t);
    for (const w of waiters.splice(0)) {
      if (w.afterSeq < seq) w.resolve(t);
      else waiters.push(w);
    }
  };

  const ws: FakeWs = {
    sent,
    turnEnds,
    ended: false,
    endReason: null,
    send(raw: string) {
      let msg: FakeWsFrame;
      try {
        msg = JSON.parse(raw) as FakeWsFrame;
      } catch {
        return;
      }
      sent.push(msg);
      if (msg.type === "text") {
        const tok = String(msg.token ?? "");
        if (tok) {
          buf += tok;
          all += tok;
          for (const cb of textWaiters.splice(0)) cb();
        }
        if (msg.last === true) closeTurn(false);
        return;
      }
      if (msg.type === "end") {
        ws.ended = true;
        try {
          const h = typeof msg.handoffData === "string" ? JSON.parse(msg.handoffData) : msg.handoffData;
          ws.endReason = h && typeof h === "object" && typeof (h as any).reason === "string" ? String((h as any).reason) : "end";
        } catch {
          ws.endReason = "end";
        }
        closeTurn(true);
      }
    },
    spoken: () => all,
    currentText: () => buf,
    turnEnded: () => ws.waitForTurnEnd(24 * 3600 * 1000),
    waitForTurnEnd(timeoutMs: number, afterSeq?: number) {
      const after = afterSeq ?? consumedSeq;
      const ready = turnEnds.find((t) => t.seq > after);
      if (ready) {
        consumedSeq = Math.max(consumedSeq, ready.seq);
        return Promise.resolve(ready);
      }
      return new Promise<TurnEnd>((resolve) => {
        const w = {
          afterSeq: after,
          resolve: (t: TurnEnd) => {
            clearTimeout(timer);
            consumedSeq = Math.max(consumedSeq, t.seq);
            resolve(t);
          },
        };
        const timer = setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          resolve({ text: buf, ended: ws.ended, timedOut: true, seq: seq });
        }, timeoutMs);
        waiters.push(w);
      });
    },
    waitForFirstText(timeoutMs: number) {
      if (buf) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const cb = () => {
          clearTimeout(timer);
          resolve(true);
        };
        const timer = setTimeout(() => {
          const i = textWaiters.indexOf(cb);
          if (i >= 0) textWaiters.splice(i, 1);
          resolve(false);
        }, timeoutMs);
        textWaiters.push(cb);
      });
    },
    markConsumed() {
      consumedSeq = seq;
      return seq;
    },
  };
  return ws;
}
