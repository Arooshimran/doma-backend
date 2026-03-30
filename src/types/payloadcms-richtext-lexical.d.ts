declare module '@payloadcms/richtext-lexical' {
  // Payload exposes a lexical editor factory; we keep this intentionally loose
  // to avoid tightly-coupling to Payload's internal types.
  export const lexicalEditor: (...args: any[]) => any
}

