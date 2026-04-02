import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  })

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

// GET - Fetch customer profile
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
    
    const customer = await payload.findByID({
      collection: "customers",
      id: customerId,
      depth: 1, // 🔥 Added depth to get the full Avatar/Media object
      overrideAccess: true,
    })
    
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers }
      )
    }
    
    const customerProfile = {
      id: customer.id,
      email: customer.email,
      Name: customer.Name || '',
      avatar: customer.avatar || null, // 🔥 Now included in response
      phone: customer.phone || '',
      role: customer.role || 'customer',
      status: customer.status || 'active',
      addresses: customer.addresses || [],
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    }
        
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
    const customerId = await getCustomerIdFromToken(request)
    if (!customerId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }
        
    let body
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers }
      )
    }    

    const payload = await getPayloadClient()
    const updateData: any = {}
    
    if (body.Name !== undefined) updateData.Name = body.Name.trim()
    if (body.phone !== undefined) updateData.phone = body.phone || ''
    if (body.addresses !== undefined) updateData.addresses = body.addresses
    
    // 🔥 Allow updating the avatar (expects a Media ID string)
    if (body.avatar !== undefined) {
      updateData.avatar = body.avatar 
    }
        
    const updatedCustomer = await payload.update({
      collection: "customers",
      id: customerId,
      data: updateData,
      depth: 1, // 🔥 Depth ensures we return the new image URL immediately
      overrideAccess: true,
    })
        
    const customerProfile = {
      id: updatedCustomer.id,
      email: updatedCustomer.email,
      Name: updatedCustomer.Name || '',
      avatar: updatedCustomer.avatar || null, // 🔥 Included in updated response
      phone: updatedCustomer.phone || '',
      role: updatedCustomer.role || 'customer',
      status: updatedCustomer.status || 'active',
      addresses: updatedCustomer.addresses || [],
      createdAt: updatedCustomer.createdAt,
      updatedAt: updatedCustomer.updatedAt,
    }
        
    return NextResponse.json(
      { success: true, customer: customerProfile, message: "Profile updated successfully" },
      { headers }
    )
  } catch (error) {
    console.error("Error updating customer profile:", error)
    
    let errorMessage = "Failed to update customer profile"
    let statusCode = 500
    
    if (error instanceof Error) {
      if (error.message.includes("duplicate")) {
        errorMessage = "Email already exists"
        statusCode = 409
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