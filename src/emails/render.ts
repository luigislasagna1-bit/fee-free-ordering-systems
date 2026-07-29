/**
 * Email renderer.
 *
 * Wraps @react-email/render's `render` so the rest of the codebase doesn't
 * have to know the package detail. Returns rendered HTML (string) ready to
 * pass to Resend.
 */
import { render, toPlainText } from "@react-email/render";
import type { ReactElement } from "react";

export async function renderEmail(element: ReactElement): Promise<string> {
  return await render(element, { pretty: false });
}

/**
 * Plain-text alternative for deliverability (Fabrizio cms0gyexp #3 — HTML-only
 * mail is a classic spam-score hit). Same converter render({plainText:true})
 * uses internally, so calling it on the already-rendered HTML is byte-identical
 * with zero double-render cost. <Preview> preheaders carry
 * data-skip-in-text=true and are excluded automatically; images are skipped.
 */
export function emailHtmlToText(html: string): string {
  return toPlainText(html);
}
