import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import {
  findCartByUserId,
  getCartCorsHeaders,
  getRequesterFromHeader,
  resolveCartAccess,
} from "@/lib/cart-service"

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCartCorsHeaders(),
  })
}

export async function POST(request: NextRequest) {
  const headers = getCartCorsHeaders()

  try {
    const payload = await getPayloadClient()
    const body = await request.json().catch(() => ({}))
    const requester = getRequesterFromHeader(request)
    const access = resolveCartAccess(requester, body.userId)

    if (!access.ok) {
      return NextResponse.json(
        { error: access.message },
        { status: access.status, headers },
      )
    }

    const cart = await findCartByUserId(payload, access.targetUserId, 0)
    if (!cart) {
      return NextResponse.json(
        { success: true, cart: null, message: "Cart already empty" },
        { status: 200, headers },
      )
    }

    const clearedCart = await payload.update({
      collection: COLLECTION_SLUGS.CARTS,
      id: cart.id,
      data: {
        items: [],
      },
      depth: 2,
      overrideAccess: true,
    })

    return NextResponse.json(
      { success: true, cart: clearedCart },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Error clearing cart:", error)
    return NextResponse.json(
      { error: "Failed to clear cart" },
      { status: 500, headers },
    )
  }
}

