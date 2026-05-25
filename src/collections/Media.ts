import type { CollectionConfig } from 'payload'
import cloudinary from '@/lib/cloudinary'
import { isAdmin, isAdminOrVendor } from '@/lib/access-helpers'

const Media: CollectionConfig = {
  slug: 'media',

  access: {
    read: () => true,
    create: isAdminOrVendor,
    update: isAdminOrVendor,
    delete: isAdmin,
  },

  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'cloudinaryPublicId',
      type: 'text',
    },
    {
      name: 'cloudinaryUrl',
      type: 'text',
    },
  ],

  upload: {
    disableLocalStorage: process.env.DISABLE_LOCAL_STORAGE === 'true',

    // NOTE: limits removed because not supported in this Payload version
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ],
  },

  hooks: {
    afterRead: [
      ({ doc }) => {
        if (doc?.cloudinaryUrl) doc.url = doc.cloudinaryUrl
        return doc
      },
    ],

    beforeChange: [
      // ✅ FILE VALIDATION (size + mime)
      async ({ req, operation }) => {
        const file = req.file

        if (file?.data) {
          const MAX_SIZE = 5 * 1024 * 1024 // 5MB

          if (file.data.length > MAX_SIZE) {
            throw new Error('File too large. Maximum allowed size is 5MB.')
          }

          const allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/avif',
          ]

          if (
            file.mimetype &&
            !allowedMimeTypes.includes(file.mimetype)
          ) {
            throw new Error('Unsupported file type.')
          }
        }
      },

      // MAIN LOGIC
      async ({ data, req, operation, originalDoc }) => {
        const fileBuffer = req.file?.data

        if (!fileBuffer) {
          if (operation === 'update' && originalDoc) {
            data.cloudinaryPublicId ??= originalDoc.cloudinaryPublicId
            data.cloudinaryUrl ??= originalDoc.cloudinaryUrl
          }
          return data
        }

        // Upload to Cloudinary
        let uploadResult: any

        try {
          uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: process.env.CLOUDINARY_FOLDER || 'payload-media',
                use_filename: true,
                unique_filename: true,
                resource_type: 'image',
              },
              (error, result) => {
                if (error) reject(error)
                else resolve(result)
              }
            )

            stream.end(fileBuffer)
          })

          req.payload.logger.info(
            `Cloudinary upload success → ${uploadResult.public_id}`
          )
        } catch (err: any) {
          req.payload.logger.error(
            `Cloudinary upload failed → ${err.message}`
          )
          return data
        }

        // Moderation
        try {
          const moderationUrl =
            `https://api.sightengine.com/1.0/check.json?` +
            new URLSearchParams({
              url: uploadResult.secure_url,
              models: 'nudity,offensive,gore,quality',
              api_user: process.env.SIGHTENGINE_USER!,
              api_secret: process.env.SIGHTENGINE_SECRET!,
            })

          const moderationRes = await fetch(moderationUrl)
          const moderationResult = await moderationRes.json()

          const isExplicit = (moderationResult.nudity?.raw ?? 0) > 0.6
          const isOffensive = (moderationResult.nudity?.partial ?? 0) > 0.7
          const isGore = (moderationResult.gore?.prob ?? 0) > 0.6

          if (isExplicit || isOffensive || isGore) {
            try {
              await cloudinary.uploader.destroy(uploadResult.public_id)
            } catch {}

            throw new Error(
              'Image rejected: inappropriate, violent, or poor quality image detected.'
            )
          }
        } catch (err: any) {
          if (err.message.includes('Image rejected')) throw err
        }

        // Save Cloudinary data
        data.cloudinaryPublicId = uploadResult.public_id
        data.cloudinaryUrl = uploadResult.secure_url

        // Replace old image on update
        if (
          operation === 'update' &&
          originalDoc?.cloudinaryPublicId &&
          originalDoc.cloudinaryPublicId !== uploadResult.public_id
        ) {
          try {
            await cloudinary.uploader.destroy(
              originalDoc.cloudinaryPublicId
            )
          } catch (err: any) {
            req.payload.logger.warn(
              `Failed to delete old asset → ${err.message}`
            )
          }
        }

        return data
      },
    ],

    afterDelete: [
      async ({ req, doc }) => {
        try {
          if (doc?.cloudinaryPublicId) {
            await cloudinary.uploader.destroy(doc.cloudinaryPublicId)
          }
        } catch (err) {
          req.payload.logger.error(
            `Cloudinary delete failed → ${err}`
          )
        }
      },
    ],
  },
}

export default Media