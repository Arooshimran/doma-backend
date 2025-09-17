// app/api/vendor/categories/route.ts
import { NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// GET - Fetch all categories
export async function GET() {
  try {
    console.log("🚀 GET /api/vendor/categories - Starting...")
    
    const payload = await getPayloadClient()
    
    const categories = await payload.find({
      collection: "categories",
      where: {
        // Only get active categories, or remove this filter if you want all
        // isActive: { equals: true },
      },
      sort: "name", // Sort alphabetically
      limit: 100, // Adjust as needed
      overrideAccess: true, // Bypass access control
    })

    console.log("✅ Categories fetched successfully:", categories.docs.length)

    return NextResponse.json({
      success: true,
      categories: categories.docs.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        isActive: cat.isActive,
        sortOrder: cat.sortOrder,
      })),
    }, { headers: getCorsHeaders() })
    
  } catch (error) {
    console.error("💥 Error fetching categories:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to fetch categories",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { 
      status: 500, 
      headers: getCorsHeaders() 
    })
  }
}

// POST - Create new category (optional, for admin use)
export async function POST(request: Request) {
  try {
    console.log("🚀 POST /api/vendor/categories - Creating new category...")
    
    const payload = await getPayloadClient()
    const data = await request.json()
    
    const { name, isActive = true, sortOrder = 0 } = data
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json({
        success: false,
        error: "Category name is required"
      }, { 
        status: 400, 
        headers: getCorsHeaders() 
      })
    }

    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Check if category with this name already exists
    const existingCategories = await payload.find({
      collection: "categories",
      where: {
        name: { equals: name }
      },
      limit: 1
    })

    if (existingCategories.docs.length > 0) {
      return NextResponse.json({
        success: false,
        error: "Category with this name already exists"
      }, { 
        status: 400, 
        headers: getCorsHeaders() 
      })
    }

    const newCategory = await payload.create({
      collection: "categories",
      data: {
        name: name.trim(),
        slug,
        isActive,
        sortOrder: Number(sortOrder),
      },
      overrideAccess: true,
    })

    console.log("✅ Category created successfully:", newCategory.id)

    return NextResponse.json({
      success: true,
      message: "Category created successfully",
      category: {
        id: newCategory.id,
        name: newCategory.name,
        slug: newCategory.slug,
        isActive: newCategory.isActive,
        sortOrder: newCategory.sortOrder,
      }
    }, { 
      status: 201,
      headers: getCorsHeaders() 
    })
    
  } catch (error) {
    console.error("💥 Error creating category:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to create category",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { 
      status: 500, 
      headers: getCorsHeaders() 
    })
  }
}