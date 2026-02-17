import app, { initializeForServerless } from '../server.js'

export default async function handler(req, res) {
  await initializeForServerless()
  return app(req, res)
}

