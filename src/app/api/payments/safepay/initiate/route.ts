import { type NextRequest, NextResponse } from "next/server"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { createSafepayCheckout, isSafepayConfigured } from "@/lib/safepay"

// Helper for CORS
const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  try {
    console.log("💳 Safepay Initiate - Request received")

    // 1. Check Configuration
    if (!isSafepayConfigured()) {
      return NextResponse.json(
        { error: "Safepay service is not configured" },
        { status: 503, headers: corsHeaders(request) }
      )
    }

    // 2. Parse & Validate Body
    const body = await request.json()
    const { amount, currency = "PKR", orderId } = body

    if (!amount || !orderId) {
      return NextResponse.json(
        { error: "Missing required fields: amount and orderId are required" },
        { status: 400, headers: corsHeaders(request) }
      )
    }

    // 3. Prepare Origin for Callbacks
    const origin = request.nextUrl.origin

    // 4. Create Checkout Session
    const { checkoutUrl, tracker } = await createSafepayCheckout({
      amount,
      currency,
      orderId,
      origin,
    })

    console.log(`✅ Safepay Checkout created: ${tracker}`)

    return NextResponse.json(
      { 
        success: true,
        checkoutUrl, 
        tracker 
      },
      { headers: corsHeaders(request) }
    )

  } catch (error) {
    console.error("❌ Safepay initiate error:", error)
    return NextResponse.json(
      { 
        error: "Failed to initialize Safepay session",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers: corsHeaders(request) }
    )
  }
}