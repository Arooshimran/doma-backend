import Image from 'next/image'
import React from 'react'

export const Logo = () => {
  return (
    <Image
      src="/doma-logo-2.png"
      alt="DOMA"
      width={180}
      height={60}
      priority
    />
  )
}