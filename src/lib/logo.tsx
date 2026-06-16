import Image from 'next/image'
import React from 'react'

export const Logo = () => {
  return (
    <Image
      src="/logo-ez-ez.png"
      alt="DOMA"
      width={180}
      height={60}
      priority
    />
  )
}