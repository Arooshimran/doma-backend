import type { CollectionConfig } from 'payload'
import path from 'path'
import cloudinary from '@/lib/cloudinary'

const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true, // Public read access for media
    create: ({ req }) => {
      // Admins and vendors can create media
      return req.user?.collection === "users" || req.user?.collection === "vendors"
    },
    update: ({ req }) => {
      // Admins and vendors can update media
      return req.user?.collection === "users" || req.user?.collection === "vendors"
    },
    delete: ({ req }) => {
      // Only admins can delete media
      return req.user?.collection === "users"
    },
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    // Optional text-only fields you asked for
    {
      name: 'cloudinaryPublicId',
      type: 'text',
      admin: { description: 'Optional reference only' },
    },
    {
      name: 'cloudinaryUrl',
      type: 'text',
      admin: { description: 'Optional reference only' },
    },
  ],
  upload: {
    disableLocalStorage: true,
  },
  hooks: {
    afterRead: [
      ({ doc }) => {
        if ((doc as any)?.cloudinaryUrl) {
          (doc as any).url = (doc as any).cloudinaryUrl
        }
        return doc
      },
    ],
    afterChange: [
      async ({ doc, req, operation }) => {
        if (req?.context && (req.context as any).skipCloudinarySync) return doc
        if (operation !== 'create' && operation !== 'update') return doc
        const filename = (doc as any)?.filename
        if (!filename) return doc
        if ((doc as any)?.cloudinaryPublicId) return doc

        try {
          // In serverless environments, we can't access local files
          // Skip Cloudinary sync for now since we're using disableLocalStorage
          req.payload.logger?.warn?.('Cloudinary sync skipped (serverless environment with disableLocalStorage)')
          return doc
        } catch (e: any) {
          req.payload.logger?.warn?.(`Cloudinary sync failed: ${e?.message || String(e)}`)
          return doc
        }
      },
    ],
  },
}
export default Media
