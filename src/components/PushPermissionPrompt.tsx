"use client";
import { useEffect } from "react";
import { requestPushPermission } from "@/lib/native-shell";

/**
 * Branded-app push opt-in, mounted on the order CONFIRMATION page — the
 * "get notified when your order is ready" moment, deliberately NOT app
 * launch (cold prompts get denied forever). No-op outside the shell and
 * after a remembered denial. 2026-08-02.
 */
export function PushPermissionPrompt() {
  useEffect(() => {
    const t = setTimeout(() => void requestPushPermission(), 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
