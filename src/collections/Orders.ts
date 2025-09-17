import type { CollectionConfig } from "payload"
import { COLLECTION_SLUGS } from "./shared-types"

const Orders: CollectionConfig = {
  slug: "orders",
  admin: {
    useAsTitle: "orderNumber",
  },
  fields: [
    {
      name: "orderNumber",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "customer",
      type: "relationship",
      relationTo: COLLECTION_SLUGS.CUSTOMERS as any,
      required: true,
    },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Processing", value: "processing" },
        { label: "Shipped", value: "shipped" },
        { label: "Delivered", value: "delivered" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" },
      ],
      defaultValue: "pending",
    },
    {
      name: "items",
      type: "array",
      fields: [
        {
          name: "product",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.PRODUCTS as any,
          required: true,
        },
        {
          name: "vendor",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.VENDORS,
          required: true,
        },
        {
          name: "quantity",
          type: "number",
          required: true,
          min: 1,
        },
        {
          name: "price",
          type: "number",
          required: true,
        },
        {
          name: "total",
          type: "number",
          required: true,
        },
        {
          name: "status",
          type: "select",
          options: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
          defaultValue: "pending",
        },
      ],
    },
    {
      name: "shippingAddress",
      type: "group",
      fields: [
        { name: "firstName", type: "text", required: true },
        { name: "lastName", type: "text", required: true },
        { name: "street", type: "text", required: true },
        { name: "city", type: "text", required: true },
        { name: "state", type: "text" },
        { name: "zipCode", type: "text", required: true },
        { name: "country", type: "text", required: true },
        { name: "phone", type: "text" },
      ],
    },
    {
      name: "billingAddress",
      type: "group",
      fields: [
        { name: "firstName", type: "text" },
        { name: "lastName", type: "text" },
        { name: "street", type: "text" },
        { name: "city", type: "text" },
        { name: "state", type: "text" },
        { name: "zipCode", type: "text" },
        { name: "country", type: "text" },
      ],
    },
    {
      name: "totals",
      type: "group",
      fields: [
        { name: "subtotal", type: "number", required: true },
        { name: "tax", type: "number", defaultValue: 0 },
        { name: "shipping", type: "number", defaultValue: 0 },
        { name: "discount", type: "number", defaultValue: 0 },
        { name: "total", type: "number", required: true },
      ],
    },
    {
      name: "paymentStatus",
      type: "select",
      options: ["pending", "paid", "failed", "refunded"],
      defaultValue: "pending",
    },
    {
      name: "paymentMethod",
      type: "text",
    },
    {
      name: "notes",
      type: "textarea",
    },
    {
      name: "trackingNumber",
      type: "text",
    },
  ],
}

export default Orders