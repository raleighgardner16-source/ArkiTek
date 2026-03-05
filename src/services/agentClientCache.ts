import { OpenClawClient } from './openclawClient'

const clientCache = new Map<string, OpenClawClient>()

export function getClient(agentId: string): OpenClawClient | undefined {
  return clientCache.get(agentId)
}

export function setClient(agentId: string, client: OpenClawClient): void {
  clientCache.set(agentId, client)
}

export function destroyAllClients(): void {
  for (const client of clientCache.values()) {
    client.destroy()
  }
  clientCache.clear()
}

export function getCacheSize(): number {
  return clientCache.size
}
