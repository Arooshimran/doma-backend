import type { CollectionConfig, PayloadRequest } from "payload"
import { COLLECTION_SLUGS } from "./shared-types"
import { isAdmin } from "@/lib/access-helpers"

const getCustomerFilter = (req?: PayloadRequest | null) => {
  if (!req) {
    return false
  }
  const user = req.user
  if (user?.collection === COLLECTION_SLUGS.CUSTOMERS && user.id) {
    return { customer: { equals: user.id } }
  }
  if (isAdmin({ req })) {
    return true
  }
  return false
}

const Wishlist: CollectionConfig = {
  slug: COLLECTION_SLUGS.WISHLISTS,
  admin: {
    useAsTitle: "customer",
    description: "Stores the list of products a customer has saved",
  },
  access: {
    read: ({ req }) => getCustomerFilter(req),
    create: ({ req }) => getCustomerFilter(req),
    update: ({ req }) => getCustomerFilter(req),
    delete: ({ req }) => isAdmin({ req }),
  },
  timestamps: true,
  fields: [
    {
      name: "customer",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.CUSTOMERS,
      required: true,
      unique: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: "products",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.PRODUCTS,
      hasMany: true,
      required: false,
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data = {}, req }) => {
        const user = req?.user
        if (user?.collection === COLLECTION_SLUGS.CUSTOMERS && user.id) {
          return {
            ...data,
            customer: user.id,
          }
        }
        return data
      },
    ],
  },
}

export default Wishlist



