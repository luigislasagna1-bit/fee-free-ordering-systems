import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const {
    name, slogan, description, phone, email, address, city, state, zip, cuisineType,
    timezone, taxRate, minimumOrder, deliveryFee, estimatedPickup, estimatedDelivery,
    acceptsPickup, acceptsDelivery, acceptsDineIn, acceptsCatering,
    logoUrl, bannerUrl, reviewLink, infoContent, themeSettings,
    lat, lng,
    mapProvider, googleMapsApiKey,
  } = data;

  if (mapProvider !== undefined && mapProvider !== "leaflet" && mapProvider !== "google") {
    return NextResponse.json({ error: "Invalid mapProvider" }, { status: 400 });
  }

  // Build update object — only include fields that were sent
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (slogan !== undefined) updateData.slogan = slogan;
  if (description !== undefined) updateData.description = description;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (address !== undefined) updateData.address = address;
  if (city !== undefined) updateData.city = city;
  if (state !== undefined) updateData.state = state;
  if (zip !== undefined) updateData.zip = zip;
  if (cuisineType !== undefined) updateData.cuisineType = cuisineType;
  if (timezone !== undefined) updateData.timezone = timezone;
  if (taxRate !== undefined) updateData.taxRate = taxRate;
  if (minimumOrder !== undefined) updateData.minimumOrder = minimumOrder;
  if (deliveryFee !== undefined) updateData.deliveryFee = deliveryFee;
  if (estimatedPickup !== undefined) updateData.estimatedPickup = estimatedPickup;
  if (estimatedDelivery !== undefined) updateData.estimatedDelivery = estimatedDelivery;
  if (acceptsPickup !== undefined) updateData.acceptsPickup = acceptsPickup;
  if (acceptsDelivery !== undefined) updateData.acceptsDelivery = acceptsDelivery;
  if (acceptsDineIn !== undefined) updateData.acceptsDineIn = acceptsDineIn;
  if (acceptsCatering !== undefined) updateData.acceptsCatering = acceptsCatering;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
  if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
  if (reviewLink !== undefined) updateData.reviewLink = reviewLink;
  if (infoContent !== undefined) updateData.infoContent = infoContent;
  if (themeSettings !== undefined) updateData.themeSettings = themeSettings;
  if (lat !== undefined) updateData.lat = lat;
  if (lng !== undefined) updateData.lng = lng;
  if (mapProvider !== undefined) updateData.mapProvider = mapProvider;
  if (googleMapsApiKey !== undefined) updateData.googleMapsApiKey = googleMapsApiKey || null;

  await prisma.restaurant.update({ where: { id: restaurantId }, data: updateData });
  return NextResponse.json({ success: true });
}
