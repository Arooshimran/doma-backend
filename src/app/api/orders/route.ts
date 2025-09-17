import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { generateOrderNumber } from "@/lib/utils"

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayloadClient()
    const orderData = await request.json()

    // Generate unique order number
    const orderNumber = generateOrderNumber()

    // Create order in Payload
    const order = await payload.create({
      collection: "orders",
      data: {
        orderNumber,
        customer: orderData.customerId,
        items: orderData.items,
        shippingAddress: orderData.shippingAddress,
        billingAddress: orderData.billingAddress,
        totals: orderData.totals,
        paymentMethod: orderData.paymentMethod,
        status: "pending",
        paymentStatus: "pending",
      },
    })

    return NextResponse.json({ success: true, order })
  } catch (error) {
    console.error("Error creating order:", error)
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
  }
}

