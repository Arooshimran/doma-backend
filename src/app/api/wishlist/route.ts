import { NextResponse, type NextRequest } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { getRequesterFromHeader } from "@/lib/cart-service"

const ensureCustomerRequester = (request: NextRequest) => {
  const requester = getRequesterFromHeader(request)
  if (!requester || requester.collection !== COLLECTION_SLUGS.CUSTOMERS || !requester.id) {
    return null
  }
  return requester
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeadersFromRequest(request),
  })
}

export async function GET(request: NextRequest) {
  const headers = buildCorsHeadersFromRequest(request)

  try {
    const requester = ensureCustomerRequester(request)
    if (!requester) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
    }

    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: COLLECTION_SLUGS.WISHLISTS,
      where: {
        customer: {
          equals: requester.id,
        },
      },
      limit: 1,
      depth: 2,
      overrideAccess: true,
    })

    return NextResponse.json(
      {
        wishlist:
          result.docs[0] ??
          {
            customer: requester.id,
            products: [],
          },
      },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Failed to load wishlist", error)
    return NextResponse.json(
      { error: "Failed to load wishlist" },
      { status: 500, headers },
    )
  }
}



