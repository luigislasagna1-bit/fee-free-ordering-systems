import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Clock, AlertTriangle, XCircle } from "lucide-react";

/**
 * Holding page for resellers that aren't yet approved (pending), have been
 * suspended, or have been rejected. Layout sidebar drops them here on every
 * /reseller/* visit until status flips back to "approved".
 *
 * If the caller is actually approved → bounce back to the dashboard.
 */
export default async function ResellerHoldingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const resellerProfileId = (session.user as any)?.resellerProfileId;
  if (!resellerProfileId) redirect("/login");

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: resellerProfileId },
    select: { status: true, suspendedReason: true, companyName: true },
  });
  if (!profile) redirect("/login");
  if (profile.status === "approved") redirect("/reseller");

  return (
    <div className="max-w-xl mx-auto pt-12">
      {profile.status === "pending" && (
        <Card
          icon={<Clock className="w-10 h-10 text-blue-600" />}
          title="Application under review"
          body="Thanks for applying to the Fee Free Ordering Partner Program. We typically review applications within 1–2 business days. You'll get an email once a decision has been made."
        />
      )}
      {profile.status === "suspended" && (
        <Card
          icon={<AlertTriangle className="w-10 h-10 text-yellow-600" />}
          title="Your reseller account is suspended"
          body={profile.suspendedReason ?? "Contact support for more information."}
        />
      )}
      {profile.status === "rejected" && (
        <Card
          icon={<XCircle className="w-10 h-10 text-red-600" />}
          title="Application not approved"
          body={profile.suspendedReason ?? "Your application was not approved at this time. You're welcome to apply again in the future."}
        />
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}
