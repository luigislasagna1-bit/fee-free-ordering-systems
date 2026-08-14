/**
 * The prompt-cache breakpoints on the CONVERSATION.
 *
 * The first breakpoint lives on the system block and covers tools + the whole
 * live menu — the change that took a call from $5.08 to $0.28. But caching is a
 * PREFIX match and a breakpoint only caches what precedes it, so `messages` was
 * re-billed in full every turn. Marking the newest message each turn caches
 * tools + system + conversation-so-far, and the next turn reads all of it at
 * 0.1×.
 *
 * 🚨 THE 20-BLOCK CLIFF — why one breakpoint was not enough.
 *
 * A breakpoint walks BACKWARD at most 20 content blocks looking for the
 * previous cache entry. Find nothing in 20 positions and checking stops: the
 * request silently re-processes the entire conversation at full price, with no
 * error and no way to tell from the outside.
 *
 * One turn appends `2k + 2` blocks for k tool calls — an assistant message
 * (thinking + text + k × tool_use) and a user message (k × tool_result). At the
 * 8-hop ceiling that is 18, inside the window by two. A single busy pizza turn
 * can therefore push the conversation out of its own cache, and every request
 * after it pays a full re-prefill: seconds of dead air, mid-call, getting worse
 * the longer the call runs. That is the shape of the complaint this service
 * exists to answer — "fine for a minute, then laggy and confused".
 *
 * So we also keep a ROLLING ANCHOR further back. Four breakpoints are allowed
 * per request and the system block uses one, which leaves room for the tail
 * marker plus an anchor.
 *
 * TWO RULES THIS ENCODES:
 *  • Never mutate the stored messages. A stale `cache_control` left on an older
 *    message would burn one of the 4 breakpoints allowed per request, and past
 *    4 the API rejects the call outright.
 *  • The anchor must be STABLE. A marker that moves every turn never gets read
 *    back — a cache entry has to be written on one request and found by the
 *    next. It advances in steps, only once the tail has drifted far enough that
 *    the old anchor is about to fall out of the lookback window.
 */

type Block = { type: string; [k: string]: unknown };
type Msg = { role: string; content: string | Block[] };

const EPHEMERAL = { type: "ephemeral" as const };

/** The API's hard lookback limit, in content blocks. */
export const LOOKBACK_BLOCKS = 20;

/** Re-anchor once the tail is this far past the anchor. Comfortably under the
 *  limit: one 8-hop turn can add 18 blocks on its own, so an anchor allowed to
 *  drift near 20 could be jumped clean over by a single turn. */
export const ANCHOR_ADVANCE_AT = 10;

/** Blocks in a message, counting a string body as the one block it becomes. */
function blockCount(m: Msg): number {
  if (typeof m.content === "string") return 1;
  return Array.isArray(m.content) ? Math.max(1, m.content.length) : 1;
}

/** Copy `m` with a breakpoint on its LAST content block. Never touches `m`. */
function markLastBlock<T extends Msg>(m: T): T | null {
  const blocks: Block[] =
    typeof m.content === "string"
      ? [{ type: "text", text: m.content }]
      : Array.isArray(m.content)
        ? m.content
        : [];
  if (!blocks.length) return null;
  const marked = blocks.map((b, i) => (i === blocks.length - 1 ? { ...b, cache_control: EPHEMERAL } : b));
  return { ...m, content: marked } as T;
}

/**
 * Return a copy of `messages` carrying the conversation breakpoints, plus the
 * anchor index to pass back in on the next turn.
 *
 * `anchorIndex` is the caller's memory of where the previous anchor was. Pass
 * `null` on the first turn.
 */
export function withMessageCacheBreakpoints<T extends Msg>(
  messages: T[],
  anchorIndex: number | null,
): { messages: T[]; anchorIndex: number | null } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages, anchorIndex };
  }

  // How many blocks sit between the current anchor and the end. If the anchor
  // is unset or has drifted too far, move it to a position close enough behind
  // the tail that it will still be found next turn — and far enough back that
  // it is not the tail itself.
  let anchor = anchorIndex !== null && anchorIndex >= 0 && anchorIndex < messages.length - 1 ? anchorIndex : null;
  if (anchor !== null) {
    let blocksSince = 0;
    for (let i = anchor + 1; i < messages.length; i++) blocksSince += blockCount(messages[i]);
    if (blocksSince > ANCHOR_ADVANCE_AT) anchor = null; // drifted — re-anchor below
  }
  if (anchor === null && messages.length >= 2) {
    // Walk back from the tail until we have a few blocks behind us, so the
    // anchor and the tail marker are not the same position.
    let blocks = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      blocks += blockCount(messages[i]);
      if (blocks >= 2 && i < messages.length - 1) {
        anchor = i;
        break;
      }
    }
  }

  const out = [...messages];

  // The anchor first — marking the tail replaces that entry, and marking the
  // anchor afterwards could otherwise clobber it when the two coincide.
  if (anchor !== null && anchor < out.length - 1) {
    const marked = markLastBlock(out[anchor]);
    if (marked) out[anchor] = marked;
    else anchor = null;
  }

  const tail = markLastBlock(out[out.length - 1]);
  if (!tail) {
    // Nothing markable at the tail (empty content) — leave the input alone
    // rather than shipping a request with a half-applied marker.
    return { messages, anchorIndex: anchor };
  }
  out[out.length - 1] = tail;

  return { messages: out, anchorIndex: anchor };
}

/** Back-compat shim for callers that only want the tail marker. */
export function withMessageCacheBreakpoint<T extends Msg>(messages: T[]): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (!last || typeof last !== "object") return messages;
  const marked = markLastBlock(last);
  if (!marked) return messages;
  return [...messages.slice(0, -1), marked];
}
