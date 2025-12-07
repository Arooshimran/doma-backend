import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { isAdmin, isAdminOrVendor } from "@/lib/access-helpers"

interface WhereClause {
  status: { equals: string }
  slug?: { equals: string }
  id?: { equals: string }
  category?: { equals: string }
  vendor?: { equals: string }
  or?: Array<{
    title?: { contains: string }
    Description?: { contains: string }
  }>
}

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// GET PUBLIC PRODUCTS
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const payload = await getPayloadClient()
    const { searchParams } = new URL(request.url)

    const category = searchParams.get("category")
    const search = searchParams.get("search")
    const vendor = searchParams.get("vendor")
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "12", 10)
    const depth = parseInt(searchParams.get("depth") || "1", 10)

    const slugFilter = searchParams.get("where[slug][equals]")
    const idFilter = searchParams.get("where[id][equals]")

    const where: WhereClause = {
      status: { equals: "published" },
    }

    if (slugFilter) {
      where.slug = { equals: slugFilter }
    }

    if (idFilter) {
      where.id = { equals: idFilter }
    }

    if (category) {
      where.category = { equals: category }
    }

    if (search) {
      where.or = [
        { title: { contains: search } },
        { Description: { contains: search } },
      ]
    }

    if (vendor) {
      where.vendor = { equals: vendor }
    }

    const products = await payload.find({
      collection: "products",
      where,
      page,
      limit,
      depth,
      overrideAccess: true,
    })

    return NextResponse.json(products, { headers })
  } catch (error) {
    console.error("Error fetching products:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch products",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    )
  }
}

// CREATE PRODUCT
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const isAuthorized = isAdminOrVendor({ req: request as any })
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized - only admins and vendors can create products" },
        { status: 403, headers }
      )
    }

    const payload = await getPayloadClient()

    let body
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400, headers }
      )
    }

    const requiredFields = ["title", "price", "category", "vendor"]
    const missingFields = requiredFields.filter((f) => !body[f])

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(", ")}` },
        { status: 400, headers }
      )
    }

    const data: any = {
      title: body.title,
      category: typeof body.category === "object" ? body.category.id : body.category,
      vendor: typeof body.vendor === "object" ? body.vendor.id : body.vendor,
      Description: body.Description || body.shortDescription || "",
      pricing: {
        price: body.price || body.pricing?.price,
        ...(body.discountedPrice && { discountedPrice: body.discountedPrice }),
        ...(body.pricing?.discountedPrice && { discountedPrice: body.pricing.discountedPrice }),
      },
      status: body.status || "draft",
      ...(body.images && { images: body.images }),
      ...(body.threeDModel && { threeDModel: body.threeDModel }),
      ...(body.featured !== undefined && { featured: body.featured }),
      ...(body.size && { size: body.size }),
      ...(body.colors && { colors: body.colors }),
      inventory: body.inventory || {
        quantity: 0,
        lowStockThreshold: 5,
      },
    }

    const createdProduct = await payload.create({
      collection: "products",
      data,
    })
    return NextResponse.json(createdProduct, { status: 201, headers })
  } catch (error) {
    console.error("Error creating product:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    )
  }
}

// PUT handler (update product)
export async function PUT(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const isAuthorized = isAdminOrVendor({ req: request as any })
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized - only admins and vendors can update products" },
        { status: 403, headers }
      )
    }

    const payload = await getPayloadClient()
    const body = await request.json()

    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: "Missing product id" },
        { status: 400, headers }
      )
    }

    const updatedProduct = await payload.update({
      collection: "products",
      id,
      data: updateData,
    })

    return NextResponse.json({ product: updatedProduct }, { headers })
  } catch (error) {
    console.error("Error updating product:", error)
    return NextResponse.json(
      {
        error: "Failed to update product",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    )
  }
}

// DELETE PRODUCT
export async function DELETE(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const isAuthorized = isAdminOrVendor({ req: request as any })
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized - only admins and vendors can delete products" },
        { status: 403, headers }
      )
    }

    const payload = await getPayloadClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Missing product id" },
        { status: 400, headers }
      )
    }

    await payload.delete({
      collection: "products",
      id,
    })

    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error("Error deleting product:", error)
    return NextResponse.json(
      {
        error: "Failed to delete product",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    )
  }
}