import { getAuthHeaders } from './api'

interface StreamFetchCallbacks {
  onToken?: (content: string) => void
  onStatus?: (message: string) => void
  onError?: (message: string) => void
  onEvent?: (parsed: any) => void
  signal?: AbortSignal
}

/**
 * Streaming fetch utility for SSE endpoints.
 * Calls onToken for each incoming token, onStatus for status updates,
 * and returns the final metadata from the 'done' event.
 * Optionally accepts an AbortSignal to cancel the stream.
 */
export async function streamFetch(url: string, body: any, { onToken, onStatus, onError, onEvent, signal }: StreamFetchCallbacks): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalData: any = null

  const processLine = (line: string): void => {
    if (!line.startsWith('data: ')) return
    const jsonStr = line.replace('data: ', '').trim()
    if (!jsonStr) return

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch (e) {
      // Skip unparseable lines (malformed JSON)
      return
    }

    if (onEvent) {
      try {
        onEvent(parsed)
      } catch (_) {
        // Ignore callback errors so stream processing continues
      }
    }

    switch (parsed.type) {
      case 'token':
        if (parsed.content && onToken) {
          onToken(parsed.content)
        }
        break
      case 'status':
        if (parsed.message && onStatus) {
          onStatus(parsed.message)
        }
        break
      case 'done':
        finalData = parsed
        break
      case 'error': {
        const errorMsg = parsed.message || 'Unknown streaming error'
        if (onError) {
          try { onError(errorMsg) } catch (_) { /* callback may throw, don't swallow the SSE error */ }
        }
        throw new Error(errorMsg)
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      processLine(line)
    }
  }

  // Flush any remaining bytes from the decoder and process leftover buffer
  buffer += decoder.decode()
  if (buffer.trim()) {
    const remainingLines = buffer.split('\n')
    for (const line of remainingLines) {
      processLine(line)
    }
  }

  return finalData
}
