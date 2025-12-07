import { NextRequest, NextResponse } from 'next/server';
import { getPayloadClient } from '@/lib/payload-client';
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers";

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// POST - Upload vendor logo (ENHANCED)
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }


    let formData
    try {
      formData = await request.formData()
    } catch (formDataError) {
      console.error("Failed to parse form data:", formDataError)
      return NextResponse.json(
        { 
          error: 'Failed to parse form data',
          details: formDataError instanceof Error ? formDataError.message : 'Unknown form data error'
        },
        { status: 400, headers }
      )
    }
    
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400, headers }
      )
    }
    

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' },
        { status: 400, headers }
      )
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024 
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400, headers }
      )
    }

    
    const payload = await getPayloadClient()

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop()
    const fileName = `vendor-logo-${vendorId}-${timestamp}.${fileExtension}`
    
    try {
      const mediaDoc = await payload.create({
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
      
      return NextResponse.json({
        success: true,
        message: 'Logo uploaded successfully',
        media: {
          id: mediaDoc.id,
          url: (mediaDoc as any).url,
          alt: (mediaDoc as any).alt,
          filename: (mediaDoc as any).filename,
        },
      }, { status: 201, headers })
      
    } catch (uploadError) {
      console.error('Payload upload error:', uploadError)
      return NextResponse.json(
        { 
          error: 'Failed to upload to media collection',
          details: uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
        },
        { status: 500, headers }
      )
    }
  } catch (error) {
    console.error('Error uploading logo:', error)
    return NextResponse.json(
      { 
        error: 'Failed to upload logo',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers }
    )
  }
}
