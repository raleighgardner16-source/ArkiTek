// Central configuration - API base URL
// In development: defaults to http://localhost:3001
// In production: use relative URLs (same domain) or set VITE_API_URL if needed
export const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '' : 'http://localhost:3001')

