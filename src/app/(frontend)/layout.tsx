import React from 'react'
import './styles.css'

export const metadata = {
  description: 'DOMA\'s Backend.',
  icons: [{ rel: 'icon', url: '/logo-ez-ez.png' }],
  title: 'DOMA - Admin Panel',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
