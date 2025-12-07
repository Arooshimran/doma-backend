import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { getRequesterFromHeader } from "@/lib/cart-service"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  try {
    const payload = await getPayloadClient()
    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers },
      )
    }

    const requester = getRequesterFromHeader(request)
    if (!requester || requester.collection !== COLLECTION_SLUGS.CUSTOMERS) {
      return NextResponse.json(
        { error: "Unauthorized. Only authenticated customers can create reviews." },
        { status: 401, headers },
      )
    }

    const { productId, rating, title, description } = body

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400, headers },
      )
    }

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating must be a number between 1 and 5" },
        { status: 400, headers },
      )
    }

    if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
      return NextResponse.json(
        { error: "title must be a non-empty string if provided" },
        { status: 400, headers },
      )
    }

    if (!description || typeof description !== "string" || description.trim().length === 0) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400, headers },
      )
    }

    const existingReview = await payload.find({
      collection: COLLECTION_SLUGS.REVIEWS,
      where: {
        and: [
          { product: { equals: productId } },
          { customer: { equals: requester.id } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    if (existingReview.docs.length > 0) {
      return NextResponse.json(
        { error: "You have already reviewed this product" },
        { status: 409, headers },
      )
    }

    const product = await payload
      .findByID({
        collection: COLLECTION_SLUGS.PRODUCTS,
        id: productId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404, headers },
      )
    }

    const reviewData: any = {
      product: productId,
      customer: requester.id,
      rating: Math.round(rating),
      description: description.trim(),
    }

    if (title && typeof title === "string" && title.trim().length > 0) {
      reviewData.title = title.trim()
    }

    const review = await payload.create({
      collection: COLLECTION_SLUGS.REVIEWS,
      data: reviewData,
      depth: 2,
      overrideAccess: true,
    })

    return NextResponse.json(
      { success: true, review },
      { status: 201, headers },
    )
  } catch (error) {
    console.error("Error creating review:", error)
    
    if (error instanceof Error) {
      if (error.message.includes("You can only review products") || 
          error.message.includes("Unable to verify purchase")) {
        return NextResponse.json(
          {
            error: error.message,
          },
          { status: 403, headers },
        )
      }
      
      if (error.message.includes("required")) {
        return NextResponse.json(
          {
            error: "Validation error",
            details: error.message,
          },
          { status: 400, headers },
        )
      }
      
      return NextResponse.json(
        {
          error: "Failed to create review",
          details: error.message,
        },
        { status: 500, headers },
      )
    }
    
    return NextResponse.json(
      {
        error: "Failed to create review",
        details: "Unknown error",
      },
      { status: 500, headers },
    )
  }
}

