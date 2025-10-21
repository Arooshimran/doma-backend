import type { CollectionConfig } from "payload"

const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "isActive", "sortOrder"],
  },
  access: {
    read: () => true, // Public read access
    create: ({ req }) => {
      // Only admins can create categories
      return req.user?.collection === "users"
    },
    update: ({ req }) => {
      // Only admins can update categories
      return req.user?.collection === "users"
    },
    delete: ({ req }) => {
      // Only admins can delete categories
      return req.user?.collection === "users"
    },
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: "The display name of the category",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL-friendly version of the name",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Brief description of the category",
      },
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Category image/icon",
      },
    },
    {
      name: "parent",
      type: "relationship",
      relationTo: "categories",
      admin: {
        description: "Parent category for creating hierarchical structure",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Whether this category is active and should appear in dropdowns",
      },
    },
    {
      name: "sortOrder",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Order in which categories should be displayed",
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (operation === 'create' || operation === 'update') {
          if (data?.name && !data?.slug) {
            data.slug = data.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)+/g, '');
          }
        }
      },
    ],
  },
}

export default Categories