// app/api/upload/media/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
})

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

export async function POST(request: NextRequest) {
  try {
    console.log("📸 POST /api/upload/media - Starting file upload...")
    
    const payload = await getPayloadClient()
    
    let formData
    try {
      formData = await request.formData()
    } catch (error) {
      console.error("❌ Failed to parse form data:", error)
      return NextResponse.json(
        { error: 'Failed to parse form data' }, 
        { status: 400, headers: getCorsHeaders() }
      )
    }

    const file = formData.get('file') as File
    const alt = formData.get('alt') as string

    if (!file) {
      console.log("❌ No file provided")
      return NextResponse.json(
        { error: 'No file provided' }, 
        { status: 400, headers: getCorsHeaders() }
      )
    }

    console.log("📋 File details:", {
      name: file.name,
      size: file.size,
      type: file.type
    })

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 
      'image/jpg', 
      'image/png', 
      'image/webp', 
      'image/gif',
      'image/svg+xml'
    ]
    
    if (!allowedTypes.includes(file.type)) {
      console.log("❌ Invalid file type:", file.type)
      return NextResponse.json({
        error: 'Invalid file type. Only JPEG, PNG, WebP, GIF, and SVG files are allowed.'
      }, { status: 400, headers: getCorsHeaders() })
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024 // 10MB in bytes
    if (file.size > maxSize) {
      console.log("❌ File too large:", file.size)
      return NextResponse.json({
        error: 'File too large. Maximum size is 10MB.'
      }, { status: 400, headers: getCorsHeaders() })
    }

    try {
      // Convert file to buffer and upload to Payload Media collection
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      console.log("📤 Uploading to Payload...")

      const uploadedMedia = await payload.create({
        collection: 'media',
        data: {
          alt: alt || file.name.split('.')[0],
        },
        file: {
          data: buffer,
          name: file.name,
          size: file.size,
          mimetype: file.type,
        },
        overrideAccess: true,
      })

      console.log("✅ Media uploaded successfully:", {
        id: uploadedMedia.id,
        filename: (uploadedMedia as any).filename,
        url: (uploadedMedia as any).url
      })

      return NextResponse.json({
        success: true,
        media: {
          id: uploadedMedia.id,
          url: (uploadedMedia as any).url,
          filename: (uploadedMedia as any).filename,
          alt: (uploadedMedia as any).alt,
          mimeType: (uploadedMedia as any).mimeType,
          filesize: (uploadedMedia as any).filesize,
          width: (uploadedMedia as any).width,
          height: (uploadedMedia as any).height,
        },
        message: 'File uploaded successfully'
      }, { headers: getCorsHeaders() })
      
    } catch (uploadError) {
      console.error("💥 Upload failed:", uploadError)
      
      let errorMessage = "Failed to upload file"
      if (uploadError instanceof Error) {
        if (uploadError.message.includes('size')) {
          errorMessage = "File size exceeds limit"
        } else if (uploadError.message.includes('type')) {
          errorMessage = "Invalid file type"
        } else {
          errorMessage = uploadError.message
        }
      }

      return NextResponse.json({
        success: false,
        error: errorMessage,
        details: uploadError instanceof Error ? uploadError.message : "Unknown upload error"
      }, { status: 500, headers: getCorsHeaders() })
    }

  } catch (error) {
    console.error('💥 Unexpected error in media upload:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error during file upload',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500, headers: getCorsHeaders() })
  }
}