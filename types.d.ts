declare module 'disposable-email-domains' {
  const domains: string[]
  export = domains
}

declare namespace Express {
  interface Request {
    userId?: string
  }
}
