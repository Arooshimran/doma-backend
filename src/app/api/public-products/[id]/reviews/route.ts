import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  })

type RouteParams = {
  id: string
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const headers = corsHeaders(request)

  try {
    const { id: productId } = await params

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400, headers },
      )
    }

    const payload = await getPayloadClient()
    const url = new URL(request.url)
    const page = Number.parseInt(url.searchParams.get("page") || "1")
    const limit = Number.parseInt(url.searchParams.get("limit") || "10")
    const sort = url.searchParams.get("sort") || "-createdAt"

    // Verify product exists
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

    // Get all reviews for this product
    const reviews = await payload.find({
      collection: COLLECTION_SLUGS.REVIEWS,
      where: {
        product: { equals: productId },
      },
      page,
      limit,
      sort,
      depth: 2,
      overrideAccess: true,
    })

    // Format response to exclude sensitive data
    const publicReviews = reviews.docs.map((review: any) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      description: review.description,
      verifiedPurchase: review.verifiedPurchase,
      helpfulCount: review.helpfulCount || 0,
      createdAt: review.createdAt,
      customer: review.customer
        ? {
            id:
              typeof review.customer === "object" && "id" in review.customer
                ? review.customer.id
                : review.customer,
            Name:
              typeof review.customer === "object" && "Name" in review.customer
                ? review.customer.Name
                : null,
          }
        : null,
    }))

    return NextResponse.json(
      {
        success: true,
        reviews: publicReviews,
        pagination: {
          page: reviews.page,
          limit: reviews.limit,
          totalPages: reviews.totalPages,
          totalDocs: reviews.totalDocs,
          hasNextPage: reviews.hasNextPage,
          hasPrevPage: reviews.hasPrevPage,
        },
      },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Error fetching product reviews:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch reviews",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers },
    )
  }
}

