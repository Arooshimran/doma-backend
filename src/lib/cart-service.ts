import type { NextRequest } from "next/server"
import type { Payload } from "payload"
import { COLLECTION_SLUGS } from "@/collections/shared-types"

export const getCartCorsHeaders = () => {
  const origins = (process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001").split(",")

  return {
    "Access-Control-Allow-Origin": origins[0]!.trim(),
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  }
}

export type TokenPayload = {
  id: string
  collection?: string
}

export const getRequesterFromHeader = (request: NextRequest): TokenPayload | null => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(" ")
  if ((scheme ?? "").toUpperCase() !== "JWT" || !token) return null

  try {
    const base64Payload = token.split(".")[1]
    if (!base64Payload) return null
    const decoded = Buffer.from(base64Payload, "base64").toString("utf-8")
    return JSON.parse(decoded) as TokenPayload
  } catch {
    return null
  }
}

type CartAccessResult =
  | { ok: true; targetUserId: string; isAdmin: boolean }
  | { ok: false; status: number; message: string }

export const resolveCartAccess = (
  requester: TokenPayload | null,
  requestedUserId?: string | null,
): CartAccessResult => {
  if (!requester) {
    return { ok: false, status: 401, message: "Unauthorized" }
  }

  const isAdmin = requester.collection === COLLECTION_SLUGS.USERS
  if (isAdmin) {
    if (!requestedUserId) {
      return { ok: false, status: 400, message: "userId is required" }
    }
    return { ok: true, targetUserId: requestedUserId, isAdmin: true }
  }

  if (requester.collection === COLLECTION_SLUGS.CUSTOMERS) {
    if (requestedUserId && requestedUserId !== requester.id) {
      return { ok: false, status: 403, message: "Forbidden" }
    }
    return { ok: true, targetUserId: requester.id, isAdmin: false }
  }

  return { ok: false, status: 403, message: "Forbidden" }
}

export const findCartByUserId = async (
  payload: Payload,
  userId: string,
  depth = 2,
) => {
  const result = await payload.find({
    collection: COLLECTION_SLUGS.CARTS,
    where: {
      userId: {
        equals: userId,
      },
    },
    limit: 1,
    depth,
    overrideAccess: true,
  })

  return result.docs[0] ?? null
}

