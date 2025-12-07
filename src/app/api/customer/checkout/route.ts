import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { generateOrderNumber } from "@/lib/utils"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { findCartByUserId } from "@/lib/cart-service"
import { resolveRelationId } from "@/lib/cart-utils"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

// Helper: extract customer ID from JWT token
const getCustomerIdFromToken = async (request: NextRequest): Promise<string | null> => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("JWT ")) return null
  const token = authHeader.substring(4)
  try {
    const base64Payload = token.split('.')[1]
    const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
    const decoded = JSON.parse(decodedPayload)
    if (decoded.collection !== 'customers') return null
    return decoded.id
  } catch {
    return null
  }
}

// OPTIONS handler
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// POST - Process checkout and create order
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("POST /api/customer/checkout - Starting...")

    const customerId = await getCustomerIdFromToken(request)
    if (!customerId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }

    console.log("Customer authenticated:", customerId)

    const payload = await getPayloadClient()

    let body
    try {
      body = await request.json()
    } catch (jsonError) {
      console.error("Error parsing JSON body:", jsonError)
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers }
      )
    }

    // --------------------------
    // FIXED SHIPPING ADDRESS LOGIC
    // --------------------------
    let shippingAddress = body.shippingAddress || {}

    // Fetch customer if needed
    let customer: any = null
    try {
      customer = await payload.findByID({
        collection: COLLECTION_SLUGS.CUSTOMERS,
        id: customerId,
        overrideAccess: true,
      })
    } catch {
      customer = null
    }

    // Extract customer name safely
    const rawName =
      (customer?.name || customer?.Name || "").trim() || "Customer"

    const nameParts = rawName.split(/\s+/)
    const fallbackFirstName = nameParts[0] || "Customer"
    const fallbackLastName = nameParts.slice(1).join(" ") || ""

    // Extract default address if exists
    const defaultAddress = customer?.addresses?.find?.(
      (addr: any) => addr?.isDefault
    ) || {}

    // Build SAFE shipping address (never null)
    shippingAddress = {
      firstName:
        shippingAddress.firstName ||
        defaultAddress.firstName ||
        fallbackFirstName,

      lastName:
        shippingAddress.lastName ||
        defaultAddress.lastName ||
        fallbackLastName,

      street:
        shippingAddress.street ||
        defaultAddress.street ||
        "",

      city:
        shippingAddress.city ||
        defaultAddress.city ||
        "",

      state:
        shippingAddress.state ||
        defaultAddress.state ||
        "",

      country:
        shippingAddress.country ||
        defaultAddress.country ||
        "Pakistan",

      phone:
        shippingAddress.phone ||
        defaultAddress.phone ||
        customer?.phone ||
        "",
    }

    // Validation
    if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.country) {
      return NextResponse.json(
        { error: "Shipping address with street, city, and country is required" },
        { status: 400, headers }
      )
    }

    console.log("Final shipping address:", shippingAddress)

    // --------------------------
    // ITEMS PROCESSING (unchanged)
    // --------------------------
    const orderItems: any[] = []

    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      console.log("Processing items from request body:", body.items.length, "items")

      for (const item of body.items) {
        const productId =
          typeof item.product === "string" ? item.product : item.product?.id

        if (!productId) {
          console.warn("Item missing product ID, skipping")
          continue
        }

        const product = await payload
          .findByID({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            depth: 1,
            overrideAccess: true,
          })
          .catch(() => null)

        if (!product) {
          console.warn(`Product ${productId} not found, skipping`)
          continue
        }

        const availableStock = product?.inventory?.quantity ?? 0
        const requestedQty = item.quantity || 1

        if (availableStock < requestedQty) {
          return NextResponse.json(
            {
              error: `Insufficient stock for ${product.title || "product"}. Available: ${availableStock}, Requested: ${requestedQty}`,
            },
            { status: 400, headers }
          )
        }

        const unitPrice =
          item.unitPrice ||
          item.price ||
          product?.pricing?.discountedPrice ||
          product?.pricing?.price ||
          0

        const lineTotal = item.lineTotal || unitPrice * requestedQty

        orderItems.push({
          product: productId,
          productTitle: product.title || "",
          vendor: resolveRelationId(product.vendor) || null,
          quantity: requestedQty,
          price: unitPrice,
          total: lineTotal,
          status: "pending",
        })
      }
    } else {
      console.log("No items in request, falling back to cart")

      const cart = await findCartByUserId(payload, customerId, 2)

      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        return NextResponse.json(
          { error: "Cart is empty and no items provided" },
          { status: 400, headers }
        )
      }

      console.log("Cart found with", cart.items.length, "items")

      for (const cartItem of cart.items) {
        const productId = resolveRelationId(cartItem.product)
        if (!productId) continue

        const product = await payload
          .findByID({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            depth: 1,
            overrideAccess: true,
          })
          .catch(() => null)

        if (!product) continue

        const availableStock = product?.inventory?.quantity ?? 0
        const requestedQty = cartItem.quantity || 1

        if (availableStock < requestedQty) {
          return NextResponse.json(
            {
              error: `Insufficient stock for ${product.title || "product"}. Available: ${availableStock}, Requested: ${requestedQty}`,
            },
            { status: 400, headers }
          )
        }

        const unitPrice =
          cartItem.unitPrice ||
          product?.pricing?.discountedPrice ||
          product?.pricing?.price ||
          0

        const lineTotal = cartItem.lineTotal || unitPrice * requestedQty

        orderItems.push({
          product: productId,
          productTitle: product.title || "",
          vendor: resolveRelationId(product.vendor) || null,
          quantity: requestedQty,
          price: unitPrice,
          total: lineTotal,
          status: "pending",
        })
      }
    }

    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: "No valid items to order" },
        { status: 400, headers }
      )
    }

    const subtotal = orderItems.reduce((sum, item) => sum + (item.total || 0), 0)
    const tax = body.tax || 0
    const shippingCost = body.shippingCost || 0
    const total = subtotal + tax + shippingCost

    const orderNumber = generateOrderNumber()

    console.log("Creating order...")

    const order = await payload.create({
  collection: COLLECTION_SLUGS.ORDERS,
  data: {
    orderNumber,
    customer: customerId,
    orderStatus: "pending",
    paymentStatus: body.paymentStatus || "pending",
    paymentMethod: body.paymentMethod || "cod",
    paymentId: body.paymentId || null,
    items: orderItems,
    shippingAddress,
    billingAddress: body.billingAddress || {},   // <-- FIXED HERE
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    shippingCost: Number(shippingCost.toFixed(2)),
    total: Number(total.toFixed(2)),
  },
  depth: 2,
  overrideAccess: true,
})

    console.log("Order created:", order.id)

    // Cart cleanup
    try {
      const cart = await findCartByUserId(payload, customerId, 1)

      if (cart && body.items && Array.isArray(body.items)) {
        const orderedProductIds = new Set(
          orderItems.map((item) =>
            typeof item.product === "string" ? item.product : item.product?.id
          )
        )

        const remainingItems = (cart.items ?? []).filter((item) => {
          const itemProductId = resolveRelationId(item.product)
          return !orderedProductIds.has(itemProductId)
        })

        await payload.update({
          collection: COLLECTION_SLUGS.CARTS,
          id: cart.id,
          data: { items: remainingItems },
          overrideAccess: true,
        })
      } else if (cart) {
        await payload.update({
          collection: COLLECTION_SLUGS.CARTS,
          id: cart.id,
          data: { items: [] },
          overrideAccess: true,
        })
      }
    } catch (clearError) {
      console.error("Error updating cart:", clearError)
    }

    return NextResponse.json(
      {
        success: true,
        order,
        message: "Order created successfully",
      },
      { status: 201, headers }
    )
  } catch (error) {
    console.error("Error processing checkout:", error)

    return NextResponse.json(
      {
        error: "Failed to process checkout",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    )
  }
}
