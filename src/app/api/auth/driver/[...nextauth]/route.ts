import NextAuth from "next-auth";
import { driverAuthOptions } from "@/lib/auth-driver";

const handler = NextAuth(driverAuthOptions);
export { handler as GET, handler as POST };
