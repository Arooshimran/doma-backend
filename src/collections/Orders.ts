import type { CollectionConfig } from "payload"
import { isAdmin } from "@/lib/access-helpers"
import { COLLECTION_SLUGS } from "./shared-types"

const ORDER_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
] as Array<{ label: string; value: string }>

const ORDER_STATUS_VALUES = ORDER_STATUS_OPTIONS.map((status) => status.value)

const STOCK_CONFIRMATION_STATUSES = new Set(["paid", "processing", "shipped", "delivered"])

const getCustomerAccessFilter = (req: any) => {
  const user = req?.user as any
  if (user?.collection === COLLECTION_SLUGS.CUSTOMERS) {
    return { customer: { equals: user.id } }
  }
  return false
}

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
      // Allow admins to delete orders
      if (isAdmin({ req })) return true
      return false
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
      name: "paymentId",
      type: "text",
      admin: {
        description: "Gateway transaction ID or reference",
      },
    },
    {
      name: "shippingAddress",
      type: "group",
      required: true,
      fields: [
        { name: "firstName", type: "text", required: true },
        { name: "lastName", type: "text", required: true },
        { name: "street", type: "text", required: true },
        { name: "city", type: "text", required: true },
        { name: "state", type: "text" },
        { name: "country", type: "text", required: true },
        { name: "phone", type: "text" },
        // { name: "postalCode", type: "text" },
      ],
    },
    {
      name: "billingAddress",
      type: "group",
      admin: { description: "Optional - defaults to shipping address" },
      fields: [
        { name: "firstName", type: "text" },
        { name: "lastName", type: "text" },
        { name: "street", type: "text" },
        { name: "city", type: "text" },
        { name: "state", type: "text" },
        { name: "country", type: "text" },
        // { name: "postalCode", type: "text" },
      ],
    },
    {
      name: "items",
      type: "array",
      minRows: 1,
      labels: { singular: "Item", plural: "Items" },
      required: true,
      fields: [
        {
          name: "product",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.PRODUCTS as any,
          required: true,
        },
        {
          name: "productTitle",
          type: "text",
          admin: { readOnly: true },
        },
        {
          name: "vendor",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.VENDORS,
          admin: {
            readOnly: true,
            description: "Auto-filled from selected product",
          },
        },
        {
          name: "quantity",
          type: "number",
          required: true,
          min: 1,
        },
        {
          name: "price",
          label: "Unit Price (at purchase)",
          type: "number",
          admin: {
            readOnly: true,
            description: "Auto-filled from product pricing at time of purchase",
          },
        },
        {
          name: "total",
          label: "Line Total",
          type: "number",
          admin: { readOnly: true },
        },
        {
          name: "status",
          type: "select",
          options: ORDER_STATUS_VALUES,
          defaultValue: "pending",
        },
      ],
    },
    {
      name: "subtotal",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: "tax",
      type: "number",
      defaultValue: 0,
    },
    {
      name: "shippingCost",
      label: "Shipping Cost",
      type: "number",
      defaultValue: 0,
    },
    {
      name: "total",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: "totals",
      label: "Legacy totals (auto-managed)",
      type: "group",
      admin: { readOnly: true, description: "Kept for backwards compatibility" },
      fields: [
        { name: "subtotal", type: "number" },
        { name: "tax", type: "number" },
        { name: "shipping", type: "number" },
        { name: "discount", type: "number" },
        { name: "total", type: "number" },
      ],
    },
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
        if (!Array.isArray(data.items) || data.items.length === 0) {
          if (operation === "create") {
            throw new Error("An order must contain at least one item.")
          }
          return data
        }

        const productCache = new Map<string, any>()
        let subtotal = 0

        const normalizedItems = []
        for (const rawItem of data.items) {
          const productId = resolveRelationId(rawItem.product)
          if (!productId) {
            throw new Error("Each order item must reference a product.")
          }

          if (!productCache.has(productId)) {
            const product = await payload.findByID({
              collection: COLLECTION_SLUGS.PRODUCTS,
              id: productId,
              depth: 0,
              overrideAccess: true,
            })
            productCache.set(productId, product)
          }

          const product = productCache.get(productId)
          if (!product) {
            throw new Error(`Product ${productId} could not be found.`)
          }

          const quantity = toQuantity(rawItem.quantity)
          const currentStock = product?.inventory?.quantity ?? 0
          if (currentStock < quantity) {
            throw new Error(`Insufficient stock for ${product.title || "product"}.`)
          }

          const priceFromProduct =
            product?.pricing?.discountedPrice ?? product?.pricing?.price ?? 0
          const unitPrice = toPositiveNumber(
            rawItem.price ?? rawItem.priceAtPurchase ?? rawItem.unitPrice ?? priceFromProduct,
            priceFromProduct,
          )
          const lineTotal = Number((unitPrice * quantity).toFixed(2))

          subtotal += lineTotal
          normalizedItems.push({
            ...rawItem,
            product: productId,
            productTitle: rawItem.productTitle ?? product.title,
            vendor: rawItem.vendor ?? resolveRelationId(product.vendor) ?? null,
            quantity,
            price: unitPrice,
            total: lineTotal,
          })
        }

        const tax = toPositiveNumber(data.tax)
        const shippingCost = toPositiveNumber(data.shippingCost)
        const total = Number((subtotal + tax + shippingCost).toFixed(2))

        data.items = normalizedItems
        data.subtotal = Number(subtotal.toFixed(2))
        data.tax = Number(tax.toFixed(2))
        data.shippingCost = Number(shippingCost.toFixed(2))
        data.total = total
        data.totals = {
          subtotal: data.subtotal,
          tax: data.tax,
          shipping: data.shippingCost,
          discount: data.totals?.discount ?? 0,
          total: data.total,
        }

        return data
      },
    ],
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        if (!data || !req?.payload) return data

        const payload = req.payload
        const alreadyAdjusted = originalDoc?.inventoryAdjusted ?? false
        const nextStatus = data.orderStatus ?? originalDoc?.orderStatus ?? "pending"
        const shouldAdjust = STOCK_CONFIRMATION_STATUSES.has(nextStatus) && !alreadyAdjusted

        if (!shouldAdjust) {
          if (alreadyAdjusted && data.inventoryAdjusted === undefined) {
            data.inventoryAdjusted = true
          }
          return data
        }

        const itemsSource =
          (Array.isArray(data.items) && data.items.length > 0
            ? data.items
            : originalDoc?.items) ?? []

        if (itemsSource.length === 0) {
          throw new Error("Cannot confirm an order without any items.")
        }

        const productCache = new Map<string, any>()
        for (const item of itemsSource) {
          const productId = resolveRelationId(item.product)
          if (!productId) continue

          if (!productCache.has(productId)) {
            const product = await payload.findByID({
              collection: COLLECTION_SLUGS.PRODUCTS,
              id: productId,
              depth: 0,
              overrideAccess: true,
            })
            productCache.set(productId, product)
          }

          const product = productCache.get(productId)
          if (!product) continue

          const quantity = toQuantity(item.quantity)
          const currentStock = product?.inventory?.quantity ?? 0
          if (currentStock < quantity) {
            throw new Error(`Insufficient stock to confirm ${product.title || "product"}.`)
          }

          await payload.update({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            data: {
              inventory: {
                ...product.inventory,
                quantity: currentStock - quantity,
              },
            },
            overrideAccess: true,
            depth: 0,
          })
        }

        data.inventoryAdjusted = true
        return data
      },
    ],
  },
}

export default Orders