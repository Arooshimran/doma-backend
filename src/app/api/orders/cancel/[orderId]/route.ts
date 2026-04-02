import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  })

// Helper to decode the JWT from Flutter
const getRequesterFromHeader = (request: NextRequest) => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(" ")
  if (scheme !== "JWT" || !token) return null
  try {
    const base64Payload = token.split(".")[1]
    const decoded = Buffer.from(base64Payload, "base64").toString("utf-8")
    return JSON.parse(decoded)
  } catch { return null }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const headers = corsHeaders(request)
  const { orderId } = await params
  const requester = getRequesterFromHeader(request)

  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }

  const payload = await getPayloadClient()

  try {
    // 1. Fetch the Order
    const order = await payload.findByID({
      collection: COLLECTION_SLUGS.ORDERS,
      id: orderId,
      depth: 0, // We only need IDs for stock restoration
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404, headers })
    }

    // 2. Security: Only the Customer who placed it (or Admin) can cancel
    const isOwner = requester.id === order.customer
    const isAdmin = requester.collection === COLLECTION_SLUGS.USERS

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers })
    }

    // 3. Logic: Check if cancellation is allowed
    // Vendors shouldn't see 'canceled' orders in their 'To Ship' list
    if (['shipped', 'delivered', 'canceled'].includes(order.orderStatus)) {
      return NextResponse.json(
        { error: `Cannot cancel an order that is ${order.orderStatus}` },
        { status: 400, headers }
      )
    }

    // 4. Update Order Status
    await payload.update({
      collection: COLLECTION_SLUGS.ORDERS,
      id: orderId,
      data: { orderStatus: 'canceled' },
      overrideAccess: true,
    })

    // 5. RESTORE STOCK (Very important for DOMA inventory)
// 5. RESTORE STOCK (Safe Version)
if (Array.isArray(order.items)) {
    for (const item of order.items) {
      const productId = typeof item.product === 'object' ? item.product.id : item.product
      
      try {
        const product = await payload.findByID({
          collection: COLLECTION_SLUGS.PRODUCTS,
          id: productId,
        })
  
        // Only update if the product actually exists!
        if (product) {
          await payload.update({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            data: {
              quantity: (Number(product.quantity) || 0) + (Number(item.quantity) || 0),
            },
            overrideAccess: true,
          })
        }
      } catch (e) {
        console.warn(`Product ${productId} not found, skipping stock restoration.`);
        // We don't want to throw an error here, just keep going with other items
      }
    }
  }

    return NextResponse.json({ 
      success: true, 
      message: "Order canceled and stock restored." 
    }, { status: 200, headers })

  } catch (error) {
    console.error("Cancellation Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers })
  }
}