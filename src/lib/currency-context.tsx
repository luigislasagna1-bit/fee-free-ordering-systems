"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatCurrency } from "@/lib/utils";

/**
 * Per-restaurant currency context. Wrap any customer-facing tree with
 * <CurrencyProvider currency={restaurant.currency}> and call
 * `useCurrency()` inside nested components to format money in the
 * owner's chosen currency (ISO 4217 — e.g. "usd", "eur", "gbp").
 *
 * Why context vs. prop drilling? The customer ordering page renders
 * ~30 currency labels across half-a-dozen nested components
 * (CarouselCard, GridCard, CheckoutModal, PromoBanner, etc.). Threading
 * a `currency` prop through every layer would touch every component
 * signature in this file every time we add a new currency-aware
 * surface; context lets the leaves reach the right value without the
 * caller having to know what nesting depth needs it.
 *
 * The default is USD so legacy call sites that haven't been wrapped
 * yet keep their previous behaviour rather than crashing.
 */
const CurrencyContext = createContext<string>("usd");

export function CurrencyProvider({
  currency,
  children,
}: {
  currency?: string | null;
  children: ReactNode;
}) {
  const value = (currency || "usd").toLowerCase();
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Returns a memoised `fmt(amount)` already bound to the active
 *  restaurant's currency. Drop-in replacement for `formatCurrency`. */
export function useCurrencyFormat(): (amount: number) => string {
  const currency = useContext(CurrencyContext);
  return useMemo(() => (amount: number) => formatCurrency(amount, currency), [currency]);
}

/** Raw access if you need the ISO code (e.g. to send to Stripe). */
export function useCurrencyCode(): string {
  return useContext(CurrencyContext);
}
