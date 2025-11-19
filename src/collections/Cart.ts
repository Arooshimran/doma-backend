import type { CollectionConfig, PayloadRequest } from "payload"
import { isAdmin } from "@/lib/access-helpers"
import { COLLECTION_SLUGS } from "./shared-types"
import {
  calculateLineTotal,
  getAvailableStock,
  getUnitPriceFromProduct,
  resolveRelationId,
  toQuantity,
} from "@/lib/cart-utils"
import type { CartItemInput, CartProduct, NormalizedCartItem } from "@/types/cart"

type RequestUser = {
  id?: string
  collection?: string
}

const getRequestUser = (req?: PayloadRequest | null): RequestUser | undefined => {
  return req?.user as RequestUser | undefined
}

const customerAccessFilter = (req?: PayloadRequest | null) => {
  const user = getRequestUser(req)
  if (user?.collection === COLLECTION_SLUGS.CUSTOMERS && user?.id) {
    return { userId: { equals: String(user.id) } }
  }
  return false
}

const Cart: CollectionConfig = {
  slug: COLLECTION_SLUGS.CARTS,
  admin: {
    useAsTitle: "userId",
  },
  access: {
    read: ({ req }) => {
      if (isAdmin({ req })) return true
      return customerAccessFilter(req)
    },
    create: ({ req }) => {
      if (isAdmin({ req })) return true
      const user = getRequestUser(req)
      return user?.collection === COLLECTION_SLUGS.CUSTOMERS
    },
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      return customerAccessFilter(req)
    },
    delete: ({ req }) => isAdmin({ req }),
  },
  fields: [
    {
      name: "userId",
      label: "Customer",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.CUSTOMERS,
      required: true,
      unique: true,
    },
    {
      name: "items",
      type: "array",
      labels: {
        singular: "Cart Item",
        plural: "Cart Items",
      },
      fields: [
        {
          name: "product",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.PRODUCTS,
          required: true,
        },
        {
          name: "quantity",
          type: "number",
          min: 1,
          required: true,
          defaultValue: 1,
        },
        {
          name: "unitPrice",
          label: "Unit Price",
          type: "number",
          admin: { readOnly: true },
        },
        {
          name: "lineTotal",
          type: "number",
          admin: { readOnly: true },
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
      name: "total",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data = {}, req }) => {
        const user = getRequestUser(req)
        if (!user) {
          return data
        }

        const isCustomer = user.collection === COLLECTION_SLUGS.CUSTOMERS
        if (isCustomer) {
          return {
            ...data,
            userId: String(user.id),
          }
        }

        return data
      },
      async ({ data = {}, originalDoc, req }) => {
        const payload = req?.payload
        if (!payload) {
          return data
        }

        const sourceItems: CartItemInput[] = Array.isArray(data.items)
          ? data.items
          : Array.isArray(originalDoc?.items)
            ? originalDoc.items
            : []

        if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
          data.items = []
          data.subtotal = 0
          data.total = 0
          return data
        }

        const productCache = new Map<string, CartProduct | null>()
        const normalizedItems: NormalizedCartItem[] = []
        let subtotal = 0

        for (const rawItem of sourceItems) {
          const productId = resolveRelationId(rawItem.product)
          if (!productId) {
            continue
          }

          if (!productCache.has(productId)) {
            const product = await payload
              .findByID({
                collection: COLLECTION_SLUGS.PRODUCTS,
                id: productId,
                depth: 0,
                overrideAccess: true,
              })
              .catch(() => null)
            productCache.set(productId, product)
          }

          const product = productCache.get(productId)
          if (!product) {
            continue
          }

          const availableStock = getAvailableStock(product)
          if (availableStock <= 0) {
            continue
          }

          const requestedQty = toQuantity(rawItem.quantity, 1)
          const quantity = Math.min(requestedQty, availableStock)
          if (quantity <= 0) {
            continue
          }

          const unitPrice = getUnitPriceFromProduct(product)
          const lineTotal = calculateLineTotal(unitPrice, quantity)

          normalizedItems.push({
            product: productId,
            quantity,
            unitPrice,
            lineTotal,
          })
          subtotal += lineTotal
        }

        data.items = normalizedItems
        data.subtotal = Number(subtotal.toFixed(2))
        data.total = data.subtotal
        return data
      },
    ],
  },
}

export default Cart

