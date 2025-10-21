import type { CollectionConfig } from "payload"

const Customers: CollectionConfig = {
  slug: "customers",
  auth: false, 
  admin: {
    useAsTitle: "email",
  },
  
   access: {
    create: () => true,  // Allow public creation — only for registration or OAuth sync
    read: ({ req: { user } }) => !!user,  // only logged-in users can read
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => false,
  },
  fields: [
    {
      name: "googleId",
      type: "text",
      unique: true,
    },
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
    },
    { name: "firstName", type: "text" },
    { name: "lastName", type: "text" },
    { name: "phone", type: "text" },
    {
      name: "addresses",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "street", type: "text", required: true },
        { name: "city", type: "text", required: true },
        { name: "state", type: "text" },
        { name: "zipCode", type: "text", required: true },
        { name: "country", type: "text", required: true },
        { name: "isDefault", type: "checkbox", defaultValue: false },
      ],
    },
    {
      name: "status",
      type: "select",
      options: ["active", "suspended", "banned"],
      defaultValue: "active",
    },
  ],
}

export default Customers
