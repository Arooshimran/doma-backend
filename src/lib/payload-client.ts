import { getPayload } from 'payload'
import config from '@payload-config'

let cachedPayload: any = null

export const getPayloadClient = async () => {
  // Return cached instance if it exists
  if (cachedPayload) {
    return cachedPayload
  }

  try {
    // Create new payload instance only if one doesn't exist
    cachedPayload = await getPayload({ config })
    return cachedPayload
  } catch (error) {
    console.error('Failed to initialize Payload:', error)
    throw error
  }
}

// Alternative approach - you can also try this singleton pattern
export class PayloadSingleton {
  private static instance: any = null
  private static initPromise: Promise<any> | null = null

  static async getInstance() {
    if (this.instance) {
      return this.instance
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = getPayload({ config })
    
    try {
      this.instance = await this.initPromise
      this.initPromise = null
      return this.instance
    } catch (error) {
      this.initPromise = null
      throw error
    }
  }
}