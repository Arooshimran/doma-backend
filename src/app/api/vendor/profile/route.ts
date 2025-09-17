import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "http://localhost:3001",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
})

// Helper: extract vendor ID from JWT token
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

// OPTIONS handler
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

// GET - Fetch vendor profile (ENHANCED)
export async function GET(request: NextRequest) {
  try {
    console.log("🚀 GET /api/vendor/profile - Starting...")
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("❌ Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers: getCorsHeaders() }
      )
    }
    
    console.log("✅ Vendor authenticated:", vendorId)
    
    const payload = await getPayloadClient()
    
    // ENHANCED: Fetch vendor with populated storeLogo
    const vendor = await payload.findByID({
      collection: "vendors",
      id: vendorId,
      populate: ["storeLogo"], // Populate the storeLogo relationship
      overrideAccess: true,
    })
    
    if (!vendor) {
      console.log("❌ Vendor not found for ID:", vendorId)
      return NextResponse.json(
        { error: "Vendor not found" },
        { status: 404, headers: getCorsHeaders() }
      )
    }
    
    console.log("✅ Vendor found:", {
      id: vendor.id,
      email: vendor.email,
      storeName: vendor.storeName,
      status: vendor.status,
      hasLogo: !!vendor.storeLogo
    })
    
    // ENHANCED: Return complete vendor profile with proper defaults
    const vendorProfile = {
      id: vendor.id,
      email: vendor.email,
      storeName: vendor.storeName || '',
      slug: vendor.slug || '',
      storeDescription: vendor.storeDescription || '',
      status: vendor.status || 'pending',
      role: vendor.role || 'vendor',
      
      // ENHANCED: Ensure contactInfo has proper structure
      contactInfo: {
        phone: vendor.contactInfo?.phone || '',
        address: vendor.contactInfo?.address || '',
        city: vendor.contactInfo?.city || '',
        country: vendor.contactInfo?.country || ''
      },
      
      // ENHANCED: Ensure businessInfo has proper structure
      businessInfo: {
        businessLicense: vendor.businessInfo?.businessLicense || '',
        taxId: vendor.businessInfo?.taxId || '',
        businessType: vendor.businessInfo?.businessType || ''
      },
      
      // ENHANCED: Handle storeLogo properly (could be populated object or just ID)
      storeLogo: vendor.storeLogo ? {
        id: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.id : vendor.storeLogo,
        url: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.url : '',
        alt: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.alt : '',
        filename: typeof vendor.storeLogo === 'object' ? vendor.storeLogo.filename : ''
      } : null,
      
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    }
    
    console.log("📋 Returning vendor profile:", JSON.stringify(vendorProfile, null, 2))
    
    return NextResponse.json(
      { success: true, vendor: vendorProfile },
      { headers: getCorsHeaders() }
    )
  } catch (error) {
    console.error("💥 Error fetching vendor profile:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch vendor profile",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}

// PUT - Update vendor profile (ENHANCED)
export async function PUT(request: NextRequest) {
  try {
    console.log("🚀 PUT /api/vendor/profile - Starting update...")
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("❌ Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers: getCorsHeaders() }
      )
    }
    
    console.log("✅ Vendor authenticated:", vendorId)
    
    const body = await request.json()
    console.log("📝 Update data received:", JSON.stringify(body, null, 2))
    
    // Validate required fields
    if (!body.storeName?.trim()) {
      return NextResponse.json(
        { error: "Store name is required" },
        { status: 400, headers: getCorsHeaders() }
      )
    }
    
    const payload = await getPayloadClient()
    
    // Prepare update data - only include fields that should be updated
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
    
    // Handle storeLogo - only update if provided
    if (body.storeLogo !== undefined) {
      if (body.storeLogo === null) {
        // Remove logo
        updateData.storeLogo = null
      } else if (typeof body.storeLogo === 'string') {
        // Logo ID provided
        updateData.storeLogo = body.storeLogo
      } else if (body.storeLogo && body.storeLogo.id) {
        // Logo object with ID provided
        updateData.storeLogo = body.storeLogo.id
      }
    }
    
    console.log("💾 Final update data:", JSON.stringify(updateData, null, 2))
    
    const updatedVendor = await payload.update({
      collection: "vendors",
      id: vendorId,
      data: updateData,
      populate: ["storeLogo"], // Populate storeLogo in response
      overrideAccess: true,
    })
    
    console.log("✅ Vendor updated successfully:", updatedVendor.id)
    
    // ENHANCED: Return complete updated profile with proper structure
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
      
      // Handle populated storeLogo
      storeLogo: updatedVendor.storeLogo ? {
        id: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.id : updatedVendor.storeLogo,
        url: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.url : '',
        alt: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.alt : '',
        filename: typeof updatedVendor.storeLogo === 'object' ? updatedVendor.storeLogo.filename : ''
      } : null,
      
      createdAt: updatedVendor.createdAt,
      updatedAt: updatedVendor.updatedAt,
    }
    
    console.log("📋 Returning updated vendor profile:", JSON.stringify(vendorProfile, null, 2))
    
    return NextResponse.json(
      { success: true, vendor: vendorProfile, message: "Profile updated successfully" },
      { headers: getCorsHeaders() }
    )
  } catch (error) {
    console.error("💥 Error updating vendor profile:", error)
    
    // Enhanced error handling
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
      { status: statusCode, headers: getCorsHeaders() }
    )
  }
}
