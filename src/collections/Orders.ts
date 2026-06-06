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

const STOCK_CONFIRMATION_STATUSES = new Set(["pending", "paid", "processing", "shipped", "delivered"])

const getCustomerAccessFilter = (req: any) => {
  const user = req?.user as any
  if (user?.collection === COLLECTION_SLUGS.CUSTOMERS) {
    return { customer: { equals: user.id } }
  }
  return false
}

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
      return false
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
      name: "safepayTracker",
      type: "text",
      admin: { readOnly: true },
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
          data.inventoryAdjusted = false
          return data
        }

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
          const payload = req.payload

          const customerId = doc.customer && typeof doc.customer === 'object'
            ? doc.customer.id
            : doc.customer

          if (!customerId) {
            console.warn("Order processed without a customer ID. Skipping email.")
            return
          }

          const customer = await payload.findByID({
            collection: COLLECTION_SLUGS.CUSTOMERS,
            id: customerId,
          })

          if (!customer?.email) return

          if (operation === "create") {
            await sendOrderConfirmationEmail(payload, doc, customer)
          } else if (operation === "update" && doc.orderStatus !== previousDoc?.orderStatus) {
            await sendOrderStatusUpdateEmail(payload, doc, customer)
          }
        } catch (emailError: any) {
          console.error("Order email hook error:", emailError.message)
        }
      },
    ],
  },
}

// ─── STATUS UPDATE EMAIL ───────────────────────────────────────────────────────

async function sendOrderStatusUpdateEmail(payload: any, order: any, customer: any) {
  const statusConfig: Record<string, { label: string; color: string; accentColor: string; message: string }> = {
    processing: {
      label: "Processing",
      color: "#d97706",
      accentColor: "#f59e0b",
      message: "is now being processed and packed.",
    },
    shipped: {
      label: "Shipped",
      color: "#2563eb",
      accentColor: "#3b82f6",
      message: "has been shipped! It's on its way to you.",
    },
    delivered: {
      label: "Delivered",
      color: "#16a34a",
      accentColor: "#22c55e",
      message: "has been delivered. Enjoy your DOMA products!",
    },
    canceled: {
      label: "Canceled",
      color: "#dc2626",
      accentColor: "#ef4444",
      message: "has been canceled as requested.",
    },
  }

  const config = statusConfig[order.orderStatus] ?? {
    label: order.orderStatus.charAt(0).toUpperCase() + order.orderStatus.slice(1),
    color: "#374151",
    accentColor: "#6b7280",
    message: `status has been updated to ${order.orderStatus}.`,
  }

  try {
    await payload.sendEmail({
      to: customer.email,
      subject: `Order #${order.orderNumber} — ${config.label}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Order Update</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
<td style="background-color: #1A3126; background-image: linear-gradient(#1A3126, #1A3126); padding: 32px 40px; text-align: center;">
                      <img src="https://res.cloudinary.com/dnokhszdv/image/upload/v1780759093/payload-media/file_yylpmi.png" alt="DOMA" width="140" style="display:block;margin:0 auto;" />
                    </td>
                  </tr>

                  <!-- Accent bar -->
                  <tr>
                    <td style="background:${config.accentColor};height:4px;"></td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px 40px 24px;">
                      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${config.color};text-transform:uppercase;letter-spacing:0.8px;">Order Update</p>
                      <h1 style="margin:0 0 24px;font-size:28px;font-weight:700;color:#0a0a0a;line-height:1.2;">Your order is ${config.label.toLowerCase()}!</h1>
                      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">Hi <strong>${customer.Name || 'Customer'}</strong>,</p>
                      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                        Your order <strong>#${order.orderNumber}</strong> ${config.message}
                      </p>

                      <!-- Status card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Order Details</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;width:140px;">Order Number</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">#${order.orderNumber}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Items</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${order.items.length} item${order.items.length !== 1 ? 's' : ''}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Total</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">Rs. ${order.total}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Status</td>
                                <td style="padding:6px 0;font-size:14px;font-weight:600;color:${config.color};">${config.label}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                        <tr>
                          <td align="center">
                            <a href="https://www.thedoma.shop/profile"
                              style="display:inline-block;background:#0a0a0a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
                              View Order Progress →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
                        Thank you for shopping with DOMA.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
                      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
                        This email was sent by DOMA Marketplace · <a href="https://www.thedoma.shop" style="color:#9ca3af;">thedoma.shop</a><br/>
                        Questions? Contact us at <a href="mailto:support@thedoma.shop" style="color:#9ca3af;">support@thedoma.shop</a>
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Order #${order.orderNumber} — ${config.label}\n\nHi ${customer.Name || 'Customer'},\n\nYour order #${order.orderNumber} ${config.message}\n\nTotal: Rs. ${order.total}\nItems: ${order.items.length}\nStatus: ${config.label}\n\nView your order: https://www.thedoma.shop/profile\n\nDOMA Marketplace · thedoma.shop`,
    })
    console.log(`Status update email (${order.orderStatus}) sent to ${customer.email}`)
  } catch (error: any) {
    console.error("Failed to send status update email:", error.message)
  }
}

