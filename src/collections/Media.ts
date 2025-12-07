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
  },

  hooks: {
    // Replace local URL with Cloudinary URL when reading
    afterRead: [
      ({ doc }) => {
        if (doc?.cloudinaryUrl) doc.url = doc.cloudinaryUrl
        return doc
      },
    ],

    // Upload to Cloudinary before persisting the document
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        const fileBuffer = req.file?.data

        if (!fileBuffer) {
          if (operation === 'update' && originalDoc) {
            data.cloudinaryPublicId ??= originalDoc.cloudinaryPublicId
            data.cloudinaryUrl ??= originalDoc.cloudinaryUrl
          }
          return data
        }

        try {
          const uploadResult: any = await new Promise((resolve, reject) => {
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

          req.payload.logger.info(`Cloudinary upload success → ${uploadResult.public_id}`)

          data.cloudinaryPublicId = uploadResult.public_id
          data.cloudinaryUrl = uploadResult.secure_url

          if (
            operation === 'update' &&
            originalDoc?.cloudinaryPublicId &&
            originalDoc.cloudinaryPublicId !== uploadResult.public_id
          ) {
            try {
              await cloudinary.uploader.destroy(originalDoc.cloudinaryPublicId)
              req.payload.logger.info(
                `Cloudinary replaced → deleted ${originalDoc.cloudinaryPublicId}`
              )
            } catch (deleteErr: any) {
              req.payload.logger.warn(
                `Failed to delete old Cloudinary asset ${originalDoc.cloudinaryPublicId}: ${deleteErr.message}`
              )
            }
          }

          return data
        } catch (err: any) {
          req.payload.logger.error(`Cloudinary upload failed → ${err.message}`)
          return data
        }
      },
    ],

    // Delete from Cloudinary when media deleted
    afterDelete: [
      async ({ req, doc }) => {
        try {
          if (doc?.cloudinaryPublicId) {
            await cloudinary.uploader.destroy(doc.cloudinaryPublicId)
            req.payload.logger.info(`Cloudinary deleted → ${doc.cloudinaryPublicId}`)
          } else {
            req.payload.logger.warn('No cloudinaryPublicId found on deleted document')
          }
        } catch (err) {
          req.payload.logger.error(`Cloudinary delete failed → ${err}`)
        }
      },
    ],
  },
}

export default Media
