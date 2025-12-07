import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { COLLECTION_SLUGS } from "@/collections/shared-types"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// POST - Change customer password
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  try {
    console.log("POST /api/customer/change-password - Starting...")
    
    const customerId = await getCustomerIdFromToken(request)
    if (!customerId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }
    
    console.log("Customer authenticated:", customerId)
    
    let body
    try {
      body = await request.json()
    } catch (jsonError) {
      console.error("Error parsing JSON body:", jsonError)
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers }
      )
    }
    
    const { currentPassword, newPassword } = body
    
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400, headers }
      )
    }
    
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long" },
        { status: 400, headers }
      )
    }
    
    // Check if new password is different from current password
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from current password" },
        { status: 400, headers }
      )
    }
    
    const payload = await getPayloadClient()
    
    const customer = await payload.findByID({
      collection: COLLECTION_SLUGS.CUSTOMERS,
      id: customerId,
      overrideAccess: true,
    })
    
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers }
      )
    }
    
    try {
      await payload.login({
        collection: COLLECTION_SLUGS.CUSTOMERS,
        data: {
          email: customer.email,
          password: currentPassword,
        },
      })
      console.log("Current password verified successfully")
    } catch (loginError) {
      console.error("Current password verification failed:", loginError)
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401, headers }
      )
    }
    
    // Update password - Payload will automatically hash it
    await payload.update({
      collection: COLLECTION_SLUGS.CUSTOMERS,
      id: customerId,
      data: {
        password: newPassword,
      },
      overrideAccess: true,
    })
    
    console.log("Password updated successfully for customer:", customerId)
    
    return NextResponse.json(
      { 
        success: true, 
        message: "Password changed successfully" 
      },
      { status: 200, headers }
    )
  } catch (error) {
    console.error("Error changing password:", error)
    
    let errorMessage = "Failed to change password"
    let statusCode = 500
    
    if (error instanceof Error) {
      if (error.message.includes("validation")) {
        errorMessage = `Validation error: ${error.message}`
        statusCode = 400
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: statusCode, headers }
    )
  }
}

