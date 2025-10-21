import type { CollectionConfig } from 'payload'
import path from 'path'
import cloudinary from '@/lib/cloudinary'

const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ()=> true
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
  upload: true,
  hooks: {
    afterChange: [
      async ({ doc, req, operation }) => {
        if (req?.context && (req.context as any).skipCloudinarySync) return doc
        if (operation !== 'create' && operation !== 'update') return doc
        const filename = (doc as any)?.filename
        if (!filename) return doc
        if ((doc as any)?.cloudinaryPublicId) return doc

        const filePath = path.join(process.cwd(), 'media', filename)
        try {
          const result = await cloudinary.uploader.upload(filePath, {
            resource_type: 'auto',
            folder: 'doma',
          })

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
          // If file not found (race), skip noisy error and keep Payload asset
          const message = e?.message || String(e)
          if (message && message.includes('ENOENT')) {
            req.payload.logger?.warn?.('Cloudinary sync skipped (file not found yet)')
            return doc
          }
          req.payload.logger?.error?.(`Cloudinary sync failed: ${message}`)
          return doc
        }
      },
    ],
  },
}
export default Media
