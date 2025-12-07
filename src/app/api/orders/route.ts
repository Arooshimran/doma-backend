import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { generateOrderNumber } from "@/lib/utils"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  })

// Helper function to extract vendor ID from JWT token
const getVendorIdFromToken = async (request: NextRequest): Promise<string | null> => {
  try {
    const authHeader = request.headers.get("Authorization")
    
    if (!authHeader || !authHeader.startsWith("JWT ")) {
      return null
    }

    const token = authHeader.substring(4)

    try {
      // Simple JWT decode without verification
      const base64Payload = token.split('.')[1]
      const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
      const decoded = JSON.parse(decodedPayload)
      
      // Check if this is a vendor token
      if (decoded.collection !== 'vendors') {
        return null
      }
      
      return decoded.id
    } catch (decodeError) {
      return null
    }
  } catch (error) {
    console.error("Token verification error:", error)
    return null
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// GET - Fetch vendor's orders
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("GET /api/orders - Starting...")
    
    const vendorId = await getVendorIdFromToken(request)
    if (!vendorId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        {
          status: 401,
          headers,
        }
      )
    }

    console.log("Vendor authenticated:", vendorId)
    
    const payload = await getPayloadClient()
    const { searchParams } = new URL(request.url)
    
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const status = searchParams.get("status") || "all"

    console.log("Query params:", { page, limit, status })

    // First, get all products belonging to this vendor
    const vendorProducts = await payload.find({
      collection: "products",
      where: {
        vendor: {
          equals: vendorId,
        },
      },
      limit: 1000, // Get all vendor products
      overrideAccess: true,
    })

    const vendorProductIds = vendorProducts.docs.map((p: any) => p.id)
    console.log("Vendor has", vendorProductIds.length, "products")

    if (vendorProductIds.length === 0) {
      // No products = no orders
      return NextResponse.json({
        docs: [],
        totalDocs: 0,
        limit,
        page,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      }, {
        headers,
      })
    }

    // Build query to find orders containing vendor's products
    const where: any = {
      "items.product": {
        in: vendorProductIds,
      },
    }

    // Filter by status if specified
    if (status !== "all") {
      where.orderStatus = { equals: status }
    }

    console.log("Query where clause:", JSON.stringify(where, null, 2))

    // Fetch orders with vendor's products
    const orders = await payload.find({
      collection: "orders",
      where,
      page,
      limit,
      sort: "-createdAt",
      depth: 2, // Populate related fields
      overrideAccess: true,
    })

    console.log("Orders fetched successfully:", orders.docs.length)

    return NextResponse.json(orders, {
      headers,
    })
  } catch (error) {
    console.error("Error fetching vendor orders:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch orders",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 500,
        headers,
      }
    )
  }
}

// POST - Create new order
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const payload = await getPayloadClient()
    // Determine content type first. Admin UI posts multipart/form-data
    const contentType = request.headers.get("content-type") || ""
    let body: any = null

    if (contentType.includes("multipart/form-data")) {
      // Admin panel sends a multipart form where the JSON payload is in the
      // `_payload` field. Use formData() to extract it.
      try {
        const form = await request.formData()
        const payloadField = form.get("_payload") ?? form.get("payload")
        if (!payloadField) {
          return NextResponse.json(
            { error: "Missing _payload form field" },
            { status: 400, headers },
          )
        }

        let jsonText: string
        if (typeof payloadField === "string") {
          jsonText = payloadField
        } else if (payloadField instanceof Blob) {
          jsonText = await payloadField.text()
        } else {
          jsonText = String(payloadField)
        }

        try {
          body = JSON.parse(jsonText)
        } catch (parseError) {
          console.error("Invalid JSON in _payload field when creating order:", parseError, "rawPayload:", jsonText)
          return NextResponse.json(
            { error: "Invalid JSON payload in _payload field" },
            { status: 400, headers },
          )
        }
      } catch (err) {
        console.error("Failed to parse multipart form-data for order:", err)
        return NextResponse.json(
          { error: "Failed to parse form data" },
          { status: 400, headers },
        )
      }
    } else {
      // Expect application/json
      try {
        body = await request.json()
      } catch (parseError) {
        const raw = await request.text().catch(() => null)
        console.error("Invalid JSON body when creating order:", parseError, "rawBody:", raw)
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400, headers },
        )
      }
    }

    const customerId = body?.customerId ?? body?.customer

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId (or customer) is required" },
        { status: 400, headers },
      )
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Order must include at least one item" },
        { status: 400, headers },
      )
    }

    if (!body.shippingAddress) {
      return NextResponse.json(
        { error: "shippingAddress is required" },
        { status: 400, headers },
      )
    }

    const orderNumber = generateOrderNumber()
    const order = await payload.create({
      collection: "orders",
      overrideAccess: true,
      data: {
        orderNumber,
        customer: customerId,
        orderStatus: body.orderStatus ?? "pending",
        paymentStatus: body.paymentStatus ?? "pending",
        paymentMethod: body.paymentMethod,
        paymentId: body.paymentId,
        items: body.items,
        shippingAddress: body.shippingAddress,
        billingAddress: body.billingAddress,
        tax: body.tax ?? body.totals?.tax ?? 0,
        shippingCost: body.shippingCost ?? body.totals?.shipping ?? 0,
        subtotal: body.subtotal ?? body.totals?.subtotal,
        total: body.total ?? body.totals?.total,
      },
    })

    return NextResponse.json({ success: true, order }, { status: 201, headers })
  } catch (error) {
    console.error("Error creating order:", error)
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500, headers },
    )
  }
}