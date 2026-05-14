import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateOrderNumber(): string {
  const now = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `ORD-${now.toString().slice(-6)}${random.toString().padStart(3, "0")}`;
}

export const ORDER_STATUS = {
  pending: { label: "Pending", color: "yellow" },
  accepted: { label: "Accepted", color: "blue" },
  preparing: { label: "Preparing", color: "orange" },
  ready: { label: "Ready", color: "green" },
  completed: { label: "Completed", color: "gray" },
  rejected: { label: "Rejected", color: "red" },
  cancelled: { label: "Cancelled", color: "red" },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS;
