// Central configuration
// In development: defaults to http://localhost:3001
// In production: use relative URLs (same domain) or set VITE_API_URL if needed
export const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '' : 'http://localhost:3001')

export const API_VERSION = 'v1'
export const API_PREFIX = `/api/${API_VERSION}`
