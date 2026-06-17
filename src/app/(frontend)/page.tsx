import { headers as getHeaders } from 'next/headers.js'
import Image from 'next/image'
import { getPayload } from 'payload'
import React from 'react'
import { fileURLToPath } from 'url'
import config from '@/payload.config'
import './styles.css'

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  const fileURL = `vscode://file/${fileURLToPath(import.meta.url)}`

  return (
    <div className="home">
      <div className="content">
        <div className="logo-wrap">
          <Image
            alt="DOMA Logo"
            height={80}
            src="/doma-logo-2.png"
            width={220}
            priority
          />
        </div>

        {!user && <h1>Admin Dashboard</h1>}
        {user && <h1>Welcome back, {(user as any).firstName}  </h1>}

        <p className="subtitle">Multi-Vendor Furniture Platform</p>

        <div className="links">
          <a
            className="admin"
            href={payloadConfig.routes.admin}
            rel="noopener noreferrer"
            target="_blank"
          >
            Go to Admin Panel
          </a>
          {/* <a
            className="docs"
            href="https://payloadcms.com/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            Documentation
          </a> */}
        </div>

        <div className="divider" />
      </div>

      {/* <div className="footer">
        <p>Update this page by editing</p>
        <a className="codeLink" href={fileURL}>
          <code>app/(frontend)/page.tsx</code>
        </a>
      </div> */}
    </div>
  )
}