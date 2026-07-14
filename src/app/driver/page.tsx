import { redirect } from "next/navigation";
import { getDriverSession } from "@/lib/driver-session";
import { DriverQueue } from "./DriverQueue";

export const dynamic = "force-dynamic";

export default async function DriverHomePage() {
  const driver = await getDriverSession();
  if (!driver) redirect("/driver/login");
  return <DriverQueue driverName={driver.name} />;
}
