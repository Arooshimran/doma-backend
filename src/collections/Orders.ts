import type { CollectionConfig, Access } from "payload"
import { isAdmin } from "@/lib/access-helpers"
import { COLLECTION_SLUGS } from "./shared-types"

const ORDER_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Canceled", value: "canceled" },
] as Array<{ label: string; value: string }>

const ORDER_STATUS_VALUES = ORDER_STATUS_OPTIONS.map((status) => status.value)

// 🔥 UPDATED: Added "pending" to trigger stock deduction immediately on Order Placement
const STOCK_CONFIRMATION_STATUSES = new Set(["pending", "paid", "processing", "shipped", "delivered"])

// 🔥 FIXED: Now accepts 'req' directly to match the call in access hooks
const getCustomerAccessFilter = (req: any) => {
  const user = req?.user as any
  if (user?.collection === COLLECTION_SLUGS.CUSTOMERS) {
    return { customer: { equals: user.id } }
  }
  return false
}

// --- HELPER UTILITIES ---
const resolveRelationId = (value: any): string | null => {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "number") return value.toString()
  if (typeof value === "object") {
    if ("value" in value) return value.value as string
    if ("id" in value) return value.id as string
  }
  return null
}

const toPositiveNumber = (value: any, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const toQuantity = (value: any): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.floor(parsed)
}

const Orders: CollectionConfig = {
  slug: "orders",
  admin: {
    useAsTitle: "orderNumber",
  },
  access: {
    // 🔥 FIXED: Passing 'req' directly to the filter
    read: ({ req }) => {
      if (isAdmin({ req })) return true
      return getCustomerAccessFilter(req)
    },
    create: () => true,
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      return getCustomerAccessFilter(req)
    },
    delete: ({ req }) => {
      if (isAdmin({ req })) return true
      return false // Customers cannot delete orders
    },
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
      name: "orderStatus",
      type: "select",
      options: ORDER_STATUS_OPTIONS,
      defaultValue: "pending",
      required: true,
    },
    {
      name: "paymentStatus",
      type: "select",
      options: ["pending", "paid", "failed"],
      defaultValue: "pending",
    },
    {
      name: "paymentMethod",
      type: "text",
    },
    {
      name: "shippingAddress",
      type: "group",
      required: true,
      fields: [
        { name: "firstName", type: "text" },
        { name: "lastName", type: "text" },
        { name: "street", type: "text", required: true },
        { name: "city", type: "text", required: true },
        { name: "state", type: "text" },
        { name: "country", type: "text", required: true },
        { name: "phone", type: "text" },
      ],
    },
    {
      name: "items",
      type: "array",
      minRows: 1,
      required: true,
      fields: [
        {
          name: "product",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.PRODUCTS as any,
          required: true,
        },
        { name: "productTitle", type: "text", admin: { readOnly: true } },
        {
          name: "vendor",
          type: "relationship",
          relationTo: COLLECTION_SLUGS.VENDORS,
          admin: { readOnly: true },
        },
        { name: "quantity", type: "number", required: true, min: 1 },
        { name: "price", type: "number", admin: { readOnly: true } },
        { name: "total", type: "number", admin: { readOnly: true } },
        {
          name: "status",
          type: "select",
          options: ORDER_STATUS_VALUES,
          defaultValue: "pending",
        },
      ],
    },
    { name: "subtotal", type: "number", admin: { readOnly: true } },
    { name: "tax", type: "number", defaultValue: 0 },
    { name: "shippingCost", type: "number", defaultValue: 0 },
    { name: "total", type: "number", admin: { readOnly: true } },
    {
      name: "inventoryAdjusted",
      type: "checkbox",
      defaultValue: false,
      admin: { hidden: true },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || !req?.payload) return data
        const payload = req.payload
        if (!Array.isArray(data.items) || data.items.length === 0) return data

        let subtotal = 0
        for (const item of data.items) {
          const productId = resolveRelationId(item.product)
          if (!productId) continue

          const product = await payload.findByID({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            depth: 0,
            overrideAccess: true,
          })

          if (!product) throw new Error(`Product ${productId} not found.`)

          const qty = toQuantity(item.quantity)
          const price = toPositiveNumber(item.price, product.pricing?.price || 0)
          const lineTotal = price * qty
          subtotal += lineTotal

          item.total = lineTotal
          item.productTitle = product.title
        }

        data.subtotal = subtotal
        data.total = subtotal + toPositiveNumber(data.tax) + toPositiveNumber(data.shippingCost)
        return data
      },
    ],
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        if (!data || !req?.payload) return data
        const payload = req.payload
        
        const nextStatus = data.orderStatus ?? originalDoc?.orderStatus ?? "pending"
        const prevStatus = originalDoc?.orderStatus
        const alreadyAdjusted = originalDoc?.inventoryAdjusted ?? false

        // 🔥 1. RESTOCK LOGIC: If cancelling an order that already took stock
        if (nextStatus === 'canceled' && alreadyAdjusted) {
          const items = originalDoc?.items ?? []
          for (const item of items) {
            const productId = resolveRelationId(item.product)
            if (!productId) continue
            const product = await payload.findByID({
              collection: COLLECTION_SLUGS.PRODUCTS,
              id: productId,
              depth: 0,
            })
            await payload.update({
              collection: COLLECTION_SLUGS.PRODUCTS,
              id: productId,
              data: {
                inventory: {
                  ...product.inventory,
                  quantity: (product?.inventory?.quantity ?? 0) + toQuantity(item.quantity),
                },
              },
            })
          }
          data.inventoryAdjusted = false // Reset flag
          return data
        }

        // 2. DEDUCTION LOGIC: (Your existing code)
        const shouldAdjust = STOCK_CONFIRMATION_STATUSES.has(nextStatus) && !alreadyAdjusted
        if (!shouldAdjust) return data

        const items = data.items || originalDoc?.items || []
        for (const item of items) {
          const productId = resolveRelationId(item.product)
          if (!productId) continue

          const product = await payload.findByID({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            depth: 0,
            overrideAccess: true,
          })

          const currentQty = product?.inventory?.quantity ?? 0
          const orderQty = toQuantity(item.quantity)

          await payload.update({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            data: {
              inventory: {
                ...product.inventory,
                quantity: Math.max(0, currentQty - orderQty),
              },
            },
            overrideAccess: true,
          })
        }

        data.inventoryAdjusted = true
        return data
      },
    ],
    afterChange: [
      async ({ doc, req, operation, previousDoc }) => {
        try {
          const payload = req.payload;
          
          // 1. Ensure we have a customer ID to work with
          const customerId = doc.customer && typeof doc.customer === 'object' 
            ? doc.customer.id 
            : doc.customer;
    
          if (!customerId) {
            console.warn("Order processed without a customer ID. Skipping email.");
            return;
          }
    
          // 2. Fetch the customer profile
          const customer = await payload.findByID({
            collection: COLLECTION_SLUGS.CUSTOMERS,
            id: customerId,
          });
    
          if (!customer?.email) return;
    
          // --- CASE A: New Order Created ---
          if (operation === "create") {
            await sendOrderConfirmationEmail(payload, doc, customer);
          } 
          
          // --- CASE B: Status Updated (Pending -> Shipped, etc.) ---
          else if (operation === "update" && doc.orderStatus !== previousDoc?.orderStatus) {
            await sendOrderStatusUpdateEmail(payload, doc, customer);
          }
    
        } catch (emailError: any) {
          console.error("Order email hook error:", emailError.message);
        }
      },
    ],
  },
}

