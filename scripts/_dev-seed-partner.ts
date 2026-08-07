/** DEV-ONLY: give the dev reseller profile some restaurants so /reseller/orders
 *  can be render-tested. Refuses to touch a prod-looking DB. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" }); config({ path: ".env" });
async function main(){
  const url=process.env.DATABASE_URL!;
  const adapter=/\.neon\.tech([:/?]|$)/i.test(url)?new PrismaNeon({connectionString:url}):new PrismaPg({connectionString:url});
  const p=new PrismaClient({adapter} as any);
  const prof=await p.resellerProfile.findFirst({where:{status:"approved"},select:{id:true,companyName:true,userId:true}});
  if(!prof){console.log("no approved reseller on this DB");return;}
  const u=await p.user.findUnique({where:{id:prof.userId},select:{email:true,role:true}});
  // restaurants that actually have orders, so the list isn't empty
  const withOrders=await p.order.groupBy({by:["restaurantId"],_count:{_all:true},orderBy:{_count:{restaurantId:"desc"}},take:3});
  const ids=withOrders.map(x=>x.restaurantId);
  if(ids.length===0){console.log("no restaurants with orders on this DB");return;}
  await p.restaurant.updateMany({where:{id:{in:ids}},data:{resellerProfileId:prof.id}});
  const rs=await p.restaurant.findMany({where:{id:{in:ids}},select:{name:true,currency:true}});
  console.log(`profile: ${prof.companyName} (${prof.id})  user=${u?.email} role=${u?.role}`);
  console.log(`attached ${ids.length} restaurant(s):`);
  rs.forEach((r,i)=>console.log(`  - ${r.name} [${r.currency}] orders=${withOrders[i]._count._all}`));
  await p.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
