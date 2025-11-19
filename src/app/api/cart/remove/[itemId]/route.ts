import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { resolveRelationId } from "@/lib/cart-utils"
import {
  findCartByUserId,
  getCartCorsHeaders,
  getRequesterFromHeader,
  resolveCartAccess,
} from "@/lib/cart-service"
import type { CartItemInput } from "@/types/cart"

const getItemIdentifier = (item: CartItemInput | null | undefined): string | null => {
  if (!item) return null
  if (typeof item.id === "string") return item.id
  if (typeof item.id === "number") return String(item.id)
  if (typeof item._id === "string") return item._id
  return resolveRelationId(item.id)
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCartCorsHeaders(),
  })
}

type RouteParams = {
  itemId: string
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const headers = getCartCorsHeaders()

  try {
    const { itemId } = await params
    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400, headers },
      )
    }

    const requester = getRequesterFromHeader(request)
    const url = new URL(request.url)
    const requestedUserId = url.searchParams.get("userId")

    const access = resolveCartAccess(requester, requestedUserId)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.message },
        { status: access.status, headers },
      )
    }

    const payload = await getPayloadClient()
    const cart = await findCartByUserId(payload, access.targetUserId, 0)

    if (!cart) {
      return NextResponse.json(
        { error: "Cart not found" },
        { status: 404, headers },
      )
    }

    const currentItems: CartItemInput[] = Array.isArray(cart.items)
      ? (cart.items as CartItemInput[])
      : []
    const filteredItems = currentItems.filter((item) => {
      const normalizedId = getItemIdentifier(item)
      return normalizedId !== itemId
    })

    if (filteredItems.length === currentItems.length) {
      return NextResponse.json(
        { error: "Cart item not found" },
        { status: 404, headers },
      )
    }

    const updatedCart = await payload.update({
      collection: COLLECTION_SLUGS.CARTS,
      id: cart.id,
      data: {
        items: filteredItems,
      },
      depth: 2,
      overrideAccess: true,
    })

    return NextResponse.json(
      { success: true, cart: updatedCart },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Error removing cart item:", error)
    return NextResponse.json(
      { error: "Failed to remove item from cart" },
      { status: 500, headers },
    )
  }
}

