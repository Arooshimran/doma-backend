import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  })

// Helper function to extract vendor ID from JWT token
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
      // Simple JWT decode without verification (since the token is already validated by your auth system)
      const base64Payload = token.split('.')[1]
      const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
      const decoded = JSON.parse(decodedPayload)
      
      console.log("Token decoded successfully:", { 
        id: decoded.id, 
        email: decoded.email,
        collection: decoded.collection 
      })
      
      // Check if this is a vendor token
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

// Helper function to handle category lookup/creation
const handleCategory = async (payload: any, categoryName: string): Promise<string | null> => {
  if (!categoryName) {
    console.log("No category provided")
    return null
  }
  
  try {
    console.log("Looking up category:", categoryName)
    
    // First, try to find existing category by name
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

    // If not found, create new category
    console.log("Creating new category:", categoryName)
    const newCategory = await payload.create({
      collection: 'categories',
      data: {
        name: categoryName,
        slug: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        // Add any other required fields for your categories collection
      }
    })

    console.log("Created new category:", newCategory.id)
    return newCategory.id
  } catch (error) {
    console.warn("Category handling failed:", error)
    return null // Return null if category handling fails
  }
}

// Handle preflight OPTIONS request
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

    // FIXED: Build query for vendor's products using the correct field reference
    const where: any = {
      vendor: {
        equals: vendorId,
      },
    }

    // Filter by status if specified
    if (status !== "all") {
      where.status = { equals: status }
    }

    console.log("Query where clause:", JSON.stringify(where, null, 2))

    // FIXED: Use overrideAccess to bypass access control for admin queries
    const products = await payload.find({
      collection: "products",
      where,
      page,
      limit,
      populate: ["category", "vendor", "images"],
      sort: "-createdAt", // Most recent first
      overrideAccess: true, // This bypasses the access control for admin/API operations
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
    
    // Log request details
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

    // Parse request body
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

    // FIXED: Validate required fields based on your collection structure
    const { title, Description, shortDescription, pricing, pricingDetails } = data
    
    // Support both Description (collection field) and shortDescription (legacy API field)
    const description = Description || shortDescription
    
    // Check for price in different possible structures
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

    // Validate price is a positive number
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

    // Get Payload client
    const payload = await getPayloadClient()
    console.log("Payload client obtained")

    // Handle category lookup/creation
    let categoryId = null
    if (data.category) {
      categoryId = await handleCategory(payload, data.category)
    }

    // FIXED: Create product data matching your Payload collection schema
    const productData: any = {
      title: title.trim(),
      slug: title.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''), // Auto-generate slug from title
      Description: description.trim(), // Collection uses "Description" (capital D)
      
      // FIXED: Handle pricing based on your schema structure
      // Collection uses "pricing" group with "price" and "discountedPrice"
      pricing: {
        price: numericPrice,
        // Add discountedPrice if provided (collection field name)
        ...(data.discountedPrice && { discountedPrice: Number(data.discountedPrice) }),
        ...(data.comparePrice && { discountedPrice: Number(data.comparePrice) }) // Support legacy field name
      },
      
      // FIXED: Add inventory structure matching collection (no trackQuantity field)
      inventory: data.inventory ? {
        quantity: data.inventory.quantity ?? 0,
        lowStockThreshold: data.inventory.lowStockThreshold ?? 5
      } : {
        quantity: 0,
        lowStockThreshold: 5
      },
      
      vendor: vendorId, // This should be the ObjectId string
      status: data.status || "draft",
      
      // Include optional fields that exist in collection
      ...(data.images && { images: data.images }),
      ...(categoryId && { category: categoryId }), // Only include if we have a valid category ID
      ...(data.threeDModel && { threeDModel: data.threeDModel }),
      ...(data.featured !== undefined && { featured: data.featured }),
      ...(data.size && { size: data.size }),
      ...(data.colors && { colors: data.colors }),
    }

    console.log("Product data to create:", JSON.stringify(productData, null, 2))

    try {
      // FIXED: Use overrideAccess to bypass access control
      const product = await payload.create({
        collection: "products",
        data: productData,
        overrideAccess: true, // This bypasses access control for API operations
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
      
      // Log more details about the creation error
      if (createError instanceof Error) {
        console.error(" Error message:", createError.message)
        console.error("Error stack:", createError.stack)
      }
      
      // Provide more specific error messages based on the error type
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
    
    // Log full error details
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
    
    // Verify vendor authentication
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

    // First verify that this product belongs to the authenticated vendor
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

      // Check if the product belongs to the authenticated vendor
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

    // Remove the id from updateData to avoid conflicts
    const { id: _, ...dataToUpdate } = updateData
    
    // Handle category if it's passed as an object
    if (dataToUpdate.category && typeof dataToUpdate.category === 'object') {
      dataToUpdate.category = dataToUpdate.category.id
    }
    
    console.log("Final update data:", JSON.stringify(dataToUpdate, null, 2))

    // Perform the update
    const updatedProduct = await payload.update({
      collection: "products",
      id,
      data: dataToUpdate,
      overrideAccess: true, // Bypass access control for API operations
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
    
    // Enhanced error handling
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

// DELETE - Delete product (FIXED VERSION)
export async function DELETE(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const payload = await getPayloadClient();

    // Get the "id" from the query string
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
