import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "http://localhost:3001",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
})

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

export async function GET(request: NextRequest, context: { params: Record<string, string> }) {
  try {
    const { params } = context;
    console.log('🔍 Fetching product by ID:', params.id)
    
    const payload = await getPayloadClient()

    const product = await payload.findByID({
      collection: "products",
      id: params.id,
      populate: ["category", "vendor", "images", "threeDModel"],
      overrideAccess: true, // Allow access regardless of collection access rules
    })

    if (!product) {
      console.log('❌ Product not found:', params.id)
      return NextResponse.json(
        { error: "Product not found" }, 
        { status: 404, headers: getCorsHeaders() }
      )
    }

    console.log('✅ Product found:', { id: product.id, title: product.title, vendor: product.vendor })
    
    return NextResponse.json(product, {
      headers: getCorsHeaders()
    })
  } catch (error) {
    console.error("💥 Error fetching product:", error)
    return NextResponse.json(
      { error: "Failed to fetch product" }, 
      { status: 500, headers: getCorsHeaders() }
    )
  }
}

export async function DELETE(request: NextRequest, context: { params: Record<string, string> }) {
  try {
    const { params } = context;
    const payload = await getPayloadClient();

    await payload.delete({
      collection: "products",
      id: params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("💥 Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PUT handler (update product)
export async function PUT(request: NextRequest, context: { params: Record<string, string> }) {
  try {
    const { params } = context;
    const payload = await getPayloadClient();
    const updateData = await request.json();

    const updatedProduct = await payload.update({
      collection: "products",
      id: params.id,
      data: updateData,
    });

    return NextResponse.json({ product: updatedProduct });
  } catch (error) {
    console.error("💥 Error updating product:", error);
    return NextResponse.json(
      { error: "Failed to update product", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}