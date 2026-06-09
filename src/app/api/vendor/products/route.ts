import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { validateProductImageMatch } from "@/lib/image-validator"

const MAX_INVENTORY_QUANTITY = 10_000

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  })

const getVendorIdFromToken = async (request: NextRequest): Promise<string | null> => {
  try {
    const authHeader = request.headers.get("Authorization")
    
    if (!authHeader || !authHeader.startsWith("JWT ")) {
      return null
    }

    const token = authHeader.substring(4)

    try {
      const base64Payload = token.split('.')[1]
      const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
      const decoded = JSON.parse(decodedPayload)
      
      if (decoded.collection !== 'vendors') {
        return null
      }
      
      return decoded.id
    } catch (decodeError) {
      return null
    }
  } catch (error) {
    console.error("Token verification error:", error)
    return null
  }
}

const handleCategory = async (payload: any, categoryName: string): Promise<string | null> => {
  if (!categoryName) {
    return null
  }
  
  try {
    const existingCategories = await payload.find({
      collection: 'categories',
      where: {
        name: {
          equals: categoryName
        }
      },
      limit: 1
    })

    if (existingCategories.docs.length > 0) {
      return existingCategories.docs[0].id
    }

    const newCategory = await payload.create({
      collection: 'categories',
      data: {
        name: categoryName,
        slug: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      }
    })

    return newCategory.id
  } catch (error) {
    console.warn("Category handling failed:", error)
    return null
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// GET - Fetch vendor's products (FIXED VERSION)
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        {
          status: 401,
          headers,
        }
      )
    }
    
    const payload = await getPayloadClient()
    const { searchParams } = new URL(request.url)
    
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const status = searchParams.get("status") || "all"

    const where: any = {
      vendor: {
        equals: vendorId,
      },
    }

    if (status !== "all") {
      where.status = { equals: status }
    }

    const products = await payload.find({
      collection: "products",
      where,
      page,
      limit,
      populate: ["category", "vendor", "images"],
      sort: "-createdAt",
      overrideAccess: true,
    })

    return NextResponse.json(products, {
      headers,
    })
  } catch (error) {
    console.error("Error fetching vendor products:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch products",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 500,
        headers,
      }
    )
  }
}

// POST - Create new product (FIXED VERSION FOR YOUR PAYLOAD SCHEMA)
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        {
          status: 401,
          headers,
        }
      )
    }

    let data
    try {
      data = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        {
          status: 400,
          headers,
        }
      )
    }

    const { title, Description, shortDescription, pricing, pricingDetails } = data
    
    const description = Description || shortDescription
    
    const price = data.price || pricing?.price || pricingDetails?.sellingPrice
    
    if (!title || !description || price === undefined || price === null) {
      return NextResponse.json(
        { error: "Missing required fields: title, Description (or shortDescription), price" },
        {
          status: 400,
          headers,
        }
      )
    }

    const numericPrice = Number(price)
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return NextResponse.json(
        { error: "Price must be a positive number" },
        {
          status: 400,
          headers,
        }
      )
    }

    // ── Inventory quantity cap ────────────────────────────────────────
    const requestedQty = Number(data.inventory?.quantity ?? 0)
    if (requestedQty > MAX_INVENTORY_QUANTITY) {
      return NextResponse.json(
        { error: `Inventory quantity cannot exceed ${MAX_INVENTORY_QUANTITY.toLocaleString()} units per listing` },
        { status: 400, headers }
      )
    }

    const payload = await getPayloadClient()

    let categoryId = null
    if (data.category) {
      categoryId = await handleCategory(payload, data.category)
    }

    // ── Image-name mismatch check (CLIP) ────────────────────────────
    if (data.images && data.images.length > 0) {
      const firstEntry = data.images[0]
      const imageRef = firstEntry?.image ?? firstEntry
      let imageUrl: string | null = null

      if (typeof imageRef === "object" && imageRef !== null) {
        imageUrl = imageRef.cloudinaryUrl ?? imageRef.url ?? null
      } else if (typeof imageRef === "string") {
        try {
          const media = await payload.findByID({ collection: "media", id: imageRef, overrideAccess: true })
          imageUrl = (media as any)?.cloudinaryUrl ?? media?.url ?? null
        } catch { /* non-fatal */ }
      }

      console.log("[CLIP] Image URL resolved for validation:", imageUrl)
      if (imageUrl) {
        const check = await validateProductImageMatch(imageUrl, title)
        if (!check.isValid) {
          return NextResponse.json(
            { error: `Product image does not match the product name "${title}". ${check.reason}` },
            { status: 400, headers }
          )
        }
      }
    }

    const productData: any = {
      title: title.trim(),
      slug: title.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      Description: description.trim(),
      
      pricing: {
        price: numericPrice,
        ...(data.discountedPrice && { discountedPrice: Number(data.discountedPrice) }),
        ...(data.comparePrice && { discountedPrice: Number(data.comparePrice) })
      },
      
      inventory: data.inventory ? {
        quantity: data.inventory.quantity ?? 0,
        lowStockThreshold: data.inventory.lowStockThreshold ?? 5
      } : {
        quantity: 0,
        lowStockThreshold: 5
      },
      
      vendor: vendorId,
      status: data.status || "draft",
      
      ...(data.images && { images: data.images }),
      ...(categoryId && { category: categoryId }),
      ...(data.threeDModel && { threeDModel: data.threeDModel }),
      ...(data.featured !== undefined && { featured: data.featured }),
      ...(data.size && { size: data.size }),
      ...(data.colors && { colors: data.colors }),
    }

    try {
      const product = await payload.create({
        collection: "products",
        data: productData,
        overrideAccess: true,
      })

      return NextResponse.json(
        {
          success: true,
          message: "Product created successfully",
          product,
        },
        {
          status: 201,
          headers,
        }
      )
    } catch (createError) {
      console.error("Product creation failed:", createError)
      
      
      let errorMessage = "Failed to create product in database"
      if (createError instanceof Error) {
        if (createError.message.includes("duplicate key")) {
          errorMessage = "Product with this title or slug already exists"
        } else if (createError.message.includes("validation")) {
          errorMessage = `Validation error: ${createError.message}`
        } else if (createError.message.includes("ObjectId")) {
          errorMessage = "Invalid ID format in product data"
        } else {
          errorMessage = createError.message
        }
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: createError instanceof Error ? createError.message : "Unknown database error"
        },
        {
          status: 500,
          headers,
        }
      )
    }
  } catch (error) {
    console.error("Unexpected error in POST /api/vendor/products:", error)
    
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 500,
        headers,
      }
    )
  }
}

