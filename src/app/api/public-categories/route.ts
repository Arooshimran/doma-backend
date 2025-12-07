import { type NextRequest, NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload-client";
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers";

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  });

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request);

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

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      headers: corsHeaders(request),
    }
  );
}
