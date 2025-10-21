import type { CollectionConfig } from "payload"
import { isSuperAdmin, isAuthenticated, ownRecord } from "@/lib/access-helpers"

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
    create: isSuperAdmin,
    read: isAuthenticated,
    update: ({ req }) => {
      if (isSuperAdmin({ req })) return true
      return ownRecord({ req })
    },
    delete: isSuperAdmin,
  },
}

export default Users
