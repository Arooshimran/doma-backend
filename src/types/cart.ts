export type RelationValue =
  | string
  | number
  | null
  | undefined
  | {
      value?: string | number | null
      id?: string | number | null
    }

export type CartProduct = {
  id: string
  price?: number | null
  pricing?: {
    price?: number | null
    discountedPrice?: number | null
  } | null
  inventory?: {
    quantity?: number | null
  } | null
  title?: string | null
}

export type CartItemInput = {
  id?: string | number | null
  _id?: string | number | null
  product?: RelationValue
  quantity?: number | null
  unitPrice?: number | null
  lineTotal?: number | null
}

export type NormalizedCartItem = {
  product: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

