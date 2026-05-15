import NextAuth from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";

const handler = NextAuth(kitchenAuthOptions);
export { handler as GET, handler as POST };
