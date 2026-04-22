import crypto from "crypto"
import type { Payload } from "payload"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { findCartByUserId } from "@/lib/cart-service"
import { resolveRelationId } from "@/lib/cart-utils"
import { Safepay } from "@sfpy/node-sdk"

const ONLINE_PAYMENT_METHODS = new Set(["card", "wallet", "safepay", "online"])

const toLower = (value: unknown) => String(value ?? "").trim().toLowerCase()

const normalizeEnvironment = (value: string | undefined) => {
  const normalized = toLower(value)
  if (normalized === "production") return "production" as const
  return "sandbox" as const
}

const ensureAbsoluteUrl = (value: string | undefined): string | null => {
  const input = String(value ?? "").trim()
  if (!input) return null
  try {
    const parsed = new URL(input)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString()
    return null
  } catch {
    return null
  }
}

const safeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

export const isSafepayPaymentMethod = (paymentMethod: string | null | undefined): boolean =>
  ONLINE_PAYMENT_METHODS.has(toLower(paymentMethod))

export const getSafepayConfig = () => {
  const environment = normalizeEnvironment(process.env.SAFEPAY_ENVIRONMENT)

  // ✅ ONLY use SAFEPAY_API_KEY — this must be your sec_xxxxx secret key
  const apiKey = String(process.env.SAFEPAY_API_KEY ?? "").trim()
  const v1Secret = String(process.env.SAFEPAY_SECRET_KEY ?? "").trim()
  const webhookSecret = String(process.env.SAFEPAY_WEBHOOK_SECRET ?? v1Secret).trim()
  const frontendSuccessUrl = ensureAbsoluteUrl(process.env.SAFEPAY_FRONTEND_SUCCESS_URL)
  const frontendCancelUrl = ensureAbsoluteUrl(process.env.SAFEPAY_FRONTEND_CANCEL_URL)

  return { environment, apiKey, v1Secret, webhookSecret, frontendSuccessUrl, frontendCancelUrl }
}

export const isSafepayConfigured = (): boolean => {
  const { apiKey, v1Secret } = getSafepayConfig()
  return Boolean(apiKey && v1Secret)
}

// ✅ No module-level singleton — create fresh per request to avoid stale env issues
export const getSafepayClient = (): Safepay => {
  const config = getSafepayConfig()

  if (!config.apiKey || !config.v1Secret) {
    throw new Error("Safepay not configured: missing SAFEPAY_API_KEY or SAFEPAY_SECRET_KEY")
  }
  if (!config.webhookSecret) {
    throw new Error("Safepay not configured: missing SAFEPAY_WEBHOOK_SECRET")
  }

  // ✅ Log exactly what environment and key prefix are being used
  console.log(`[Safepay] Creating client | env=${config.environment} | key starts with: ${config.apiKey.slice(0, 8)}...`)

  return new Safepay({
    environment: config.environment as any,
    apiKey: config.apiKey,     // must be sec_xxxxx
    v1Secret: config.v1Secret,
    webhookSecret: config.webhookSecret,
  })
}

export const toMinorAmount = (amount: number): number => {
  const normalized = Number(amount)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("Payment amount must be a positive number.")
  }
  return Math.round(normalized * 100)
}

export const getSafepayCallbackUrls = (origin: string) => {
  const normalizedOrigin = origin.replace(/\/+$/, "")
  const redirectUrl =
    ensureAbsoluteUrl(process.env.SAFEPAY_REDIRECT_URL) ||
    `${normalizedOrigin}/api/payments/safepay/confirm`
  const cancelUrl =
    ensureAbsoluteUrl(process.env.SAFEPAY_CANCEL_URL) ||
    `${normalizedOrigin}/api/payments/safepay/cancel`
  return { redirectUrl, cancelUrl }
}

console.log("ENV CHECK:", {
  SAFEPAY_API_KEY: process.env.SAFEPAY_API_KEY?.slice(0, 10),
  SAFEPAY_SECRET_KEY: process.env.SAFEPAY_SECRET_KEY?.slice(0, 10),
  SAFEPAY_ENVIRONMENT: process.env.SAFEPAY_ENVIRONMENT,
})

