import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

// PWA metadata: when a customer "Adds to Home Screen" from an ordering page,
// the manifest pins the app at the restaurant's order URL so re-opening the
// installed icon goes straight back to the menu. Each restaurant effectively
// becomes its own installable storefront on the customer's phone.
export const metadata: Metadata = {
  manifest: "/manifest-order.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Order",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
