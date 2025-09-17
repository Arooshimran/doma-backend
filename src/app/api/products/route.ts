import { type NextRequest, NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload-client";

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "http://localhost:3001",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

// GET - Fetch products with populated vendor data
export async function GET(request: NextRequest) {
  try {
    console.log("🚀 GET /api/products - Starting...");

    const payload = await getPayloadClient();
    const { searchParams } = new URL(request.url);

    // Extract query parameters
    const slugQuery = searchParams.get("where[slug][equals]");
    const categoryQuery = searchParams.get("category");
    const categorySlugQuery = searchParams.get("where[category.slug][equals]");
    const vendorQuery = searchParams.get("vendor");
    const searchQuery = searchParams.get("search");
    const page = Number.parseInt(searchParams.get("page") || "1");
    const limit = Number.parseInt(searchParams.get("limit") || "12");
    const status = searchParams.get("status") || "published";

    // Build where clause
    const where: any = {
      status: { equals: status },
    };

    if (slugQuery) {
      where.slug = { equals: slugQuery };
    }

    if (categoryQuery) {
      where.category = { equals: categoryQuery };
    }

    // Handle category filtering by slug
    if (categorySlugQuery) {
      // First find the category by slug to get its ID
      const categoryResult = await payload.find({
        collection: "categories",
        where: {
          slug: { equals: categorySlugQuery }
        },
        limit: 1,
        overrideAccess: true,
      });
      
      if (categoryResult.docs.length > 0) {
        where.category = { equals: categoryResult.docs[0].id };
      } else {
        // If category slug doesn't exist, return empty results
        return NextResponse.json({
          docs: [],
          totalDocs: 0,
          limit: limit,
          totalPages: 0,
          page: page,
          pagingCounter: 0,
          hasPrevPage: false,
          hasNextPage: false,
          prevPage: null,
          nextPage: null
        }, { headers: getCorsHeaders() });
      }
    }

    if (vendorQuery) {
      where.vendor = { equals: vendorQuery };
    }

    if (searchQuery) {
      where.or = [
        { title: { contains: searchQuery } },
        { shortDescription: { contains: searchQuery } },
      ];
    }

    console.log("📋 Query parameters:", { 
      slugQuery, 
      categoryQuery,
      categorySlugQuery, 
      vendorQuery, 
      searchQuery, 
      page, 
      limit,
      where 
    });

    // Fetch products with populated relationships
    const products = await payload.find({
      collection: "products",
      where,
      page,
      limit,
      populate: [
        "category", 
        "vendor", 
        "vendor.storeLogo", 
        "images", 
        "images.image"
      ],
      overrideAccess: true,
    });

    console.log("✅ Products fetched:", products.docs.length);

    // Log first product to debug vendor data
    if (products.docs.length > 0) {
      console.log("🔍 First product vendor data:", JSON.stringify(products.docs[0].vendor, null, 2));
    }

    return NextResponse.json(products, { headers: getCorsHeaders() });
  } catch (error) {
    console.error("💥 Error fetching products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch products",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

// POST - Create product (for completeness)
export async function POST(request: NextRequest) {
  try {
    console.log("⚠️ POST /api/products received");

    const payload = await getPayloadClient();

    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const requiredFields = ["title", "pricing", "vendor"];
    const missingFields = requiredFields.filter((f) => !body[f]);

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(", ")}` },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const createdProduct = await payload.create({
      collection: "products",
      data: body,
    });

    console.log("✅ Product created successfully:", createdProduct.id);
    return NextResponse.json(createdProduct, { 
      status: 201, 
      headers: getCorsHeaders() 
    });
  } catch (error) {
    console.error("💥 Error creating product:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

// PUT - Update product
export async function PUT(request: NextRequest) {
  try {
    const payload = await getPayloadClient();
    const body = await request.json();

    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing product id" }, 
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const updatedProduct = await payload.update({
      collection: "products",
      id,
      data: updateData,
    });

    return NextResponse.json(
      { product: updatedProduct }, 
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error("💥 Error updating product:", error);
    return NextResponse.json(
      { 
        error: "Failed to update product", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

// DELETE - Delete product
export async function DELETE(request: NextRequest) {
  try {
    const payload = await getPayloadClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing product id" }, 
        { status: 400, headers: getCorsHeaders() }
      );
    }

    await payload.delete({
      collection: "products",
      id,
    });

    return NextResponse.json(
      { success: true }, 
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error("💥 Error deleting product:", error);
    return NextResponse.json(
      { 
        error: "Failed to delete product", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
