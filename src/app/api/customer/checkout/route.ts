import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { generateOrderNumber } from "@/lib/utils"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { COLLECTION_SLUGS } from "@/collections/shared-types"
import { findCartByUserId } from "@/lib/cart-service"
import { resolveRelationId } from "@/lib/cart-utils"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

// Helper: extract customer ID from JWT token
const getCustomerIdFromToken = async (request: NextRequest): Promise<string | null> => {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("JWT ")) return null
  const token = authHeader.substring(4)
  try {
    const base64Payload = token.split('.')[1]
    const decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8')
    const decoded = JSON.parse(decodedPayload)
    if (decoded.collection !== 'customers') return null
    return decoded.id
  } catch {
    return null
  }
}


// OPTIONS handler
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// POST - Process checkout and create order
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    console.log("POST /api/customer/checkout - Starting...")
    
    const customerId = await getCustomerIdFromToken(request)
    if (!customerId) {
      console.log("Unauthorized - Invalid or missing token")
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401, headers }
      )
    }
    
    console.log("Customer authenticated:", customerId)
    
    const payload = await getPayloadClient()
    
    let body
    try {
      body = await request.json()
    } catch (jsonError) {
      console.error("Error parsing JSON body:", jsonError)
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers }
      )
    }
    
    // Get customer data for fallback name
    const customer = await payload.findByID({
      collection: COLLECTION_SLUGS.CUSTOMERS,
      id: customerId,
      overrideAccess: true,
    })
    
    // Get shipping address from request body or customer's default address
    let shippingAddress = body.shippingAddress
    
    if (!shippingAddress) {
      // Try to get default address from customer
      const defaultAddress = customer?.addresses?.find((addr: any) => addr.isDefault)
      if (defaultAddress) {
        shippingAddress = {
          name: customer?.Name || 'Customer',
          street: defaultAddress.street,
          city: defaultAddress.city,
          state: defaultAddress.state || '',
          country: defaultAddress.country,
          phone: customer.phone || '',
        }
      }
    }
    
    // Normalize shipping address: ensure we have a 'name' field
    if (shippingAddress) {
      // If we have firstName/lastName but no name, combine them
      if ((shippingAddress.firstName || shippingAddress.lastName) && !shippingAddress.name) {
        const firstName = shippingAddress.firstName?.trim() || ''
        const lastName = shippingAddress.lastName?.trim() || ''
        shippingAddress.name = [firstName, lastName].filter(Boolean).join(' ') || 'Customer'
      }
      // If we have neither 'name' nor 'firstName'/'lastName', use customer's name
      else if (!shippingAddress.name) {
        shippingAddress.name = customer?.Name || 'Customer'
      }
    }
    
    if (!shippingAddress || !shippingAddress?.street || !shippingAddress?.city || !shippingAddress?.country) {
      return NextResponse.json(
        { error: "Shipping address is required" },
        { status: 400, headers }
      )
    }
    
    const orderItems = []
    
    // Check if items are provided in request body (selected items from frontend)
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      console.log("Processing items from request body:", body.items.length, "items")
      
      // Use items from request (selected items from cart page)
      for (const item of body.items) {
        const productId = typeof item.product === 'string' ? item.product : item.product?.id
        
        if (!productId) {
          console.warn("Item missing product ID, skipping")
          continue
        }
        
        // Fetch product to validate and get latest data
        const product = await payload.findByID({
          collection: COLLECTION_SLUGS.PRODUCTS,
          id: productId,
          depth: 1,
          overrideAccess: true,
        }).catch(() => null)
        
        if (!product) {
          console.warn(`Product ${productId} not found, skipping`)
          continue
        }
        
        // Check stock availability
        const availableStock = product?.inventory?.quantity ?? 0
        const requestedQty = item.quantity || 1
        
        if (availableStock < requestedQty) {
          return NextResponse.json(
            { 
              error: `Insufficient stock for ${product.title || 'product'}. Available: ${availableStock}, Requested: ${requestedQty}` 
            },
            { status: 400, headers }
          )
        }
        
        const unitPrice = item.unitPrice || item.price || product?.pricing?.discountedPrice || product?.pricing?.price || 0
        const lineTotal = item.lineTotal || (unitPrice * requestedQty)
        
        orderItems.push({
          product: productId,
          productTitle: product.title || '',
          vendor: resolveRelationId(product.vendor) || null,
          quantity: requestedQty,
          price: unitPrice,
          total: lineTotal,
          status: 'pending',
        })
      }
    } else {
      console.log("No items in request, falling back to cart")
      
      // Fall back to full cart if no items provided
      const cart = await findCartByUserId(payload, customerId, 2)
      
      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        return NextResponse.json(
          { error: "Cart is empty and no items provided" },
          { status: 400, headers }
        )
      }
      
      console.log("Cart found with", cart.items.length, "items")
      
      // Convert cart items to order items format
      for (const cartItem of cart.items) {
        const productId = resolveRelationId(cartItem.product)
        if (!productId) continue
        
        // Fetch product to get title and vendor
        const product = await payload.findByID({
          collection: COLLECTION_SLUGS.PRODUCTS,
          id: productId,
          depth: 1,
          overrideAccess: true,
        }).catch(() => null)
        
        if (!product) {
          console.warn(`Product ${productId} not found, skipping`)
          continue
        }
        
        // Check stock availability
        const availableStock = product?.inventory?.quantity ?? 0
        const requestedQty = cartItem.quantity || 1
        
        if (availableStock < requestedQty) {
          return NextResponse.json(
            { 
              error: `Insufficient stock for ${product.title || 'product'}. Available: ${availableStock}, Requested: ${requestedQty}` 
            },
            { status: 400, headers }
          )
        }
        
        const unitPrice = cartItem.unitPrice || product?.pricing?.discountedPrice || product?.pricing?.price || 0
        const lineTotal = cartItem.lineTotal || (unitPrice * requestedQty)
        
        orderItems.push({
          product: productId,
          productTitle: product.title || '',
          vendor: resolveRelationId(product.vendor) || null,
          quantity: requestedQty,
          price: unitPrice,
          total: lineTotal,
          status: 'pending',
        })
      }
    }
    
    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: "No valid items to order" },
        { status: 400, headers }
      )
    }
    
    console.log("Processing order with", orderItems.length, "valid items")
    
    // Calculate totals
    const subtotal = orderItems.reduce((sum, item) => sum + (item.total || 0), 0)
    const tax = body.tax || 0
    const shippingCost = body.shippingCost || 0
    const total = subtotal + tax + shippingCost
    
    // Normalize billing address if provided
    let billingAddress = null
    if (body.billingAddress) {
      billingAddress = { ...body.billingAddress }
      // If we have firstName/lastName but no name, combine them
      if ((billingAddress.firstName || billingAddress.lastName) && !billingAddress.name) {
        const firstName = billingAddress.firstName?.trim() || ''
        const lastName = billingAddress.lastName?.trim() || ''
        billingAddress.name = [firstName, lastName].filter(Boolean).join(' ') || 'Customer'
      }
      // Remove firstName/lastName to avoid validation issues
      delete billingAddress.firstName
      delete billingAddress.lastName
      // Ensure name exists
      if (!billingAddress.name) {
        billingAddress.name = 'Customer'
      }
    }
    
    // Ensure shippingAddress doesn't have firstName/lastName
    const normalizedShippingAddress = {
      name: shippingAddress?.name?.trim() || 'Customer',
      street: shippingAddress?.street?.trim() || shippingAddress?.street || '',
      city: shippingAddress?.city?.trim() || shippingAddress?.city || '',
      state: shippingAddress?.state?.trim() || '',
      country: shippingAddress?.country || 'Pakistan',
      phone: shippingAddress?.phone?.trim() || shippingAddress?.phone || '',
    }
    
    // Generate order number
    const orderNumber = generateOrderNumber()
    
    console.log("Creating order with totals:", { subtotal, tax, shippingCost, total })
    
    // Create order
    const order = await payload.create({
      collection: COLLECTION_SLUGS.ORDERS,
      data: {
        orderNumber,
        customer: customerId,
        orderStatus: 'pending',
        paymentStatus: body.paymentStatus || 'pending',
        paymentMethod: body.paymentMethod || 'cod',
        paymentId: body.paymentId || null,
        items: orderItems,
        shippingAddress: normalizedShippingAddress,
        billingAddress,
        subtotal: Number(subtotal.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        shippingCost: Number(shippingCost.toFixed(2)),
        total: Number(total.toFixed(2)),
      },
      depth: 2,
      overrideAccess: true,
    })
    
    console.log("Order created successfully:", order.id)
    
    // Reduce inventory for all products in the order
    try {
      const productCache = new Map<string, any>()
      
      for (const item of orderItems) {
        const productId = typeof item.product === 'string' ? item.product : item.product?.id
        if (!productId) continue
        
        // Fetch product if not already cached
        if (!productCache.has(productId)) {
          const product = await payload.findByID({
            collection: COLLECTION_SLUGS.PRODUCTS,
            id: productId,
            depth: 0,
            overrideAccess: true,
          }).catch(() => null)
          
          if (product) {
            productCache.set(productId, product)
          }
        }
        
        const product = productCache.get(productId)
        if (!product) {
          console.warn(`Product ${productId} not found for inventory adjustment`)
          continue
        }
        
        const quantity = item.quantity || 1
        const currentStock = product?.inventory?.quantity ?? 0
        
        // Double-check stock availability before reducing
        if (currentStock < quantity) {
          console.error(`Insufficient stock for product ${productId} during inventory adjustment`)
          continue
        }
        
        // Reduce inventory
        await payload.update({
          collection: COLLECTION_SLUGS.PRODUCTS,
          id: productId,
          data: {
            inventory: {
              ...product.inventory,
              quantity: currentStock - quantity,
            },
          },
          overrideAccess: true,
          depth: 0,
        })
        
        console.log(`Inventory reduced for product ${productId}: ${currentStock} -> ${currentStock - quantity}`)
      }
      
      // Mark order as having inventory adjusted
      await payload.update({
        collection: COLLECTION_SLUGS.ORDERS,
        id: order.id,
        data: {
          inventoryAdjusted: true,
        },
        overrideAccess: true,
        depth: 0,
      })
      
      console.log("Inventory adjusted successfully for all products")
    } catch (inventoryError) {
      console.error("Error adjusting inventory:", inventoryError)
      // Log error but don't fail the order
    }
    
    // Clear only selected items from cart (or entire cart if all items were ordered)
    try {
      const cart = await findCartByUserId(payload, customerId, 1)
      
      if (cart && body.items && Array.isArray(body.items) && Array.isArray(cart.items)) {
        // Remove only the ordered items from cart
        const orderedProductIds = new Set(
          orderItems.map(item => typeof item.product === 'string' ? item.product : item.product?.id)
        )
        
        const remainingItems = cart.items.filter(item => {
          const itemProductId = resolveRelationId(item.product)
          return !orderedProductIds.has(itemProductId)
        })
        
        await payload.update({
          collection: COLLECTION_SLUGS.CARTS,
          id: cart.id,
          data: {
            items: remainingItems,
          },
          overrideAccess: true,
        })
        
        console.log(`Cart updated: ${cart.items.length} -> ${remainingItems.length} items`)
      } else if (cart) {
        // Clear entire cart if no specific items provided
        await payload.update({
          collection: COLLECTION_SLUGS.CARTS,
          id: cart.id,
          data: {
            items: [],
          },
          overrideAccess: true,
        })
        console.log("Cart cleared successfully")
      }
    } catch (clearError) {
      console.error("Error updating cart:", clearError)
      // Don't fail the request if cart update fails
    }
    
    return NextResponse.json(
      { 
        success: true, 
        order,
        message: "Order created successfully" 
      },
      { status: 201, headers }
    )
  } catch (error) {
    console.error("Error processing checkout:", error)
    
    let errorMessage = "Failed to process checkout"
    let statusCode = 500
    
    if (error instanceof Error) {
      if (error.message.includes("stock") || error.message.includes("Insufficient")) {
        errorMessage = error.message
        statusCode = 400
      } else if (error.message.includes("validation")) {
        errorMessage = `Validation error: ${error.message}`
        statusCode = 400
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: statusCode, headers }
    )
  }
}