/**
 * Email renderer.
 *
 * Wraps @react-email/render's `render` so the rest of the codebase doesn't
 * have to know the package detail. Returns rendered HTML (string) ready to
 * pass to Resend.
 */
import { render } from "@react-email/render";
import type { ReactElement } from "react";

export async function renderEmail(element: ReactElement): Promise<string> {
  return await render(element, { pretty: false });
}
