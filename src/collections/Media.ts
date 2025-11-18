import type { CollectionConfig } from 'payload'
import path from 'path'
import cloudinary from '@/lib/cloudinary'
import { isAdmin, isAdminOrVendor } from '@/lib/access-helpers'

const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true, // Public read access for media
    create: isAdminOrVendor, // Admins and vendors can create media
    update: isAdminOrVendor, // Admins and vendors can update media
    delete: isAdmin, // Only admins can delete media
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
    // Default to false in development so local file serving works.
    // Set `DISABLE_LOCAL_STORAGE=true` in production (Render/Vercel) to disable local writes.
    disableLocalStorage: process.env.DISABLE_LOCAL_STORAGE === 'true',
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
    if (operation !== 'create' && operation !== 'update') return doc
    if (doc.cloudinaryPublicId) return doc

    // Payload stores uploaded file here:
    const file = req.file
    if (!file || !file.data) {
      req.payload.logger?.warn?.('No file data found — Cloudinary upload skipped')
      return doc
    }

    try {
      const uploadToCloudinary = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: process.env.CLOUDINARY_FOLDER || undefined,
              use_filename: true,
              unique_filename: false,
            },
            (error, result) => {
              if (error) reject(error)
              else resolve(result)
            }
          )

          // file.data is the Buffer
          stream.end(file.data)
        })

      const result: any = await uploadToCloudinary()

      req.payload.logger?.info?.(
        `Cloudinary upload successful: ${JSON.stringify(result)}`
      )

      const publicId = result.public_id || null
      const url = result.secure_url || result.url || null

      if (publicId || url) {
        await req.payload.update({
          collection: 'media',
          id: doc.id,
          data: {
            cloudinaryPublicId: publicId,
            cloudinaryUrl: url,
          },
        })

        doc.cloudinaryPublicId = publicId
        doc.cloudinaryUrl = url
      }

      return doc
    } catch (err: any) {
      req.payload.logger?.error?.(
        `Cloudinary upload failed: ${err?.message || String(err)}`
      )
      return doc
    }
  },
],

  },
}
export default Media
