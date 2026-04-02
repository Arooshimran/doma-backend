import type { CollectionConfig, Access } from "payload"
import { isAdmin } from "@/lib/access-helpers"
import { COLLECTION_SLUGS } from "./shared-types"

const ORDER_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Canceled", value: "canceled" },
] as Array<{ label: string; value: string }>

const ORDER_STATUS_VALUES = ORDER_STATUS_OPTIONS.map((status) => status.value)

// 🔥 UPDATED: Added "pending" to trigger stock deduction immediately on Order Placement
const STOCK_CONFIRMATION_STATUSES = new Set(["pending", "paid", "processing", "shipped", "delivered"])

// 🔥 FIXED: Now accepts 'req' directly to match the call in access hooks
const getCustomerAccessFilter = (req: any) => {
  const user = req?.user as any
  if (user?.collection === COLLECTION_SLUGS.CUSTOMERS) {
    return { customer: { equals: user.id } }
  }
  return false
}

// --- HELPER UTILITIES ---
const resolveRelationId = (value: any): string | null => {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "number") return value.toString()
  if (typeof value === "object") {
    if ("value" in value) return value.value as string
    if ("id" in value) return value.id as string
  }
  return null
}

const toPositiveNumber = (value: any, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const toQuantity = (value: any): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.floor(parsed)
}

const Orders: CollectionConfig = {
  slug: "orders",
  admin: {
    useAsTitle: "orderNumber",
  },
  access: {
    // 🔥 FIXED: Passing 'req' directly to the filter
    read: ({ req }) => {
      if (isAdmin({ req })) return true
      return getCustomerAccessFilter(req)
    },
    create: () => true,
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      return getCustomerAccessFilter(req)
    },
    delete: ({ req }) => {
      if (isAdmin({ req })) return true
      return false // Customers cannot delete orders
    },
  },
  fields: [
    {
      name: "orderNumber",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "customer",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.CUSTOMERS as any,
      required: true,
    },
    {
      name: "orderStatus",
      type: "select",
      options: ORDER_STATUS_OPTIONS,
      defaultValue: "pending",
      required: true,
    },
    {
      name: "paymentStatus",
      type: "select",
      options: ["pending", "paid", "failed"],
      defaultValue: "pending",
    },
    {
      name: "paymentMethod",
      type: "text",
    },
    {
      name: "shippingAddress",
      type: "group",
      required: true,
      fields: [
        { name: "firstName", type: "text" },
        { name: "lastName", type: "text" },
        { name: "street", type: "text", required: true },
        { name: "city", type: "text", required: true },
        { name: "state", type: "text" },
        { name: "country", type: "text", required: true },
        { name: "phone", type: "text" },
      ],
    },
    {
      name: "items",
      type: "array",
      minRows: 1,
      required: true,
      fields: [
        {
          name: "product",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.PRODUCTS as any,
          required: true,
        },
        { name: "productTitle", type: "text", admin: { readOnly: true } },
        {
          name: "vendor",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.VENDORS,
          admin: { readOnly: true },
        },
        { name: "quantity", type: "number", required: true, min: 1 },
        { name: "price", type: "number", admin: { readOnly: true } },
        { name: "total", type: "number", admin: { readOnly: true } },
        {
          name: "status",
          type: "select",
          options: ORDER_STATUS_VALUES,
          defaultValue: "pending",
        },
      ],
    },
    { name: "subtotal", type: "number", admin: { readOnly: true } },
    { name: "tax", type: "number", defaultValue: 0 },
    { name: "shippingCost", type: "number", defaultValue: 0 },
    { name: "total", type: "number", admin: { readOnly: true } },
    {
      name: "inventoryAdjusted",
      type: "checkbox",
      defaultValue: false,
      admin: { hidden: true },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || !req?.payload) return data
        const payload = req.payload
        if (!Array.isArray(data.items) || data.items.length === 0) return data

        let subtotal = 0
        for (const item of data.items) {
          const productId = resolveRelationId(item.product)
          if (!productId) continue

          const product = await payload.findByID({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            depth: 0,
            overrideAccess: true,
          })

          if (!product) throw new Error(`Product ${productId} not found.`)

          const qty = toQuantity(item.quantity)
          const price = toPositiveNumber(item.price, product.pricing?.price || 0)
          const lineTotal = price * qty
          subtotal += lineTotal

          item.total = lineTotal
          item.productTitle = product.title
        }

        data.subtotal = subtotal
        data.total = subtotal + toPositiveNumber(data.tax) + toPositiveNumber(data.shippingCost)
        return data
      },
    ],
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        if (!data || !req?.payload) return data
        const payload = req.payload
        
        const nextStatus = data.orderStatus ?? originalDoc?.orderStatus ?? "pending"
        const prevStatus = originalDoc?.orderStatus
        const alreadyAdjusted = originalDoc?.inventoryAdjusted ?? false

        // 🔥 1. RESTOCK LOGIC: If cancelling an order that already took stock
        if (nextStatus === 'canceled' && alreadyAdjusted) {
          const items = originalDoc?.items ?? []
          for (const item of items) {
            const productId = resolveRelationId(item.product)
            if (!productId) continue
            const product = await payload.findByID({
              collection: COLLECTION_SLUGS.PRODUCTS,
              id: productId,
              depth: 0,
            })
            await payload.update({
              collection: COLLECTION_SLUGS.PRODUCTS,
              id: productId,
              data: {
                inventory: {
                  ...product.inventory,
                  quantity: (product?.inventory?.quantity ?? 0) + toQuantity(item.quantity),
                },
              },
            })
          }
          data.inventoryAdjusted = false // Reset flag
          return data
        }

        // 2. DEDUCTION LOGIC: (Your existing code)
        const shouldAdjust = STOCK_CONFIRMATION_STATUSES.has(nextStatus) && !alreadyAdjusted
        if (!shouldAdjust) return data

        const items = data.items || originalDoc?.items || []
        for (const item of items) {
          const productId = resolveRelationId(item.product)
          if (!productId) continue

          const product = await payload.findByID({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            depth: 0,
            overrideAccess: true,
          })

          const currentQty = product?.inventory?.quantity ?? 0
          const orderQty = toQuantity(item.quantity)

          await payload.update({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            data: {
              inventory: {
                ...product.inventory,
                quantity: Math.max(0, currentQty - orderQty),
              },
            },
            overrideAccess: true,
          })
        }

        data.inventoryAdjusted = true
        return data
      },
    ],
  },
}

export default Orders