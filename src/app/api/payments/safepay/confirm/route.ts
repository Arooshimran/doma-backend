import { type NextRequest, NextResponse } from "next/server"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import {
  verifySafepayRedirectSignature,
  getSafepayConfig,
  clearPurchasedItemsFromCart,
} from "@/lib/safepay"
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
  const tracker = searchParams.get("tracker") ?? searchParams.get("beacon") ?? ""
  const sig = searchParams.get("sig") ?? ""
  const orderId = searchParams.get("order_id") ?? searchParams.get("orderId") ?? ""

  const { frontendSuccessUrl, frontendCancelUrl } = getSafepayConfig()
  const successUrl = frontendSuccessUrl ?? "doma://payment/success"
  const cancelUrl = frontendCancelUrl ?? "doma://payment/cancel"

  if (!orderId || !tracker || !sig) {
    console.error("❌ Safepay confirm: missing params", { orderId, tracker, sig })
    return NextResponse.redirect(`${cancelUrl}?reason=missing_params`)
  }

  const isValid = verifySafepayRedirectSignature({ tracker, sig })
  if (!isValid) {
    console.error("❌ Safepay confirm: invalid signature")
    return NextResponse.redirect(`${cancelUrl}?reason=invalid_signature`)
  }

  try {
    const payload = await getPayloadClient()

    const order = await payload.update({
      collection: "orders",
      id: orderId,
      data: {
        paymentStatus: "paid",
        orderStatus: "processing",
        safepayTracker: tracker,
      },
      overrideAccess: true,
    })

    console.log(`✅ Safepay confirm: order ${orderId} marked as paid`)
    await clearPurchasedItemsFromCart({ payload, order })

    return NextResponse.redirect(`${successUrl}?orderId=${orderId}`)
  } catch (error) {
    console.error("❌ Safepay confirm error:", error)
    return NextResponse.redirect(`${cancelUrl}?reason=server_error`)
  }
}