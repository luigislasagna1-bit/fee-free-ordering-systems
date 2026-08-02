"use client";
import { useEffect } from "react";
import { bootNativeShell } from "@/lib/native-shell";

/** Mounts the branded-app shell bootstrap (no-op in regular browsers).
 *  Sits in the order layout beside ServiceWorkerRegister. 2026-08-02. */
export function NativeShellBoot({ slug }: { slug: string }) {
  useEffect(() => {
    bootNativeShell({ slug });
  }, [slug]);
  return null;
}
