import { requirePlatformStaff } from "@/lib/platform-auth";
import ProjectDetailClient from "./ProjectDetailClient";

/** Superadmin — one branded-app project (Luigi 2026-08-02). English-only. */
export default async function BrandedAppProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePlatformStaff();
  if (!staff) {
    return <div className="p-8 text-sm text-gray-500">Forbidden.</div>;
  }
  const { id } = await params;
  return <ProjectDetailClient projectId={id} />;
}
