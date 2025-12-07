import { NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {    
    const payload = await getPayloadClient()
    
    let formData
    try {
      formData = await request.formData()
    } catch (error) {
      console.error("Failed to parse form data:", error)
      return NextResponse.json(
        { error: 'Failed to parse form data' }, 
        { status: 400, headers }
      )
    }

    const file = formData.get('file') as File
    const alt = formData.get('alt') as string

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' }, 
        { status: 400, headers }
      )
    }


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
      return NextResponse.json({
        error: 'Invalid file type. Only JPEG, PNG, WebP, GIF, and SVG files are allowed.'
      }, { status: 400, headers })
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024 
    if (file.size > maxSize) {
      return NextResponse.json({
        error: 'File too large. Maximum size is 10MB.'
      }, { status: 400, headers })
    }

    try {
      // Convert file to buffer and upload to Payload Media collection
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

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
      }, { headers })
      
    } catch (uploadError) {
      console.error("Upload failed:", uploadError)
      
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
      }, { status: 500, headers })
    }

  } catch (error) {
    console.error('Unexpected error in media upload:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error during file upload',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500, headers })
  }
}