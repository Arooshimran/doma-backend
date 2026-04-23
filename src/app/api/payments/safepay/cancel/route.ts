import { type NextRequest, NextResponse } from "next/server"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { getSafepayConfig } from "@/lib/safepay"
import { getPayloadClient } from "@/lib/payload-client"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const orderId = searchParams.get("order_id") ?? searchParams.get("orderId") ?? ""

  const { frontendCancelUrl } = getSafepayConfig()
  const cancelUrl = frontendCancelUrl ?? "doma://payment/cancel"

  if (orderId) {
    try {
      const payload = await getPayloadClient()
      await payload.update({
        collection: "orders",
        id: orderId,
        data: { paymentStatus: "failed" },
        overrideAccess: true,
      })
      console.log(`⚠️ Safepay cancel: order ${orderId} marked as failed`)
    } catch (error) {
      console.error("❌ Safepay cancel update error:", error)
    }
  }

  return NextResponse.redirect(`${cancelUrl}?reason=cancelled`)
}