export const createSafepayCheckout = async ({
  amount,
  currency,
  orderId,
  origin,
}: {
  amount: number
  currency: "PKR" | "USD"
  orderId: string
  origin: string
}) => {
  const client = getSafepayClient()
  const minorAmount = toMinorAmount(amount)
  const { redirectUrl, cancelUrl } = getSafepayCallbackUrls(origin)

  console.log(`[Safepay] Creating payment | amount=${minorAmount} ${currency} | orderId=${orderId}`)

  // ✅ SDK returns { token } directly
  const { token } = await client.payments.create({
    amount: minorAmount,
    currency,
  })

  console.log(`[Safepay] Got token: ${token}`)

  const checkoutUrl = client.checkout.create({
    token,
    orderId,
    cancelUrl,
    redirectUrl,
    source: "custom",
    webhooks: true,
  })

  return { tracker: token, checkoutUrl, minorAmount }
}


const pickFirstTruthy = (...values: Array<unknown>): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

export const extractOrderIdFromSafepayPayload = (payload: any): string | null =>
  pickFirstTruthy(
    payload?.order_id,
    payload?.orderId,
    payload?.order,
    payload?.data?.order_id,
    payload?.data?.orderId,
    payload?.data?.order,
    payload?.payment?.order_id,
    payload?.payment?.orderId,
    payload?.metadata?.order_id,
    payload?.metadata?.orderId,
  )

export const extractTrackerFromSafepayPayload = (payload: any): string | null =>
  pickFirstTruthy(
    payload?.tracker,
    payload?.token,
    payload?.beacon,
    payload?.data?.tracker,
    payload?.data?.token,
    payload?.payment?.tracker,
    payload?.payment?.token,
  )

export const extractReferenceCodeFromSafepayPayload = (payload: any): string | null =>
  pickFirstTruthy(
    payload?.reference,
    payload?.reference_code,
    payload?.referenceCode,
    payload?.transaction_id,
    payload?.transactionId,
    payload?.data?.reference,
    payload?.data?.reference_code,
    payload?.data?.referenceCode,
    payload?.payment?.reference,
    payload?.payment?.reference_code,
  )

export const extractSignatureFromSafepayPayload = (payload: any): string | null =>
  pickFirstTruthy(payload?.sig, payload?.signature, payload?.data?.sig, payload?.data?.signature)

export const verifySafepayRedirectSignature = ({
  tracker,
  sig,
}: {
  tracker: string
  sig: string
}): boolean => {
  const secret = getSafepayConfig().v1Secret
  if (!secret || !tracker || !sig) return false

  const expected = crypto.createHmac("sha256", secret).update(tracker).digest("hex")
  return safeEqual(expected, sig)
}

export const verifySafepayWebhookSignature = ({
  data,
  signature,
}: {
  data: unknown
  signature: string
}): boolean => {
  const secret = getSafepayConfig().webhookSecret
  if (!secret || !signature) return false

  const expected = crypto
    .createHmac("sha512", secret)
    .update(Buffer.from(JSON.stringify(data)))
    .digest("hex")

  return safeEqual(expected, signature)
}

export const normalizeSafepayEventType = (eventType: unknown): string => toLower(eventType)

export const isSafepaySuccessEvent = (eventType: unknown): boolean => {
  const normalized = normalizeSafepayEventType(eventType)
  return (
    normalized === "payment.succeeded" ||
    normalized === "payment.completed" ||
    normalized === "payment.settled" ||
    normalized === "payment.paid"
  )
}

export const isSafepayFailureEvent = (eventType: unknown): boolean => {
  const normalized = normalizeSafepayEventType(eventType)
  return (
    normalized === "payment.failed" ||
    normalized === "payment.rejected" ||
    normalized === "payment.cancelled" ||
    normalized === "payment.canceled"
  )
}

export const clearPurchasedItemsFromCart = async ({
  payload,
  order,
}: {
  payload: Payload
  order: any
}) => {
  const customerId = resolveRelationId(order?.customer)
  if (!customerId) return

  const cart = await findCartByUserId(payload, customerId, 1)
  if (!cart || !Array.isArray(cart.items) || !Array.isArray(order?.items)) return

  const purchasedProductIds = new Set(
    order.items
      .map((item: any) => resolveRelationId(item?.product))
      .filter(Boolean),
  )

  if (purchasedProductIds.size === 0) return

  const remainingItems = cart.items.filter((item: any) => {
    const itemProductId = resolveRelationId(item?.product)
    return !itemProductId || !purchasedProductIds.has(itemProductId)
  })

  await payload.update({
    collection: COLLECTION_SLUGS.CARTS,
    id: cart.id,
    data: { items: remainingItems },
    overrideAccess: true,
  })
}