// src/collections/shared-types.ts

// Define all your collection slugs in one place
export const COLLECTION_SLUGS = {
  CUSTOMERS: 'customers',
  PRODUCTS: 'products', 
  VENDORS: 'vendors',
  CATEGORIES: 'categories',
  MEDIA: 'media',
  ADMINS: 'admins',
  ORDERS: 'orders',
  USERS: 'users'
} as const;

// Create the union type from the constant values
export type CollectionSlug = typeof COLLECTION_SLUGS[keyof typeof COLLECTION_SLUGS];