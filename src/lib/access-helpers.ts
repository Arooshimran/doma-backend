import type { Access } from 'payload'

// Helper function to check if user is authenticated (works in both dev and prod)
export const isAuthenticated: Access = ({ req }) => {
  // In dev mode, allow if user exists
  if (process.env.NODE_ENV === 'development') {
    return !!req.user
  }
  
  // In production, require valid user with proper authentication
  return !!req.user && (!!req.user.id || !!req.user.email)
}

// Helper function to check if user is admin
export const isAdmin: Access = ({ req }) => {
  // In dev mode, allow if user exists and is from users collection
  if (process.env.NODE_ENV === 'development') {
    return req.user?.collection === "users"
  }
  
  // In production, require valid admin user
  return req.user?.collection === "users" && (!!req.user.id || !!req.user.email)
}

// Helper function to check if user is super admin
export const isSuperAdmin: Access = ({ req }) => {
  // In dev mode, allow if user is super admin
  if (process.env.NODE_ENV === 'development') {
    return req.user?.role === "super-admin"
  }
  
  // In production, require valid super admin user
  return req.user?.role === "super-admin" && (!!req.user.id || !!req.user.email)
}

// Helper function to check if user is vendor
export const isVendor: Access = ({ req }) => {
  // In dev mode, allow if user is from vendors collection
  if (process.env.NODE_ENV === 'development') {
    return req.user?.collection === "vendors"
  }
  
  // In production, require valid vendor user
  return req.user?.collection === "vendors" && (!!req.user.id || !!req.user.email)
}

// Helper function to check if user is admin or vendor
export const isAdminOrVendor: Access = ({ req }) => {
  // In dev mode, allow if user is admin or vendor
  if (process.env.NODE_ENV === 'development') {
    return req.user?.collection === "users" || req.user?.collection === "vendors"
  }
  
  // In production, require valid admin or vendor user
  return (req.user?.collection === "users" || req.user?.collection === "vendors") && 
         (!!req.user.id || !!req.user.email)
}

// Helper function for users to access their own records
export const ownRecord: Access = ({ req }) => {
  // In dev mode, allow if user exists
  if (process.env.NODE_ENV === 'development') {
    return !!req.user ? { id: { equals: req.user.id } } : false
  }
  
  // In production, require valid user for own record access
  return !!req.user && (!!req.user.id || !!req.user.email) ? { id: { equals: req.user.id } } : false
}
