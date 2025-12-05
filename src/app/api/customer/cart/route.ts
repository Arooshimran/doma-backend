import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { findCartByUserId } from "@/lib/cart-service"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  })

// Helper: extract customer ID from JWT token
const getCustomerIdFromToken = async (request: NextRequest): Promise<string | null> => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("JWT ")) return null
  const token = authHeader.substring(4)
  try {
    const base64Payload = token.split('.')[1]
    const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
    const decoded = JSON.parse(decodedPayload)
    if (decoded.collection !== 'customers') return null
    return decoded.id
  } catch {
    return null
  }
}

// OPTIONS handler
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// GET - Retrieve customer's cart
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)

  try {
    const customerId = await getCustomerIdFromToken(request)
    if (!customerId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }

    const payload = await getPayloadClient()
    const cart = await findCartByUserId(payload, customerId, 2)

    if (!cart) {
      return NextResponse.json(
        { success: true, cart: null, message: "Cart is empty" },
        { status: 200, headers },
      )
    }

    return NextResponse.json(
      { success: true, cart },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Error retrieving cart:", error)
    return NextResponse.json(
      { error: "Failed to retrieve cart" },
      { status: 500, headers },
    )
  }
}