// PUT - Update existing product (ENHANCED VERSION)
export async function PUT(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        {
          status: 401,
          headers,
        }
      )
    }
    
    const payload = await getPayloadClient()
    const updateData = await request.json()

    const id = updateData.id || new URL(request.url).searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400, headers }
      )
    }

    try {
      const existingProduct = await payload.findByID({
        collection: "products",
        id,
        overrideAccess: true,
      })

      if (!existingProduct) {
        return NextResponse.json(
          { error: "Product not found" },
          { status: 404, headers }
        )
      }

      const productVendorId = typeof existingProduct.vendor === 'object' 
        ? existingProduct.vendor.id 
        : existingProduct.vendor
        
      if (productVendorId !== vendorId) {
        return NextResponse.json(
          { error: "Access denied - you can only edit your own products" },
          { status: 403, headers }
        )
      }

    } catch (verifyError) {
      console.error("Error verifying product ownership:", verifyError)
      return NextResponse.json(
        { error: "Failed to verify product ownership" },
        { status: 500, headers }
      )
    }

    const { id: _, ...dataToUpdate } = updateData

    // ── Inventory quantity cap ────────────────────────────────────────
    if (dataToUpdate.inventory?.quantity !== undefined) {
      const newQty = Number(dataToUpdate.inventory.quantity)
      if (newQty > MAX_INVENTORY_QUANTITY) {
        return NextResponse.json(
          { error: `Inventory quantity cannot exceed ${MAX_INVENTORY_QUANTITY.toLocaleString()} units per listing` },
          { status: 400, headers }
        )
      }
    }

    if (dataToUpdate.category && typeof dataToUpdate.category === 'object') {
      dataToUpdate.category = dataToUpdate.category.id
    }

    const updatedProduct = await payload.update({
      collection: "products",
      id,
      data: dataToUpdate,
      overrideAccess: true,
    })

    return NextResponse.json(
      { 
        success: true,
        message: "Product updated successfully",
        product: updatedProduct 
      },
      { status: 200, headers }
    )
  } catch (error) {
    console.error("Error updating product:", error)
    
    let errorMessage = "Failed to update product"
    let statusCode = 500
    
    if (error instanceof Error) {
      if (error.message.includes("duplicate") || error.message.includes("E11000")) {
        errorMessage = "Product with this title or slug already exists"
        statusCode = 409
      } else if (error.message.includes("validation")) {
        errorMessage = `Validation error: ${error.message}`
        statusCode = 400
      } else if (error.message.includes("ObjectId")) {
        errorMessage = "Invalid product ID format"
        statusCode = 400
      }
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: statusCode, headers }
    )
  }
}

// DELETE - Delete product
export async function DELETE(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const payload = await getPayloadClient();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400, headers }
      );
    }

    await payload.delete({
      collection: "products",
      id,
    });

    return NextResponse.json(
      { success: true, message: "Product deleted successfully" },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers }
    );
  }
}
