import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  })

const getVendorIdFromToken = async (request: NextRequest): Promise<string | null> => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("JWT ")) return null
  const token = authHeader.substring(4)
  try {
    const base64Payload = token.split('.')[1]
    const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
    const decoded = JSON.parse(decodedPayload)
    if (decoded.collection !== 'vendors') return null
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

// GET - Fetch vendor profile (ENHANCED)
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("GET /api/vendor/profile - Starting...")
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }
    
    console.log("Vendor authenticated:", vendorId)
    
    const payload = await getPayloadClient()
    
    const vendor = await payload.findByID({
      collection: "vendors",
      id: vendorId,
      populate: ["storeLogo"],
      overrideAccess: true,
    })
    
    if (!vendor) {
      console.log("Vendor not found for ID:", vendorId)
      return NextResponse.json(
        { error: "Vendor not found" },
        { status: 404, headers }
      )
    }
    
    console.log("Vendor found:", {
      id: vendor.id,
      email: vendor.email,
      storeName: vendor.storeName,
      status: vendor.status,
      hasLogo: !!vendor.storeLogo
    })
    
    const vendorProfile = {
      id: vendor.id,
      email: vendor.email,
      storeName: vendor.storeName || '',
      slug: vendor.slug || '',
      storeDescription: vendor.storeDescription || '',
      status: vendor.status || 'pending',
      role: vendor.role || 'vendor',
      
      contactInfo: {
        phone: vendor.contactInfo?.phone || '',
        address: vendor.contactInfo?.address || '',
        city: vendor.contactInfo?.city || '',
        country: vendor.contactInfo?.country || ''
      },
      
      businessInfo: {
        businessLicense: vendor.businessInfo?.businessLicense || '',
        taxId: vendor.businessInfo?.taxId || '',
        businessType: vendor.businessInfo?.businessType || ''
      },
      
      storeLogo: vendor.storeLogo ? {
        id: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.id : vendor.storeLogo,
        url: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.url : '',
        alt: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.alt : '',
        filename: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.filename : ''
      } : null,
      
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    }
    
    console.log("Returning vendor profile:", JSON.stringify(vendorProfile, null, 2))
    
    return NextResponse.json(
      { success: true, vendor: vendorProfile },
      { headers }
    )
  } catch (error) {
    console.error("Error fetching vendor profile:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch vendor profile",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers }
    )
  }
}

// PUT - Update vendor profile (ENHANCED)
export async function PUT(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("PUT /api/vendor/profile - Starting update...")
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }
    
    console.log("Vendor authenticated:", vendorId)
    
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
    
    if (!body.storeName?.trim()) {
      return NextResponse.json(
        { error: "Store name is required" },
        { status: 400, headers }
      )
    }
    
    const payload = await getPayloadClient()
    
    const updateData: any = {
      storeName: body.storeName.trim(),
      storeDescription: body.storeDescription || '',
      contactInfo: {
        phone: body.contactInfo?.phone || '',
        address: body.contactInfo?.address || '',
        city: body.contactInfo?.city || '',
        country: body.contactInfo?.country || ''
      },
      businessInfo: {
        businessLicense: body.businessInfo?.businessLicense || '',
        taxId: body.businessInfo?.taxId || '',
        businessType: body.businessInfo?.businessType || ''
      }
    }
    
    if (body.storeLogo !== undefined) {
      if (body.storeLogo === null) {
        updateData.storeLogo = null
      } else if (typeof body.storeLogo === 'string') {
        updateData.storeLogo = body.storeLogo
      } else if (body.storeLogo && body.storeLogo.id) {
        updateData.storeLogo = body.storeLogo.id
      }
    }
    
    console.log("Final update data:", JSON.stringify(updateData, null, 2))
    
    const updatedVendor = await payload.update({
      collection: "vendors",
      id: vendorId,
      data: updateData,
      populate: ["storeLogo"],
      overrideAccess: true,
    })
    
    console.log("Vendor updated successfully:", updatedVendor.id)
    
    const vendorProfile = {
      id: updatedVendor.id,
      email: updatedVendor.email,
      storeName: updatedVendor.storeName || '',
      slug: updatedVendor.slug || '',
      storeDescription: updatedVendor.storeDescription || '',
      status: updatedVendor.status || 'pending',
      role: updatedVendor.role || 'vendor',
      
      contactInfo: {
        phone: updatedVendor.contactInfo?.phone || '',
        address: updatedVendor.contactInfo?.address || '',
        city: updatedVendor.contactInfo?.city || '',
        country: updatedVendor.contactInfo?.country || ''
      },
      
      businessInfo: {
        businessLicense: updatedVendor.businessInfo?.businessLicense || '',
        taxId: updatedVendor.businessInfo?.taxId || '',
        businessType: updatedVendor.businessInfo?.businessType || ''
      },
      
      storeLogo: updatedVendor.storeLogo ? {
        id: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.id : updatedVendor.storeLogo,
        url: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.url : '',
        alt: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.alt : '',
        filename: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.filename : ''
      } : null,
      
      createdAt: updatedVendor.createdAt,
      updatedAt: updatedVendor.updatedAt,
    }
    
    console.log("Returning updated vendor profile:", JSON.stringify(vendorProfile, null, 2))
    
    return NextResponse.json(
      { success: true, vendor: vendorProfile, message: "Profile updated successfully" },
      { headers }
    )
  } catch (error) {
    console.error("Error updating vendor profile:", error)
    
    let errorMessage = "Failed to update vendor profile"
    let statusCode = 500
    
    if (error instanceof Error) {
      if (error.message.includes("duplicate") || error.message.includes("E11000")) {
        errorMessage = "Store name already exists"
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
