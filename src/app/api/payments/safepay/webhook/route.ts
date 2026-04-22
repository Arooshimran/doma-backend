import { type NextRequest, NextResponse } from "next/server"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { 
  verifySafepayWebhookSignature, 
  extractOrderIdFromSafepayPayload, 
  isSafepaySuccessEvent, 
  isSafepayFailureEvent 
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

    // 1. Verify the signature to ensure it's really from Safepay
    const isValid = verifySafepayWebhookSignature({ data: body, signature })
    
    if (!isValid) {
      console.error("❌ Invalid Safepay webhook signature")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Identify the Order
    const orderId = extractOrderIdFromSafepayPayload(body)
    const eventType = body.event

    if (!orderId) {
      return NextResponse.json({ error: "No order ID found" }, { status: 400 })
    }

    const payload = await getPayloadClient()

    // 3. Handle the Event
    if (isSafepaySuccessEvent(eventType)) {
      console.log(`✅ Payment success for order: ${orderId}`)
      await payload.update({
        collection: 'orders', // Or whatever your collection is named
        id: orderId,
        data: { status: 'paid' },
      })
      // Optional: Add logic here to clear cart using clearPurchasedItemsFromCart
    } else if (isSafepayFailureEvent(eventType)) {
      console.log(`❌ Payment failed for order: ${orderId}`)
      await payload.update({
        collection: 'orders',
        id: orderId,
        data: { status: 'failed' },
      })
    }

    return NextResponse.json({ received: true }, { status: 200 })

  } catch (error) {
    console.error("❌ Webhook error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}