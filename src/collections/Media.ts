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
          // Prefer streaming uploaded buffer when available (prod/serverless)
          const fileFromReq: any = (req as any)?.file
          if (fileFromReq?.buffer && fileFromReq?.mimetype) {
            const result: any = await new Promise((resolve, reject) => {
              const upload = cloudinary.uploader.upload_stream(
                { resource_type: 'auto', folder: 'doma' },
                (error, res) => (error ? reject(error) : resolve(res)),
              )
              upload.end(fileFromReq.buffer)
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
          }

          // Fallback: local file (dev environments)
          const filePath = path.join(process.cwd(), 'media', filename)
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
          const message = e?.message || String(e)
          if (message.includes('ENOENT')) {
            req.payload.logger?.warn?.('Cloudinary sync skipped (no local file in serverless)')
            return doc
          }
          req.payload.logger?.warn?.(`Cloudinary sync failed: ${message}`)
          return doc
        }
      },
    ],
  },
}
export default Media
