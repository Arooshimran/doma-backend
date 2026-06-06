import type { CollectionConfig, PayloadRequest, Access } from "payload"
import { isAdmin } from "@/lib/access-helpers"
import { COLLECTION_SLUGS } from "./shared-types"

const resolveRelationId = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (typeof value === "object") {
    if ("value" in value && value.value != null) return String(value.value)
    if ("id" in value && value.id != null) return String(value.id)
  }
  return null
}

const customerAccessFilter = (req: PayloadRequest) => {
  const user = req?.user
  if (user?.collection === COLLECTION_SLUGS.CUSTOMERS && user?.id) {
    return { customer: { equals: String(user.id) } }
  }
  return false
}

const Reviews: CollectionConfig = {
  slug: COLLECTION_SLUGS.REVIEWS,
  admin: {
    useAsTitle: "title",
    defaultColumns: ["product", "customer", "rating", "verifiedPurchase", "createdAt"],
  },
  access: {
    read: () => true,
    create: ({ req }) => req?.user?.collection === COLLECTION_SLUGS.CUSTOMERS,
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      return customerAccessFilter(req)
    },
    delete: ({ req }) => {
      if (isAdmin({ req })) return true
      return customerAccessFilter(req)
    },
  },
  fields: [
    {
      name: "product",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.PRODUCTS,
      required: true,
    },
    {
      name: "customer",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.CUSTOMERS,
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "rating",
      type: "number",
      required: true,
      min: 1,
      max: 5,
    },
    {
      name: "title",
      type: "text",
    },
    {
      name: "description",
      type: "textarea",
      required: true,
    },
    {
      name: "images",
      label: "Review Images",
      type: "array",
      maxRows: 5,
      admin: {
        description: "Upload up to 5 images for your review.",
      },
      fields: [
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          required: true,
        },
      ],
    },
    {
      name: "verifiedPurchase",
      type: "checkbox",
      defaultValue: false,
      admin: { readOnly: true },
    },
    {
      name: "helpfulCount",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || !req?.payload) return data
        const payload = req.payload
        const user = req.user

        if (operation === "create" && user?.collection === COLLECTION_SLUGS.CUSTOMERS) {
          data.customer = user.id
        }

        const productId = resolveRelationId(data.product)
        const customerId = resolveRelationId(data.customer)

        if (!productId || !customerId) return data

        if (operation === "create") {
          const existingReview = await payload.find({
            collection: COLLECTION_SLUGS.REVIEWS,
            where: {
              and: [
                { product: { equals: productId } },
                { customer: { equals: customerId } },
              ],
            },
            limit: 1,
          })
          if (existingReview.totalDocs > 0) {
            throw new Error("You have already reviewed this product.")
          }
        }

        try {
          const orders = await payload.find({
            collection: COLLECTION_SLUGS.ORDERS,
            where: {
              and: [
                { customer: { equals: customerId } },
                { orderStatus: { in: ["paid", "processing", "shipped", "delivered"] } },
              ],
            },
            depth: 0,
            overrideAccess: true,
          })

          let hasPurchased = false
          for (const order of orders.docs) {
            if (Array.isArray(order.items)) {
              hasPurchased = order.items.some(item => resolveRelationId(item.product) === productId)
            }
            if (hasPurchased) break
          }

          if (operation === "create" && user?.collection === COLLECTION_SLUGS.CUSTOMERS && !hasPurchased) {
            throw new Error("You can only review products you have purchased and paid for.")
          }

          data.verifiedPurchase = hasPurchased
        } catch (error: any) {
          if (error.message.includes("You can only review")) throw error
          data.verifiedPurchase = false
        }

        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        const productId = resolveRelationId(doc.product)
        if (productId) await updateProductRating(req.payload, productId)
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const productId = resolveRelationId(doc.product)
        if (productId) await updateProductRating(req.payload, productId)
      },
    ],
  },
}

async function updateProductRating(payload: any, productId: string) {
  try {
    const reviews = await payload.find({
      collection: COLLECTION_SLUGS.REVIEWS,
      where: { product: { equals: productId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })

    const count = reviews.docs.length
    const average = count > 0
      ? Number((reviews.docs.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / count).toFixed(2))
      : 0

    await payload.update({
      collection: COLLECTION_SLUGS.PRODUCTS,
      id: productId,
      data: {
        rating: { average, count },
      },
      overrideAccess: true,
    })
  } catch (e) {
    console.error("Rating Sync Error:", e)
  }
}

export default Reviews