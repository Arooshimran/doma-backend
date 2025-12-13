import type { NextRequest } from "next/server"

const FALLBACK_ORIGINS = "http://localhost:3000,http://localhost:3001,https://doma-backend.onrender.com,https://doma-gray.vercel.app"

const normalize = (origin?: string | null) => origin?.replace(/\/$/, "")

const allowedOrigins = (process.env.ALLOWED_ORIGINS || FALLBACK_ORIGINS)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const pickAllowedOrigin = (origin?: string | null) => {
  if (!allowedOrigins.length) {
    return normalize(origin) || "*"
  }

  const normalizedOrigin = normalize(origin)
  if (normalizedOrigin) {
    const match = allowedOrigins.find((allowed) => normalize(allowed) === normalizedOrigin)
    if (match) return match
  }

  return allowedOrigins[0]!
}

type HeaderOverrides = Record<string, string | number | readonly string[]>

export const buildCorsHeaders = (
  origin?: string | null,
  overrides: HeaderOverrides = {},
) => ({
  "Access-Control-Allow-Origin": pickAllowedOrigin(origin),
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
  ...overrides,
})

export const buildCorsHeadersFromRequest = (
  request?: NextRequest | null,
  overrides?: HeaderOverrides,
) => buildCorsHeaders(request?.headers.get("origin"), overrides)

export const getAllowedOrigins = () => [...allowedOrigins]

