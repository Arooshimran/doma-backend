import { type NextRequest, NextResponse } from "next/server"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { 
  verifySafepayWebhookSignature, 
  extractOrderIdFromSafepayPayload, 
  isSafepaySuccessEvent, 
  isSafepayFailureEvent,
  clearPurchasedItemsFromCart,
} from "@/lib/safepay"
import { getPayloadClient } from "@/lib/payload-client"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const signature = request.headers.get("x-sig") || ""

    const isValid = verifySafepayWebhookSignature({ data: body, signature })
    
    if (!isValid) {
      console.error("Invalid Safepay webhook signature")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orderId = extractOrderIdFromSafepayPayload(body)
    const eventType = body.event

    if (!orderId) {
      return NextResponse.json({ error: "No order ID found" }, { status: 400 })
    }

    const payload = await getPayloadClient()

    if (isSafepaySuccessEvent(eventType)) {
      console.log(`Webhook: payment success for order ${orderId}`)
      
      const order = await payload.update({
        collection: "orders",
        id: orderId,
        data: {
          paymentStatus: "paid",
          orderStatus: "processing",
        },
        overrideAccess: true,
      })

      await clearPurchasedItemsFromCart({ payload, order })

    } else if (isSafepayFailureEvent(eventType)) {
      console.log(`Webhook: payment failed for order ${orderId}`)
      
      await payload.update({
        collection: "orders",
        id: orderId,
        data: {
          paymentStatus: "failed",
          orderStatus: "pending",
        },
        overrideAccess: true,
      })
    } else {
      console.log(`Webhook: unhandled event "${eventType}" for order ${orderId}`)
    }

    return NextResponse.json({ received: true }, { status: 200 })

  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}