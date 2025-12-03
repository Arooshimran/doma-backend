import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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

// GET - Fetch customer profile
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("GET /api/customer/profile - Starting...")
    
    const customerId = await getCustomerIdFromToken(request)
    if (!customerId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }
    
    console.log("Customer authenticated:", customerId)
    
    const payload = await getPayloadClient()
    
    const customer = await payload.findByID({
      collection: "customers",
      id: customerId,
      overrideAccess: true,
    })
    
    if (!customer) {
      console.log("Customer not found for ID:", customerId)
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers }
      )
    }
    
    console.log("Customer found:", {
      id: customer.id,
      email: customer.email,
      Name: customer.Name,
      status: customer.status,
    })
    
    // Return complete customer profile with proper defaults
    const customerProfile = {
      id: customer.id,
      email: customer.email,
      Name: customer.Name || '',
      phone: customer.phone || '',
      role: customer.role || 'customer',
      status: customer.status || 'active',
      addresses: customer.addresses || [],
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    }
    
    console.log("Returning customer profile:", JSON.stringify(customerProfile, null, 2))
    
    return NextResponse.json(
      { success: true, customer: customerProfile },
      { headers }
    )
  } catch (error) {
    console.error("Error fetching customer profile:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch customer profile",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers }
    )
  }
}

// PUT - Update customer profile
export async function PUT(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("PUT /api/customer/profile - Starting update...")
    
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
    console.log("Update data received:", JSON.stringify(body, null, 2))
    
    const payload = await getPayloadClient()
    
    // Prepare update data - only include fields that should be updated
    const updateData: any = {}
    
    if (body.Name !== undefined) {
      updateData.Name = body.Name.trim()
    }
    
    if (body.phone !== undefined) {
      updateData.phone = body.phone || ''
    }
    
    if (body.addresses !== undefined) {
      updateData.addresses = body.addresses
    }
    
    console.log("Final update data:", JSON.stringify(updateData, null, 2))
    
    const updatedCustomer = await payload.update({
      collection: "customers",
      id: customerId,
      data: updateData,
      overrideAccess: true,
    })
    
    console.log("Customer updated successfully:", updatedCustomer.id)
    
    // Return complete updated profile
    const customerProfile = {
      id: updatedCustomer.id,
      email: updatedCustomer.email,
      Name: updatedCustomer.Name || '',
      phone: updatedCustomer.phone || '',
      role: updatedCustomer.role || 'customer',
      status: updatedCustomer.status || 'active',
      addresses: updatedCustomer.addresses || [],
      createdAt: updatedCustomer.createdAt,
      updatedAt: updatedCustomer.updatedAt,
    }
    
    console.log("Returning updated customer profile:", JSON.stringify(customerProfile, null, 2))
    
    return NextResponse.json(
      { success: true, customer: customerProfile, message: "Profile updated successfully" },
      { headers }
    )
  } catch (error) {
    console.error("Error updating customer profile:", error)
    
    // Enhanced error handling
    let errorMessage = "Failed to update customer profile"
    let statusCode = 500
    
    if (error instanceof Error) {
      if (error.message.includes("duplicate") || error.message.includes("E11000")) {
        errorMessage = "Email already exists"
        statusCode = 409
      } else if (error.message.includes("validation")) {
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

