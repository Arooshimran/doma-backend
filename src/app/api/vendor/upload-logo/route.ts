// app/api/vendor/upload-logo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPayloadClient } from '@/lib/payload-client';

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "http://localhost:3001",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
})

// Helper to extract vendor ID from JWT token
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

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

// POST - Upload vendor logo (ENHANCED)
export async function POST(request: NextRequest) {
  try {
    console.log("🚀 POST /api/vendor/upload-logo - Starting...")
    
    // Verify vendor authentication
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("❌ Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers: getCorsHeaders() }
      )
    }
    
    console.log("✅ Vendor authenticated:", vendorId)
    console.log("📋 Request headers:", Object.fromEntries(request.headers))
    console.log("📋 Request method:", request.method)
    console.log("📋 Request URL:", request.url)

    let formData
    try {
      console.log("📤 Parsing form data...")
      formData = await request.formData()
      console.log("✅ Form data parsed successfully")
      console.log("📋 Form data keys:", Array.from(formData.keys()))
    } catch (formDataError) {
      console.error("💥 Failed to parse form data:", formDataError)
      return NextResponse.json(
        { 
          error: 'Failed to parse form data',
          details: formDataError instanceof Error ? formDataError.message : 'Unknown form data error'
        },
        { status: 400, headers: getCorsHeaders() }
      )
    }
    
    const file = formData.get('file') as File

    if (!file) {
      console.log("❌ No file provided")
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400, headers: getCorsHeaders() }
      )
    }
    
    console.log("📎 File details:", {
      name: file.name,
      type: file.type,
      size: file.size
    })

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      console.log("❌ Invalid file type:", file.type)
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      console.log("❌ File too large:", file.size)
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    console.log("✅ File validation passed")
    
    const payload = await getPayloadClient()

    // Convert File to Buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Create a unique filename
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop()
    const fileName = `vendor-logo-${vendorId}-${timestamp}.${fileExtension}`
    
    console.log("📤 Uploading file:", fileName)

    try {
      // Upload to Payload media collection
      const uploadResult = await payload.create({
        collection: 'media',
        data: {
          alt: `Store logo for vendor ${vendorId}`,
          filename: fileName,
        },
        file: {
          data: buffer,
          mimetype: file.type,
          name: fileName,
          size: file.size,
        },
        overrideAccess: true,
      })
      
      console.log("✅ File uploaded successfully:", {
        id: uploadResult.id,
        url: uploadResult.url,
        filename: uploadResult.filename
      })

      return NextResponse.json({
        success: true,
        message: 'Logo uploaded successfully',
        media: {
          id: uploadResult.id,
          url: uploadResult.url,
          alt: uploadResult.alt,
          filename: uploadResult.filename,
        }
      }, { status: 201, headers: getCorsHeaders() })
      
    } catch (uploadError) {
      console.error('💥 Payload upload error:', uploadError)
      return NextResponse.json(
        { 
          error: 'Failed to upload to media collection',
          details: uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
        },
        { status: 500, headers: getCorsHeaders() }
      )
    }
  } catch (error) {
    console.error('💥 Error uploading logo:', error)
    return NextResponse.json(
      { 
        error: 'Failed to upload logo',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
