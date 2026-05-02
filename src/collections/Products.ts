import type { CollectionConfig } from "payload"
import { isAdmin, isAdminOrVendor } from "@/lib/access-helpers"
import { generate3DModel } from "@/lib/generate3D"

const Products: CollectionConfig = {
  slug: "products",
  admin: {
    useAsTitle: "title",
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.title && !data?.slug) {
          data.slug = (data.title as string)
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-+|-+$/g, "")
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== "create") return doc
        // if (!doc.featured) return doc  

        const firstImage = doc.images?.[0]?.image
        let imageUrl: string | undefined

        if (typeof firstImage === "object" && firstImage?.url) {
          imageUrl = firstImage.url
        } else if (typeof firstImage === "string") {
          const media = await req.payload.findByID({
            collection: "media",
            id: firstImage,
          })
          imageUrl = media?.url ?? undefined      
        }

        if (!imageUrl) {
          console.warn(
            `Product ${doc.id} created with no image — skipping 3D generation`
          )
          return doc
        }

        generate3DModel({
          productId: doc.id,
          imageUrl,
          payload: req.payload,
        }).catch((err) => console.error("3D generation hook error:", err))

        return doc
      },
    ],
  },
  access: {
    read: () => true,
    create: isAdminOrVendor,
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      if (req.user?.collection === "vendors") {
        return { vendor: { equals: req.user.id } }
      }
      return false
    },
    delete: ({ req }) => {
      if (isAdmin({ req })) return true
      if (req.user?.collection === "vendors") {
        return { vendor: { equals: req.user.id } }
      }
      return false
    },
  },
  fields: [
    // ─── Basic Info ───────────────────────────────────────────────
    {
      name: "title",
      label: "Product Name",
      type: "text",
      required: true,
      admin: {
        description: "Enter the name of the product.",
      },
    },
    {
      name: "slug",
      label: "Product URL Slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description:
          "Used in the product URL (e.g., yourstore.com/products/this-slug). Auto-generated from title.",
      },
    },
    {
      name: "Description",
      label: "Short Description",
      type: "textarea",
      admin: {
        description: "A brief summary of the product.",
      },
    },

    // ─── Pricing ──────────────────────────────────────────────────
    {
      type: "group",
      name: "pricing",
      label: "Pricing Details",
      fields: [
        {
          name: "price",
          label: "Original Price",
          type: "number",
          required: true,
          min: 0,
        },
        {
          name: "discountedPrice",
          label: "Discounted Price (optional)",
          type: "number",
          min: 0,
          admin: {
            description:
              "Show discount by adding original price (e.g., 500 crossed out).",
          },
        },
      ],
    },

    // ─── Rating ───────────────────────────────────────────────────
    {
      type: "group",
      name: "rating",
      label: "Product Rating",
      admin: {
        readOnly: true,
        description: "Automatically calculated from approved reviews",
      },
      fields: [
        {
          name: "average",
          label: "Average Rating",
          type: "number",
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: "Average rating from 1-5 stars",
          },
        },
        {
          name: "count",
          label: "Total Reviews",
          type: "number",
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: "Number of approved reviews",
          },
        },
      ],
    },

    // ─── Inventory ────────────────────────────────────────────────
    {
      type: "group",
      name: "inventory",
      label: "Inventory",
      fields: [
        {
          name: "quantity",
          label: "Available Quantity",
          type: "number",
          defaultValue: 0,
        },
        {
          name: "lowStockThreshold",
          label: "Low Stock Warning At",
          type: "number",
          defaultValue: 5,
        },
      ],
    },

    // ─── Media ────────────────────────────────────────────────────
    {
      name: "images",
      label: "Product Images",
      type: "array",
      fields: [
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          required: true,
        },
        {
          name: "alt",
          label: "Image Alt Text",
          type: "text",
        },
      ],
    },
    {
      name: "threeDModel",
      label: "3D Model (optional manual upload)",
      type: "upload",
      relationTo: "media",
      filterOptions: {
        mimeType: { contains: "model" },
      },
      admin: {
        description: "Upload a 3D model file manually if needed.",
      },
    },

    // ─── Auto-generated 3D Model ──────────────────────────────────
    {
      name: "model3dUrl",
      label: "3D Model URL (Auto-generated)",
      type: "text",
      admin: {
        readOnly: true,
        description:
          "Auto-generated GLB file URL. Populated automatically after product creation (~30-40 min).",
      },
    },
    {
      name: "model3dStatus",
      label: "3D Generation Status",
      type: "select",
      defaultValue: "none",
      options: [
        { label: "Not Generated", value: "none" },
        { label: "Processing", value: "processing" },
        { label: "Ready", value: "ready" },
        { label: "Failed", value: "failed" },
      ],
      admin: {
        readOnly: true,
        description: "Tracks the status of the auto 3D model generation.",
      },
    },
    {
      name: "model3dGeneratedAt",
      label: "3D Model Generated At",
      type: "date",
      admin: {
        readOnly: true,
        description: "Timestamp of when the 3D model was successfully generated.",
      },
    },

    // ─── Other ────────────────────────────────────────────────────
    {
      name: "category",
      label: "Category",
      type: "relationship",
      relationTo: "categories",
      admin: {
        description: "Choose the most relevant category.",
      },
    },
    {
      name: "specifications",
      label: "Product Features",
      type: "array",
      fields: [
        { name: "name", label: "Feature Name", type: "text", required: true },
        { name: "value", label: "Feature Value", type: "text", required: true },
      ],
    },
    {
      name: "status",
      label: "Product Status",
      type: "select",
      options: [
        { label: "Draft (Hidden)", value: "draft" },
        { label: "Published (Visible)", value: "published" },
        { label: "Pending Review", value: "pending" },
        { label: "Rejected", value: "rejected" },
        { label: "Out of Stock", value: "out-of-stock" },
      ],
      defaultValue: "draft",
    },
    {
      name: "featured",
      label: "Mark as Featured",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "vendor",
      type: "relationship",
      relationTo: "vendors",
      required: true,
      admin: {
        readOnly: true,
        description:
          "Automatically assigned to the vendor who created this product",
      },
      hooks: {
        beforeChange: [
          ({ req, operation }) => {
            if (operation === "create" && req.user) {
              return req.user.id
            }
          },
        ],
      },
    },
    {
      name: "size",
      type: "select",
      required: false,
      options: [
        { label: "Small", value: "S" },
        { label: "Medium", value: "M" },
        { label: "Large", value: "L" },
        { label: "Extra Large", value: "XL" },
      ],
      admin: {
        isClearable: true,
      },
    },
    {
      name: "colors",
      label: "Colors",
      type: "array",
      required: false,
      fields: [
        {
          name: "color",
          type: "text",
          label: "Color",
        },
      ],
    },
  ],
}

export default Products