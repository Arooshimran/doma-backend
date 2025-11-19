import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { COLLECTION_SLUGS } from "@/collections/shared-types"

const getCorsHeaders = () => {
  const origins = (process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001").split(",")
  return {
    "Access-Control-Allow-Origin": origins[0]!.trim(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  }
}

type TokenPayload = {
  id: string
  collection?: string
}

const getRequesterFromHeader = (request: NextRequest): TokenPayload | null => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(" ")
  if (scheme !== "JWT" || !token) return null

  try {
    const base64Payload = token.split(".")[1]
    if (!base64Payload) return null
    const decoded = Buffer.from(base64Payload, "base64").toString("utf-8")
    return JSON.parse(decoded) as TokenPayload
  } catch {
    return null
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

type RouteParams = {
  userId: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const headers = getCorsHeaders()
  try {
    const { userId } = await params
    if (!userId) {
      return NextResponse.json(
        { error: "userId param is required" },
        { status: 400, headers },
      )
    }

    const requester = getRequesterFromHeader(request)
    if (!requester) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      )
    }

    const isAdmin = requester.collection === COLLECTION_SLUGS.USERS
    const isSameCustomer =
      requester.collection === COLLECTION_SLUGS.CUSTOMERS && requester.id === userId

    if (!isAdmin && !isSameCustomer) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      )
    }

    const payload = await getPayloadClient()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get("page") ?? 1)
    const limit = Number(url.searchParams.get("limit") ?? 20)
    const depth = Number(url.searchParams.get("depth") ?? 1)

    const orders = await payload.find({
      collection: COLLECTION_SLUGS.ORDERS,
      where: {
        customer: { equals: userId },
      },
      page,
      limit,
      depth,
      sort: "-createdAt",
      overrideAccess: true,
    })

    return NextResponse.json(
      {
        success: true,
        ...orders,
      },
      { status: 200, headers },
    )
  } catch (error) {
    console.error("Error fetching user orders:", error)
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500, headers },
    )
  }
}


