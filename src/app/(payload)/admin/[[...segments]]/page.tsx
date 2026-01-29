/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import type { Metadata } from 'next'

import config from '@payload-config'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import { importMap } from '../importMap'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

const Page = ({ params, searchParams }: Args) => {
  try {
    return RootPage({ config, params, searchParams, importMap })
  } catch (error) {
    // Prevent server crash during render if a client-only module is accessed here.
    // Log the error and show a minimal fallback so the server can continue serving pages.
    // The admin UI should still load client-side where possible.
    // This is a safe, temporary mitigation to avoid production server crashes.
    // eslint-disable-next-line no-console
    console.error('[Payload admin render error]', error)
    return <div>Admin temporarily unavailable</div>
  }
}

export default Page
