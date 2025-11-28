import { NextResponse, type NextRequest } from "next/server"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { getPayloadClient } from "@/lib/payload-client"
import { getRequesterFromHeader } from "@/lib/cart-service"

const normalizeProductIds = (products: unknown): string[] => {
  if (!Array.isArray(products)) {
    return []
  }

  return products
    .map((product) => {
      if (typeof product === "string") return product
      if (product && typeof product === "object" && "id" in product) {
        return String((product as { id?: string }).id)
      }
      return null
    })
    .filter((value): value is string => typeof value === "string" && value.length > 0)
}

const ensureCustomerRequester = (request: NextRequest) => {
  const requester = getRequesterFromHeader(request)
  if (!requester || requester.collection !== COLLECTION_SLUGS.CUSTOMERS || !requester.id) {
    return null
  }
  return requester
}

const findWishlistByCustomer = async (customerId: string) => {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: COLLECTION_SLUGS.WISHLISTS,
    where: {
      customer: {
        equals: customerId,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeadersFromRequest(request),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { productId: string } },
) {
  const headers = buildCorsHeadersFromRequest(request)

  try {
    const requester = ensureCustomerRequester(request)
    if (!requester) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
    }

    const productId = params.productId
    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400, headers })
    }

    const payload = await getPayloadClient()

    const product = await payload
      .findByID({
        collection: COLLECTION_SLUGS.PRODUCTS,
        id: productId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404, headers })
    }

    const wishlist = await findWishlistByCustomer(requester.id)
    const existingIds = new Set(normalizeProductIds(wishlist?.products))

    let action: "added" | "removed" = "added"
    if (existingIds.has(productId)) {
      existingIds.delete(productId)
      action = "removed"
    } else {
      existingIds.add(productId)
    }

    let nextWishlist
    if (wishlist) {
      nextWishlist = await payload.update({
        collection: COLLECTION_SLUGS.WISHLISTS,
        id: wishlist.id,
        data: {
          products: [...existingIds],
        },
        depth: 2,
        overrideAccess: true,
      })
    } else {
      nextWishlist = await payload.create({
        collection: COLLECTION_SLUGS.WISHLISTS,
        data: {
          customer: requester.id,
          products: [...existingIds],
        },
        depth: 2,
        overrideAccess: true,
      })
    }

    return NextResponse.json(
      {
        success: true,
        action,
        wishlist: nextWishlist,
      },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Failed to toggle wishlist item", error)
    return NextResponse.json(
      { error: "Failed to update wishlist" },
      { status: 500, headers },
    )
  }
}



