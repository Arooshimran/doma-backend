import type { CollectionConfig } from "payload"

const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
  },
  auth: true,
  fields: [
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
    },
    {
      name: "firstName",
      type: "text",
      required: true,
    },
    {
      name: "lastName",
      type: "text",
      required: true,
    },
    {
      name: "role",
      type: "select",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Super Admin", value: "super-admin" },
      ],
      defaultValue: "admin",
      required: true,
    },
  ],
  access: {
    create: ({ req }) => req.user?.role === "super-admin",
    read: ({ req }) => !!req.user,
    update: ({ req }) => {
      if (req.user?.role === "super-admin") return true
      return { id: { equals: req.user?.id } }
    },
    delete: ({ req }) => req.user?.role === "super-admin",
  },
}

export default Users
