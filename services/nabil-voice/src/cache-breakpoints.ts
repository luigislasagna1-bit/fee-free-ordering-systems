/**
 * The SECOND prompt-cache breakpoint.
 *
 * The first one lives on the system block and covers tools + the whole live
 * menu — the change that took a call from $5.08 to $0.28. But prompt caching is
 * a PREFIX match, and the breakpoint only caches what precedes it: everything
 * in `messages` is still re-billed at full input price on every turn. That cost
 * grows with the call, and it grew faster once pizza landed — a single
 * get_item_options result is a few thousand tokens of toppings sitting in the
 * conversation for the rest of the call.
 *
 * So each turn also marks the LAST message, which caches
 * tools + system + conversation-so-far. The next turn reads all of it at 0.1×.
 *
 * TWO RULES THIS ENCODES:
 *  • Never mutate the stored messages. A stale `cache_control` left on an older
 *    message would burn one of the 4 breakpoints allowed per request, and past
 *    4 the API rejects the call outright.
 *  • Only the last message is marked. A breakpoint walks backward at most 20
 *    content blocks looking for a prior entry; marking the newest message every
 *    turn keeps that lookback short even in a tool-heavy turn.
 */

type Block = { type: string; [k: string]: unknown };
type Msg = { role: string; content: string | Block[] };

const EPHEMERAL = { type: "ephemeral" as const };

/**
 * Return a copy of `messages` whose final message carries a cache breakpoint.
 * Every other message is passed through by reference — untouched and unmarked.
 *
 * String content is widened to a single text block, which is the same request
 * to the API, because `cache_control` can only live on a content block.
 */
export function withMessageCacheBreakpoint<T extends Msg>(messages: T[]): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const last = messages[messages.length - 1];
  if (!last || typeof last !== "object") return messages;

  const blocks: Block[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : Array.isArray(last.content)
        ? last.content
        : [];
  if (!blocks.length) return messages;

  const marked = blocks.map((b, i) =>
    i === blocks.length - 1 ? { ...b, cache_control: EPHEMERAL } : b,
  );

  return [...messages.slice(0, -1), { ...last, content: marked } as T];
}
