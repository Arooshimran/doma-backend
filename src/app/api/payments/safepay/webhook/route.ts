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

    // 1. Verify signature — ensures request genuinely came from Safepay
    const isValid = verifySafepayWebhookSignature({ data: body, signature })
    
    if (!isValid) {
      console.error("❌ Invalid Safepay webhook signature")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Extract order ID and event type
    const orderId = extractOrderIdFromSafepayPayload(body)
    const eventType = body.event

    if (!orderId) {
      return NextResponse.json({ error: "No order ID found" }, { status: 400 })
    }

    const payload = await getPayloadClient()

    // 3. Handle success — FIXED: correct field names paymentStatus & orderStatus
    if (isSafepaySuccessEvent(eventType)) {
      console.log(`✅ Webhook: payment success for order ${orderId}`)
      
      const order = await payload.update({
        collection: "orders",
        id: orderId,
        data: {
          paymentStatus: "paid",
          orderStatus: "processing",
        },
        overrideAccess: true,
      })

      // Also clear purchased items from cart (safety net in case confirm route missed it)
      await clearPurchasedItemsFromCart({ payload, order })

    // 4. Handle failure — FIXED: correct field name paymentStatus
    } else if (isSafepayFailureEvent(eventType)) {
      console.log(`❌ Webhook: payment failed for order ${orderId}`)
      
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
      console.log(`ℹ️ Webhook: unhandled event "${eventType}" for order ${orderId}`)
    }

    // Always 200 — if we return an error, Safepay will keep retrying
    return NextResponse.json({ received: true }, { status: 200 })

  } catch (error) {
    console.error("❌ Webhook error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}