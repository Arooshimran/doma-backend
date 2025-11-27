import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { generateOrderNumber } from "@/lib/utils"
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
    const body = await request.json()

    if (!body?.customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400, headers },
      )
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Order must include at least one item" },
        { status: 400, headers },
      )
    }

    if (!body.shippingAddress) {
      return NextResponse.json(
        { error: "shippingAddress is required" },
        { status: 400, headers },
      )
    }

    const orderNumber = generateOrderNumber()
    const order = await payload.create({
      collection: "orders",
      overrideAccess: true,
      data: {
        orderNumber,
        customer: body.customerId,
        orderStatus: body.orderStatus ?? "pending",
        paymentStatus: body.paymentStatus ?? "pending",
        paymentMethod: body.paymentMethod,
        paymentId: body.paymentId,
        items: body.items,
        shippingAddress: body.shippingAddress,
        billingAddress: body.billingAddress,
        tax: body.tax ?? body.totals?.tax ?? 0,
        shippingCost: body.shippingCost ?? body.totals?.shipping ?? 0,
        subtotal: body.subtotal ?? body.totals?.subtotal,
        total: body.total ?? body.totals?.total,
      },
    })

    return NextResponse.json({ success: true, order }, { status: 201, headers })
  } catch (error) {
    console.error("Error creating order:", error)
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500, headers },
    )
  }
}

