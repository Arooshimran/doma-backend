import type { CollectionConfig } from "payload"
import { slateEditor } from "@payloadcms/richtext-slate"
import { isAdmin, isAdminOrVendor, ownRecord } from "@/lib/access-helpers"

const Products: CollectionConfig = {
  slug: "products",
  admin: {
    useAsTitle: "title",
  },
  access: {
    read: () => true, // Public read access
    create: isAdminOrVendor, // Only admins and vendors can create
    update: ({ req }) => {
      // Admins can update any product, vendors can update their own
      if (isAdmin({ req })) return true
      if (req.user?.collection === "vendors") {
        return { vendor: { equals: req.user.id } }
      }
      return false
    },
    delete: ({ req }) => {
      // Admins can delete any product, vendors can delete their own
      if (isAdmin({ req })) return true
      if (req.user?.collection === "vendors") {
        return { vendor: { equals: req.user.id } }
      }
      return false
    },
  },
  fields: [
    // Product Info
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
        description: "This will be used in the product URL (e.g., yourstore.com/products/this-slug).",
      },
    },
    {
      name: "shortDescription",
      label: "Short Description",
      type: "textarea",
      admin: {
        description: "A brief summary of the product.",
      },
    },
    {
      name: "description",
      label: "Full Description",
      type: "richText",
      editor: slateEditor({}),
      admin: {
        description: "Detailed product description.",
      },
    },

    // Pricing
    {
      type: "group",
      name: "pricing",
      label: "Pricing Details",
      fields: [
        {
          name: "price",
          label: "Selling Price",
          type: "number",
          required: true,
          min: 0,
        },
        {
          name: "comparePrice",
          label: "Original Price (optional)",
          type: "number",
          min: 0,
          admin: {
            description: "Show discount by adding original price (e.g., 500 crossed out).",
          },
        },
        {
          name: "cost",
          label: "Cost Price (private)",
          type: "number",
          min: 0,
          admin: {
            description: "Only visible to admins. Not shown to customers.",
          },
        },
      ],
    },

    // Stock
    {
      type: "group",
      name: "inventory",
      label: "Inventory",
      fields: [
        {
          name: "trackQuantity",
          label: "Track Stock?",
          type: "checkbox",
          defaultValue: true,
        },
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

    // Media
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
      label: "3D Model (optional)",
      type: "upload",
      relationTo: "media",
      filterOptions: {
        mimeType: { contains: "model" },
      },
      admin: {
        description: "Upload a 3D model file if available.",
      },
    },

    // Classification
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
      name: "tags",
      label: "Tags (optional)",
      type: "array",
      fields: [
        {
          name: "tag",
          type: "text",
        },
      ],
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
      name: "dimensions",
      label: "Dimensions",
      type: "group",
      fields: [
        { name: "length", type: "number" },
        { name: "width", type: "number" },
        { name: "height", type: "number" },
        { name: "weight", type: "number" },
        {
          name: "unit",
          type: "select",
          options: ["cm", "inch", "mm"],
        },
      ],
    },

    // Visibility & Status
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

    // SEO (Hidden by default or for advanced users)
    {
      name: "seo",
      label: "Search Engine Optimization (SEO)",
      type: "group",
      fields: [
        { name: "metaTitle", type: "text" },
        { name: "metaDescription", type: "textarea" },
        { name: "keywords", type: "text" },
      ],
      admin: {
        condition: () => false, // hide unless you want vendors to edit SEO
      },
    },

    // Hidden Vendor ID - set automatically
    {
      name: "vendor",
      type: "relationship",
      relationTo: "vendors",
      required: true,
      admin: { hidden: true },
      hooks: {
        beforeChange: [
          ({ req, operation }) => {
            if (operation === "create" && req.user) {
              return req.user.id;
            }
          },
        ],
      },
    },

    {
      name: "sku",
      label: "SKU Code (optional)",
      type: "text",
      unique: true,
      admin: {
        description: "Stock Keeping Unit - useful if you track SKUs.",
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
    isClearable: true, // allows deselecting
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
}


  ],
}

export default Products