async function sendOrderStatusUpdateEmail(payload: any, order: any, customer: any) {
  // Map the internal status values to user-friendly messages
  const statusMessages: Record<string, string> = {
    processing: "is now being processed and packed.",
    shipped: "has been shipped! It's on its way to you.",
    delivered: "has been delivered. Enjoy your DOMA products!",
    canceled: "has been canceled as requested.",
  };

  const message = statusMessages[order.orderStatus] || `status has been updated to ${order.orderStatus}.`;

  try {
    await payload.sendEmail({
      to: customer.email,
      subject: `Update on Order #${order.orderNumber}: ${order.orderStatus.toUpperCase()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee;">
          <div style="background: #FF9800; color: white; padding: 20px; text-align: center;">
            <h1>Order Update</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2>Good news, ${customer.Name || 'Customer'}!</h2>
            <p>Your order <strong>#${order.orderNumber}</strong> ${message}</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
              <p style="margin: 0; color: #666;">Current Status:</p>
              <h3 style="margin: 5px 0; color: #1B5E20; text-transform: uppercase;">${order.orderStatus}</h3>
            </div>

            <p><strong>Order Details:</strong><br />
            Total: Rs. ${order.total}<br />
            Items: ${order.items.length} items</p>

            <p style="text-align: center; margin-top: 30px;">
              <a href="https://doma-app.com/track/${order.orderNumber}" style="background: #1B5E20; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Order Progress
              </a>
            </p>
          </div>
          <div style="background: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #666;">
            Questions? Contact our support at support@doma.com
          </div>
        </div>
      `,
    });
    console.log(`Status update email (${order.orderStatus}) sent to ${customer.email}`);
  } catch (error: any) {
    console.error("Failed to send status update email:", error.message);
  }
}

// --- EMAIL NOTIFICATION FUNCTION ---
async function sendOrderConfirmationEmail(payload: any, order: any, customer: any) {
  try {
    await payload.sendEmail({
      to: customer.email,
      subject: `Order Confirmed: #${order.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee;">
          <div style="background: #1B5E20; color: white; padding: 20px; text-align: center;">
            <h1>Order Confirmed!</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2>Thank you for your order, ${customer.Name || 'Customer'}!</h2>
            <p>We've received your order <strong>#${order.orderNumber}</strong> and it is now being processed.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 10px;">Order Summary</h3>
              <table style="width: 100%; border-collapse: collapse;">
                ${order.items.map((item: any) => `
                  <tr>
                    <td style="padding: 10px 0;">${item.productTitle} (x${item.quantity})</td>
                    <td style="text-align: right; padding: 10px 0;">Rs. ${item.total}</td>
                  </tr>
                `).join('')}
                <tr style="border-top: 2px solid #ddd; font-weight: bold;">
                  <td style="padding: 10px 0;">Total</td>
                  <td style="text-align: right; padding: 10px 0;">Rs. ${order.total}</td>
                </tr>
              </table>
            </div>

            <p><strong>Shipping to:</strong><br />
            ${order.shippingAddress.street}, ${order.shippingAddress.city}<br />
            ${order.shippingAddress.country}</p>

            <p>We'll send you another update once your package is on its way!</p>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="https://doma-app.com/orders" style="background: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Track My Order
              </a>
            </p>
          </div>
          <div style="background: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #666;">
            &copy; ${new Date().getFullYear()} DOMA - Your AI Design Partner
          </div>
        </div>
      `,
      text: `Order Confirmed: #${order.orderNumber}. Thank you for your purchase of Rs. ${order.total}.`
    })
    console.log(`Order confirmation sent to ${customer.email}`)
  } catch (error: any) {
    console.error("Failed to send order email:", error.message)
  }
}

export default Orders