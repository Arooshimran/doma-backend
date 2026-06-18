import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import cloudinary from "@/lib/cloudinary"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  })

const getCustomerIdFromToken = (request: NextRequest): string | null => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("JWT ")) return null
  try {
    const base64Payload = authHeader.substring(4).split(".")[1]
    const decoded = JSON.parse(Buffer.from(base64Payload, "base64").toString("utf-8"))
    if (decoded.collection !== "customers") return null
    return decoded.id
  } catch {
    return null
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

// GET — fetch all AI redesigns for the logged-in customer
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  const customerId = getCustomerIdFromToken(request)
  if (!customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }

  try {
    const payload = await getPayloadClient()
    const customer = await payload.findByID({
      collection: "customers",
      id: customerId,
      overrideAccess: true,
    })

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404, headers })
    }

    const redesigns = ((customer as any).aiRedesigns ?? []).sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return NextResponse.json({ success: true, redesigns }, { headers })
  } catch (error) {
    console.error("AI Redesigns GET error:", error)
    return NextResponse.json({ error: "Failed to fetch redesigns" }, { status: 500, headers })
  }
}

// POST — save a new AI redesign image
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  const customerId = getCustomerIdFromToken(request)
  if (!customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }

  let body: { imageUrl?: string; prompt?: string; roomType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers })
  }

  if (!body.imageUrl?.trim()) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400, headers })
  }

  try {
    const payload = await getPayloadClient()
    const customer = await payload.findByID({
      collection: "customers",
      id: customerId,
      overrideAccess: true,
    })

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404, headers })
    }

    const existing: any[] = (customer as any).aiRedesigns ?? []

    const uploaded = await cloudinary.uploader.upload(body.imageUrl.trim(), {
      folder: `ai-redesigns/${customerId}`,
      resource_type: "image",
    })

    const newEntry = {
      imageUrl: uploaded.secure_url,
      prompt: body.prompt?.trim() ?? "",
      roomType: body.roomType?.trim() ?? "",
      createdAt: new Date().toISOString(),
    }

    await payload.update({
      collection: "customers",
      id: customerId,
      data: { aiRedesigns: [...existing, newEntry] },
      overrideAccess: true,
    })

    return NextResponse.json({ success: true, redesign: newEntry }, { status: 201, headers })
  } catch (error) {
    console.error("AI Redesigns POST error:", error)
    return NextResponse.json({ error: "Failed to save redesign" }, { status: 500, headers })
  }
}

// DELETE — remove a specific redesign by its id
export async function DELETE(request: NextRequest) {
  const headers = corsHeaders(request)
  const customerId = getCustomerIdFromToken(request)
  if (!customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }

  let body: { redesignId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers })
  }

  if (!body.redesignId) {
    return NextResponse.json({ error: "redesignId is required" }, { status: 400, headers })
  }

  try {
    const payload = await getPayloadClient()
    const customer = await payload.findByID({
      collection: "customers",
      id: customerId,
      overrideAccess: true,
    })

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404, headers })
    }

    const existing: any[] = (customer as any).aiRedesigns ?? []
    const updated = existing.filter((r: any) => r.id !== body.redesignId)

    if (updated.length === existing.length) {
      return NextResponse.json({ error: "Redesign not found" }, { status: 404, headers })
    }

    await payload.update({
      collection: "customers",
      id: customerId,
      data: { aiRedesigns: updated },
      overrideAccess: true,
    })

    return NextResponse.json({ success: true, message: "Redesign deleted" }, { headers })
  } catch (error) {
    console.error("AI Redesigns DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete redesign" }, { status: 500, headers })
  }
}
