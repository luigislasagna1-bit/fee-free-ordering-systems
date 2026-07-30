/** Read-only: state of the guest-cancel E2E fixtures after a cancel attempt. */
import prisma from "../src/lib/db";

async function main() {
  const o = await prisma.order.findUnique({
    where: { id: process.argv[2] || "cms5j4teu0000bsvhzsglj2zz" },
    select: { status: true, cancelledBy: true, rejectionReason: true, rejectedAt: true },
  });
  console.log("order:", JSON.stringify(o));
  const r = await prisma.reservation.findUnique({
    where: { id: process.argv[3] || "cms5j4tm90002bsvhmjol510o" },
    select: { status: true, cancelledBy: true, rejectionReason: true },
  });
  console.log("resv :", JSON.stringify(r));
}
main().finally(() => prisma.$disconnect());
