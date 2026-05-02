import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// GET - Fetch all categories
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    
    const payload = await getPayloadClient()
    
    const categories = await payload.find({
      collection: "categories",
      where: {
        // isActive: { equals: true },
      },
      sort: "name", 
      limit: 100, 
      overrideAccess: true, 
    })

    return NextResponse.json({
      success: true,
      categories: categories.docs.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        isActive: cat.isActive,
        sortOrder: cat.sortOrder,
      })),
    }, { headers })
    
  } catch (error) {
    console.error("Error fetching categories:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to fetch categories",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { 
      status: 500,
      headers
    })
  }
}

// POST - Create new category (optional, for admin use)
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    
    const payload = await getPayloadClient()
    const data = await request.json()
    
    const { name, isActive = true, sortOrder = 0 } = data
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json({
        success: false,
        error: "Category name is required"
      }, {
        status: 400,
        headers
      })
    }

    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

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
        headers
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
      headers
    })
    
  } catch (error) {
    console.error("Error creating category:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to create category",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { 
      status: 500,
      headers
    })
  }
}