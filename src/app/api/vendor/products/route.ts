import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  })

const getVendorIdFromToken = async (request: NextRequest): Promise<string | null> => {
  try {
    console.log("Starting token verification...")
    
    const authHeader = request.headers.get("Authorization")
    console.log("Auth header:", authHeader ? `${authHeader.substring(0, 20)}...` : "Missing")
    
    if (!authHeader || !authHeader.startsWith("JWT ")) {
      console.log("No valid Authorization header found")
      return null
    }

    const token = authHeader.substring(4)
    console.log("Token extracted, length:", token.length)

    try {
      const base64Payload = token.split('.')[1]
      const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
      const decoded = JSON.parse(decodedPayload)
      
      console.log("Token decoded successfully:", { 
        id: decoded.id, 
        email: decoded.email,
        collection: decoded.collection 
      })
      
      if (decoded.collection !== 'vendors') {
        console.log("Token is not for vendors collection")
        return null
      }
      
      return decoded.id
    } catch (decodeError) {
      console.log("JWT decode failed:", decodeError)
      return null
    }
  } catch (error) {
    console.error("Token verification error:", error)
    return null
  }
}

const handleCategory = async (payload: any, categoryName: string): Promise<string | null> => {
  if (!categoryName) {
    console.log("No category provided")
    return null
  }
  
  try {
    console.log("Looking up category:", categoryName)
    
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
      console.log("Found existing category:", existingCategories.docs[0].id)
      return existingCategories.docs[0].id
    }

    console.log("Creating new category:", categoryName)
    const newCategory = await payload.create({
      collection: 'categories',
      data: {
        name: categoryName,
        slug: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      }
    })

    console.log("Created new category:", newCategory.id)
    return newCategory.id
  } catch (error) {
    console.warn("Category handling failed:", error)
    return null
  }
}

export async function OPTIONS(request: NextRequest) {
  console.log("Handling OPTIONS preflight request for vendor products")
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// GET - Fetch vendor's products (FIXED VERSION)
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("GET /api/vendor/products - Starting...")
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        {
          status: 401,
          headers,
        }
      )
    }

    console.log("Vendor authenticated:", vendorId)
    
    const payload = await getPayloadClient()
    const { searchParams } = new URL(request.url)
    
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const status = searchParams.get("status") || "all"

    console.log("Query params:", { page, limit, status })

    const where: any = {
      vendor: {
        equals: vendorId,
      },
    }

    if (status !== "all") {
      where.status = { equals: status }
    }

    console.log("Query where clause:", JSON.stringify(where, null, 2))

    const products = await payload.find({
      collection: "products",
      where,
      page,
      limit,
      populate: ["category", "vendor", "images"],
      sort: "-createdAt",
      overrideAccess: true,
    })

    console.log("Products fetched successfully:", products.docs.length)
    console.log("Sample product (if any):", products.docs[0] ? {
      id: products.docs[0].id,
      title: products.docs[0].title,
      vendor: products.docs[0].vendor,
      status: products.docs[0].status
    } : "No products found")

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
    console.log("POST /api/vendor/products - Starting...")
    
    console.log("Request method:", request.method)
    console.log("Request URL:", request.url)

    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        {
          status: 401,
          headers,
        }
      )
    }

    console.log("Vendor authenticated:", vendorId)

    let data
    try {
      data = await request.json()
      console.log("Request body:", JSON.stringify(data, null, 2))
    } catch (parseError) {
      console.log("Failed to parse request body:", parseError)
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
    
    console.log("Validating fields:", { 
      title, 
      description, 
      price,
      pricing: data.pricing,
      pricingDetails: data.pricingDetails
    })
    
    if (!title || !description || price === undefined || price === null) {
      console.log("Missing required fields")
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
      console.log("Invalid price:", price)
      return NextResponse.json(
        { error: "Price must be a positive number" },
        {
          status: 400,
          headers,
        }
      )
    }

    console.log("Validation passed")

    const payload = await getPayloadClient()
    console.log("Payload client obtained")

    let categoryId = null
    if (data.category) {
      categoryId = await handleCategory(payload, data.category)
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

    console.log("Product data to create:", JSON.stringify(productData, null, 2))

    try {
      const product = await payload.create({
        collection: "products",
        data: productData,
        overrideAccess: true,
      })

      console.log("Product created successfully:", product.id)

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
      
      if (createError instanceof Error) {
        console.error(" Error message:", createError.message)
        console.error("Error stack:", createError.stack)
      }
      
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
    
    if (error instanceof Error) {
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)
    }
    
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
    console.log("PUT /api/vendor/products - Starting update...")
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        {
          status: 401,
          headers,
        }
      )
    }

    console.log("Vendor authenticated:", vendorId)
    
    const payload = await getPayloadClient()
    const updateData = await request.json()
    
    console.log("Update data received:", JSON.stringify(updateData, null, 2))

    const id = updateData.id || new URL(request.url).searchParams.get("id")

    if (!id) {
      console.log("Product ID is required")
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400, headers }
      )
    }

    console.log("Updating product ID:", id)

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
        console.log("Access denied - product belongs to different vendor")
        return NextResponse.json(
          { error: "Access denied - you can only edit your own products" },
          { status: 403, headers }
        )
      }

      console.log("Product ownership verified")

    } catch (verifyError) {
      console.error("Error verifying product ownership:", verifyError)
      return NextResponse.json(
        { error: "Failed to verify product ownership" },
        { status: 500, headers }
      )
    }

    const { id: _, ...dataToUpdate } = updateData
    
    if (dataToUpdate.category && typeof dataToUpdate.category === 'object') {
      dataToUpdate.category = dataToUpdate.category.id
    }
    
    console.log("Final update data:", JSON.stringify(dataToUpdate, null, 2))

    const updatedProduct = await payload.update({
      collection: "products",
      id,
      data: dataToUpdate,
      overrideAccess: true,
    })

    console.log("Product updated successfully:", updatedProduct.id)

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
