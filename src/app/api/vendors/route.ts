import { type NextRequest, NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload-client";

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "http://localhost:3001",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
});

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

// GET - Fetch public vendor information
export async function GET(request: NextRequest) {
  try {
    console.log("🚀 GET /api/vendors - Starting...");

    const payload = await getPayloadClient();
    const { searchParams } = new URL(request.url);

    // Extract query parameters
    const slug = searchParams.get("where[slug][equals]");
    const id = searchParams.get("where[id][equals]");
    const page = Number.parseInt(searchParams.get("page") || "1");
    const limit = Number.parseInt(searchParams.get("limit") || "12");

    // Build where clause
    const where: any = {
      status: { equals: "approved" }, // Only show approved vendors publicly
    };

    if (slug) {
      where.slug = { equals: slug };
    }

    if (id) {
      where.id = { equals: id };
    }

    console.log("📋 Query parameters:", { slug, id, page, limit });

    // Fetch vendors with populated storeLogo
    const vendors = await payload.find({
      collection: "vendors",
      where,
      page,
      limit,
      populate: ["storeLogo"], // Populate the storeLogo relationship
      overrideAccess: true,
    });

    console.log("✅ Vendors fetched:", vendors.docs.length);

    // Return public vendor data only (exclude sensitive information)
    const publicVendors = vendors.docs.map((vendor: { id: any; storeName: any; slug: any; storeDescription: any; status: any; storeLogo: { id: any; url: any; alt: any; filename: any; }; contactInfo: { city: any; country: any; }; businessInfo: { businessType: any; }; createdAt: any; updatedAt: any; }) => ({
      id: vendor.id,
      storeName: vendor.storeName || '',
      slug: vendor.slug || '',
      storeDescription: vendor.storeDescription || '',
      status: vendor.status,
      
      // Handle populated storeLogo
      storeLogo: vendor.storeLogo ? {
        id: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.id : vendor.storeLogo,
        url: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.url : '',
        alt: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.alt : '',
        filename: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.filename : ''
      } : null,
      
      // Include safe contact info
      contactInfo: {
        city: vendor.contactInfo?.city || '',
        country: vendor.contactInfo?.country || ''
      },
      
      // Include safe business info
      businessInfo: {
        businessType: vendor.businessInfo?.businessType || ''
      },
      
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    }));

    return NextResponse.json(
      {
        docs: publicVendors,
        totalDocs: vendors.totalDocs,
        totalPages: vendors.totalPages,
        page: vendors.page,
        limit: vendors.limit,
        hasNextPage: vendors.hasNextPage,
        hasPrevPage: vendors.hasPrevPage,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error("💥 Error fetching vendors:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch vendors",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
