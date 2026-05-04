import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  })

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

  const isAdmin = requester.collection === COLLECTION_SLUGS.USERS
  const isVendor = requester.collection === COLLECTION_SLUGS.VENDORS

  if (!isAdmin && !isVendor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers })
  }

  const payload = await getPayloadClient()

  try {
    const order = await payload.findByID({
      collection: COLLECTION_SLUGS.ORDERS,
      id: orderId,
      depth: 0,
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404, headers })
    }

    const body = await request.json()
    const { orderStatus } = body

    const validStatuses = ["pending", "paid", "processing", "shipped", "delivered", "canceled"]
    if (!validStatuses.includes(orderStatus)) {
      return NextResponse.json(
        { error: `Invalid status: ${orderStatus}` },
        { status: 400, headers }
      )
    }

    const updatedOrder = await payload.update({
      collection: COLLECTION_SLUGS.ORDERS,
      id: orderId,
      data: { orderStatus },
      overrideAccess: true,
    })

    return NextResponse.json(updatedOrder, { status: 200, headers })
  } catch (error) {
    console.error("Update Order Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers })
  }
}