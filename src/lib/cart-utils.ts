import type { CartProduct, RelationValue } from "@/types/cart"

export const resolveRelationId = (value: RelationValue | null | undefined): string | null => {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (typeof value === "object") {
    if ("value" in value && value.value != null) {
      return String(value.value)
    }
    if ("id" in value && value.id != null) {
      return String(value.id)
    }
  }
  return null
}

export const toPositiveNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export const toQuantity = (value: unknown, fallback = 1): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

export const getUnitPriceFromProduct = (product: CartProduct | null | undefined): number => {
  const price =
    product?.pricing?.discountedPrice ??
    product?.pricing?.price ??
    product?.price ??
    0
  return Number(price) || 0
}

export const getAvailableStock = (product: CartProduct | null | undefined): number =>
  toPositiveNumber(product?.inventory?.quantity ?? 0, 0)

export const calculateLineTotal = (unitPrice: number, quantity: number): number =>
  Number((unitPrice * quantity).toFixed(2))

