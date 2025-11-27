import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import {
  calculateLineTotal,
  getAvailableStock,
  getUnitPriceFromProduct,
  resolveRelationId,
  toQuantity,
} from "@/lib/cart-utils"
import {
  findCartByUserId,
  getCartCorsHeaders,
  getRequesterFromHeader,
  resolveCartAccess,
} from "@/lib/cart-service"
import type { CartItemInput } from "@/types/cart"

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCartCorsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  const headers = getCartCorsHeaders(request)

  try {
    const payload = await getPayloadClient()
    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers },
      )
    }

    const { userId: requestedUserId, productId, quantity } = body

    const requester = getRequesterFromHeader(request)
    const access = resolveCartAccess(requester, requestedUserId)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.message },
        { status: access.status, headers },
      )
    }

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400, headers },
      )
    }

    const qtyToAdd = Math.max(1, toQuantity(quantity, 1))

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

    const availableStock = getAvailableStock(product)
    if (availableStock <= 0) {
      return NextResponse.json(
        { error: "Product is out of stock" },
        { status: 409, headers },
      )
    }

    const cart = await findCartByUserId(payload, access.targetUserId, 0)
    const unitPrice = getUnitPriceFromProduct(product)

    const existingItems: CartItemInput[] = Array.isArray(cart?.items)
      ? [...(cart!.items as CartItemInput[])]
      : []
    const itemIndex = existingItems.findIndex(
      (item) => resolveRelationId(item.product) === productId,
    )

    if (itemIndex >= 0) {
      const currentQuantity = toQuantity(existingItems[itemIndex].quantity, 1)
      const newQuantity = currentQuantity + qtyToAdd
      if (newQuantity > availableStock) {
        return NextResponse.json(
          {
            error: `Only ${availableStock} unit(s) left`,
          },
          { status: 409, headers },
        )
      }

      existingItems[itemIndex] = {
        ...existingItems[itemIndex],
        quantity: newQuantity,
        unitPrice,
        lineTotal: calculateLineTotal(unitPrice, newQuantity),
      }
    } else {
      if (qtyToAdd > availableStock) {
        return NextResponse.json(
          {
            error: `Only ${availableStock} unit(s) left`,
          },
          { status: 409, headers },
        )
      }

      existingItems.push({
        product: productId,
        quantity: qtyToAdd,
        unitPrice,
        lineTotal: calculateLineTotal(unitPrice, qtyToAdd),
      })
    }

    let nextCart
    if (cart) {
      nextCart = await payload.update({
        collection: COLLECTION_SLUGS.CARTS,
        id: cart.id,
        data: {
          items: existingItems,
        },
        depth: 2,
        overrideAccess: true,
      })
    } else {
      nextCart = await payload.create({
        collection: COLLECTION_SLUGS.CARTS,
        data: {
          userId: access.targetUserId,
          items: existingItems,
        },
        depth: 2,
        overrideAccess: true,
      })
    }

    return NextResponse.json(
      { success: true, cart: nextCart },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Error adding cart item:", error)
    return NextResponse.json(
      { error: "Failed to add item to cart" },
      { status: 500, headers },
    )
  }
}