// ─── ORDER CONFIRMATION EMAIL ──────────────────────────────────────────────────

async function sendOrderConfirmationEmail(payload: any, order: any, customer: any) {
  try {
    await payload.sendEmail({
      to: customer.email,
      subject: `Order Confirmed: #${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Order Confirmed</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
<td style="background-color: #1A3126; background-image: linear-gradient(#1A3126, #1A3126); padding: 32px 40px; text-align: center;">
                      <img src="https://res.cloudinary.com/dnokhszdv/image/upload/v1780759093/payload-media/file_yylpmi.png" alt="DOMA" width="140" style="display:block;margin:0 auto;" />
                    </td>
                  </tr>

                  <!-- Green accent bar -->
                  <tr>
                    <td style="background:#16a34a;height:4px;"></td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px 40px 24px;">
                      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;">Order Confirmed</p>
                      <h1 style="margin:0 0 24px;font-size:28px;font-weight:700;color:#0a0a0a;line-height:1.2;">Thank you for your order!</h1>
                      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">Hi <strong>${customer.Name || 'Customer'}</strong>,</p>
                      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                        We've received your order <strong>#${order.orderNumber}</strong> and it is now being processed. We'll send you another update once your package is on its way.
                      </p>

                      <!-- Order summary card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Order Summary</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              ${order.items.map((item: any) => `
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#374151;">${item.productTitle} <span style="color:#9ca3af;">×${item.quantity}</span></td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;text-align:right;">Rs. ${item.total}</td>
                              </tr>`).join('')}
                              <tr>
                                <td colspan="2" style="padding:12px 0 0;border-top:1px solid #e5e7eb;"></td>
                              </tr>
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#6b7280;">Subtotal</td>
                                <td style="padding:4px 0;font-size:14px;color:#374151;text-align:right;">Rs. ${order.subtotal}</td>
                              </tr>
                              ${order.shippingCost ? `
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#6b7280;">Shipping</td>
                                <td style="padding:4px 0;font-size:14px;color:#374151;text-align:right;">Rs. ${order.shippingCost}</td>
                              </tr>` : ''}
                              ${order.tax ? `
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#6b7280;">Tax</td>
                                <td style="padding:4px 0;font-size:14px;color:#374151;text-align:right;">Rs. ${order.tax}</td>
                              </tr>` : ''}
                              <tr>
                                <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#0a0a0a;">Total</td>
                                <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#0a0a0a;text-align:right;">Rs. ${order.total}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- Shipping address card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Shipping To</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;width:140px;">Address</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${order.shippingAddress.street}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">City</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${order.shippingAddress.city}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Country</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${order.shippingAddress.country}</td>
                              </tr>
                              ${order.shippingAddress.phone ? `
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Phone</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${order.shippingAddress.phone}</td>
                              </tr>` : ''}
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                        <tr>
                          <td align="center">
                            <a href="https://www.thedoma.shop/profile"
                              style="display:inline-block;background:#0a0a0a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
                              Track My Order →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
                        Welcome to DOMA. We're glad to have you.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
                      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
                        &copy; ${new Date().getFullYear()} DOMA Marketplace · <a href="https://www.thedoma.shop" style="color:#9ca3af;">thedoma.shop</a><br/>
                        Questions? Contact us at <a href="mailto:support@thedoma.shop" style="color:#9ca3af;">support@thedoma.shop</a>
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Order Confirmed: #${order.orderNumber}\n\nHi ${customer.Name || 'Customer'},\n\nWe've received your order #${order.orderNumber}.\n\nItems:\n${order.items.map((item: any) => `- ${item.productTitle} ×${item.quantity}: Rs. ${item.total}`).join('\n')}\n\nTotal: Rs. ${order.total}\n\nShipping to: ${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.country}\n\nTrack your order: https://www.thedoma.shop/profile\n\nDOMA Marketplace · thedoma.shop`,
    })
    console.log(`Order confirmation sent to ${customer.email}`)
  } catch (error: any) {
    console.error("Failed to send order email:", error.message)
  }
}

export default Orders