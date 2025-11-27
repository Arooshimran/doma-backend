import type { CollectionConfig, PayloadRequest } from "payload"
import { isAdmin } from "@/lib/access-helpers"
import { COLLECTION_SLUGS } from "./shared-types"

type RequestUser = {
  id?: string
  collection?: string
}

const getRequestUser = (req?: PayloadRequest | null): RequestUser | undefined => {
  return req?.user as RequestUser | undefined
}

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

const customerAccessFilter = (req?: PayloadRequest | null) => {
  const user = getRequestUser(req)
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
    read: () => true, // All reviews are publicly readable
    create: ({ req }) => {
      // Admins can create reviews, authenticated customers can create reviews
      // Purchase verification is enforced in beforeValidate hook
      // if (isAdmin({ req })) return true
      const user = getRequestUser(req)
      return user?.collection === COLLECTION_SLUGS.CUSTOMERS
    },
    update: ({ req }) => {
      // Admins can update all
      if (isAdmin({ req })) return true
      // Customers can only update their own reviews (which are for products they purchased)
      return customerAccessFilter(req)
    },
    delete: ({ req }) => {
      // Admins can delete all
      if (isAdmin({ req })) return true
      // Customers can only delete their own reviews (which are for products they purchased)
      return customerAccessFilter(req)
    },
  },
  fields: [
    {
      name: "product",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.PRODUCTS,
      required: true,
      admin: {
        description: "The product being reviewed",
      },
    },
    {
      name: "customer",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.CUSTOMERS,
      required: true,
      admin: {
        description: "Auto-filled for customers, admins can select any customer",
      },
      hooks: {
        beforeChange: [
          ({ value, req, operation }) => {
            // For customers, auto-fill their own ID
            const user = getRequestUser(req)
            if (operation === "create" && user?.collection === COLLECTION_SLUGS.CUSTOMERS && user?.id) {
              return String(user.id)
            }
            // For admins, allow them to set any customer
            return value
          },
        ],
      },
    },
    {
      name: "rating",
      type: "number",
      required: true,
      min: 1,
      max: 5,
      admin: {
        description: "Rating from 1 to 5 stars",
      },
    },
    {
      name: "title",
      type: "text",
      admin: {
        description: "Review title/headline",
      },
    },
    {
      name: "description",
      type: "textarea",
      required: true,
      admin: {
        description: "Detailed review text",
      },
    },
    {
      name: "verifiedPurchase",
      type: "checkbox",
      defaultValue: false,
      admin: {
        readOnly: true,
        description: "Automatically set to true if customer has purchased this product",
      },
    },
    {
      name: "helpfulCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
        description: "Number of users who found this review helpful",
      },
    },
    {
      name: "reportedCount",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Number of times this review has been reported",
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || !req?.payload) return data

        const payload = req.payload
        const user = getRequestUser(req)

        // Auto-fill customer from authenticated user (only for customers, not admins)
        if (operation === "create" && user?.collection === COLLECTION_SLUGS.CUSTOMERS && user?.id && !data.customer) {
          data.customer = String(user.id)
        }

        // Verify purchase and set verifiedPurchase
        const productId = resolveRelationId(data.product)
        const customerId = resolveRelationId(data.customer ?? user?.id)

        if (productId && customerId) {
          try {
            // Check if customer has any completed orders containing this product
            const orders = await payload.find({
              collection: COLLECTION_SLUGS.ORDERS,
              where: {
                and: [
                  { customer: { equals: customerId } },
                  { orderStatus: { in: ["paid", "processing", "shipped", "delivered"] } },
                ],
              },
              limit: 100,
              depth: 0,
              overrideAccess: true,
            })

            let hasPurchased = false
            for (const order of orders.docs) {
              if (Array.isArray(order.items)) {
                for (const item of order.items) {
                  const itemProductId = resolveRelationId(item.product)
                  if (itemProductId === productId) {
                    hasPurchased = true
                    break
                  }
                }
              }
              if (hasPurchased) break
            }

            // For customers (not admins), require purchase verification before allowing review creation
            if (operation === "create" && user?.collection === COLLECTION_SLUGS.CUSTOMERS && !hasPurchased) {
              throw new Error("You can only review products you have purchased. Please purchase this product first.")
            }

            data.verifiedPurchase = hasPurchased
          } catch (error) {
            // If it's our custom error, re-throw it
            if (error instanceof Error && error.message.includes("You can only review products")) {
              throw error
            }
            console.error("Error verifying purchase:", error)
            // For customers creating reviews, if we can't verify purchase, prevent creation
            if (operation === "create" && user?.collection === COLLECTION_SLUGS.CUSTOMERS) {
              throw new Error("Unable to verify purchase. You can only review products you have purchased.")
            }
            data.verifiedPurchase = false
          }
        } else if (operation === "create" && user?.collection === COLLECTION_SLUGS.CUSTOMERS) {
          // If product or customer ID is missing for customer creation, prevent it
          throw new Error("Product and customer information is required to create a review.")
        }

        return data
      },
    ],
    afterChange: [
      async ({ doc, req, operation }) => {
        if (!doc || !req?.payload) return

        const payload = req.payload
        const productId = resolveRelationId(doc.product)

        if (!productId) return

        // Recalculate product average rating when review status changes
        await updateProductRating(payload, productId)
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Recalculate when review is deleted
        if (!doc?.product || !req?.payload) return

        const payload = req.payload
        const productId = resolveRelationId(doc.product)
        if (productId) {
          await updateProductRating(payload, productId)
        }
      },
    ],
  },
}

async function updateProductRating(payload: any, productId: string) {
  try {
    // Get all reviews for this product
    const reviews = await payload.find({
      collection: COLLECTION_SLUGS.REVIEWS,
      where: {
        product: { equals: productId },
      },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })

    if (reviews.docs.length === 0) {
      // No reviews, reset rating
      await payload.update({
        collection: COLLECTION_SLUGS.PRODUCTS,
        id: productId,
        data: {
          rating: {
            average: 0,
            count: 0,
          },
        },
        overrideAccess: true,
        depth: 0,
      })
      return
    }

    // Calculate average rating from all reviews
    const totalRating = reviews.docs.reduce((sum: number, review: any) => sum + (review.rating || 0), 0)
    const averageRating = Number((totalRating / reviews.docs.length).toFixed(2))
    const reviewCount = reviews.docs.length

    // Update product with new rating
    await payload.update({
      collection: COLLECTION_SLUGS.PRODUCTS,
      id: productId,
      data: {
        rating: {
          average: averageRating,
          count: reviewCount,
        },
      },
      overrideAccess: true,
      depth: 0,
    })
  } catch (error) {
    console.error("Error updating product rating:", error)
  }
}

export default Reviews

