/** DEV-ONLY: mint a next-auth session cookie for the local reseller test user
 *  so /reseller/orders can be browser-verified without typing a password. */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { encode } from "next-auth/jwt";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
async function main(){
  const url=process.env.DATABASE_URL!;
  const adapter=/\.neon\.tech([:/?]|$)/i.test(url)?new PrismaNeon({connectionString:url}):new PrismaPg({connectionString:url});
  const p=new PrismaClient({adapter} as any);
  const prof=await p.resellerProfile.findFirst({where:{status:"approved"},select:{id:true,userId:true}});
  if(!prof) throw new Error("no approved reseller on this DB");
  const u=await p.user.findUnique({where:{id:prof.userId},select:{id:true,email:true,name:true,role:true}});
  if(!u) throw new Error("reseller user missing");
  const token=await encode({
    token:{ sub:u.id, email:u.email, name:u.name, role:u.role, resellerProfileId:prof.id, restaurantId:null, restaurantSlug:null },
    secret:process.env.NEXTAUTH_SECRET!, maxAge:60*60,
  });
  console.log(token);
  await p.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
