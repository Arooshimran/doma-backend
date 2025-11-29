import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  })

// Handle preflight OPTIONS request
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function GET(request: NextRequest, context: any) {
  const headers = corsHeaders(request)
  try {
    const { params } = context;
    console.log('Fetching product by ID:', params.id)
    
    const payload = await getPayloadClient()

    const product = await payload.findByID({
      collection: "products",
      id: params.id,
      populate: ["category", "vendor", "images", "threeDModel"],
      overrideAccess: true, // Allow access regardless of collection access rules
    })

    if (!product) {
      console.log('Product not found:', params.id)
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404, headers }
      )
    }

    console.log('Product found:', { id: product.id, title: product.title, vendor: product.vendor })
    
    return NextResponse.json(product, { headers })
  } catch (error) {
    console.error("Error fetching product:", error)
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500, headers }
    )
  }
}

export async function DELETE(request: NextRequest, context: any) {
  const headers = corsHeaders(request)
  try {
    const { params } = context;
    const payload = await getPayloadClient();

    await payload.delete({
      collection: "products",
      id: params.id,
    });

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers }
    );
  }
}

// PUT handler (update product)
export async function PUT(request: NextRequest, context: any) {
  const headers = corsHeaders(request)
  try {
    const { params } = context;
    const payload = await getPayloadClient();
    const updateData = await request.json();

    const updatedProduct = await payload.update({
      collection: "products",
      id: params.id,
      data: updateData,
    });

    return NextResponse.json({ product: updatedProduct }, { headers });
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Failed to update product", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers }
    );
  }
}