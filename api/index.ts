import app, { initializeForServerless } from '../server.js'

export default async function handler(req: any, res: any): Promise<any> {
  await initializeForServerless()
  return app(req, res)
}
