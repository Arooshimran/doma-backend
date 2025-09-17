import { NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload-client";

export async function GET() {
  const headers = {
    "Access-Control-Allow-Origin": "http://localhost:3001", // Frontend URL
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    const payload = await getPayloadClient();

    const categories = await payload.find({
      collection: "categories",
      where: {
        isActive: { equals: true },
      },
      sort: "sortOrder",
      populate: ["image"],
    });

    return NextResponse.json(categories, { headers });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500, headers }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3001",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
