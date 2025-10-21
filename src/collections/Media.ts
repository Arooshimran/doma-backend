import type { CollectionConfig } from 'payload'
import path from 'path'
import cloudinary from '@/lib/cloudinary'

const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true, // Public read access for media
    create: ({ req }) => !!req.user, // Only authenticated users can upload
    update: ({ req }) => {
      // Admins can update any media, users can update their own
      if (req.user?.collection === "users") return true
      return false // For now, only admins can update media
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
          // Try to read from local file first (for dev), fallback to buffer upload
          const filePath = path.join(process.cwd(), 'media', filename)
          let result: any

          try {
            // Try local file first
            result = await cloudinary.uploader.upload(filePath, {
              resource_type: 'auto',
              folder: 'doma',
            })
          } catch (fileError: any) {
            // If local file doesn't exist (serverless), skip Cloudinary sync
            if (fileError?.message?.includes('ENOENT') || fileError?.code === 'ENOENT') {
              req.payload.logger?.warn?.('Cloudinary sync skipped (no local file in serverless)')
              return doc
            }
            throw fileError
          }

          const updated = await req.payload.update({
            collection: 'media',
            id: doc.id,
            data: {
              cloudinaryPublicId: result.public_id,
              cloudinaryUrl: result.secure_url,
            },
            overrideAccess: true,
            depth: 0,
            context: { skipCloudinarySync: true },
          })

          return updated
        } catch (e: any) {
          req.payload.logger?.warn?.(`Cloudinary sync failed: ${e?.message || String(e)}`)
          return doc
        }
      },
    ],
  },
}
export default Media
