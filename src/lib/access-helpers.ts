import type { Access } from 'payload'

type RoleUser = {
  collection: 'users'
  role?: string
  id?: string
  email?: string
}

const isSuperAdminUser = (user: unknown): user is RoleUser =>
  !!user &&
  typeof user === 'object' &&
  (user as RoleUser).collection === 'users' &&
  (user as RoleUser).role === 'super-admin'

export const isAuthenticated: Access = ({ req }) => {
  if (process.env.NODE_ENV === 'development') {
    return !!req.user
  }
  
  return !!req.user && (!!req.user.id || !!req.user.email)
}

// Helper function to check if user is admin
export const isAdmin: Access = ({ req }) => {
  if (process.env.NODE_ENV === 'development') {
    return req.user?.collection === "users"
  }
  
  return req.user?.collection === "users" && (!!req.user.id || !!req.user.email)
}

// Helper function to check if user is super admin
export const isSuperAdmin: Access = ({ req }) => {
  if (process.env.NODE_ENV === 'development') {
    return isSuperAdminUser(req.user)
  }
  
  return isSuperAdminUser(req.user) && (!!req.user?.id || !!req.user?.email)
}

// Helper function to check if user is vendor
export const isVendor: Access = ({ req }) => {
  if (process.env.NODE_ENV === 'development') {
    return req.user?.collection === "vendors"
  }
  
  return req.user?.collection === "vendors" && (!!req.user.id || !!req.user.email)
}

// Helper function to check if user is admin or vendor
export const isAdminOrVendor: Access = ({ req }) => {
  if (process.env.NODE_ENV === 'development') {
    return req.user?.collection === "users" || req.user?.collection === "vendors"
  }
  
  return (req.user?.collection === "users" || req.user?.collection === "vendors") && 
         (!!req.user.id || !!req.user.email)
}

// Helper function for users to access their own records
export const ownRecord: Access = ({ req }) => {
  if (process.env.NODE_ENV === 'development') {
    return !!req.user ? { id: { equals: req.user.id } } : false
  }
  
  return !!req.user && (!!req.user.id || !!req.user.email) ? { id: { equals: req.user.id } } : false
}
