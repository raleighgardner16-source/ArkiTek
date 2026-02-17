/**
 * Streaming fetch utility for SSE endpoints.
 * Calls onToken for each incoming token, onStatus for status updates,
 * and returns the final metadata from the 'done' event.
 * Optionally accepts an AbortSignal to cancel the stream.
 */
export async function streamFetch(url, body, { onToken, onStatus, onError, signal }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalData = null

  const processLine = (line) => {
    if (!line.startsWith('data: ')) return
    const jsonStr = line.replace('data: ', '').trim()
    if (!jsonStr) return

    try {
      const parsed = JSON.parse(jsonStr)

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
        case 'error':
          if (onError) {
            onError(parsed.message || 'Unknown streaming error')
          }
          throw new Error(parsed.message || 'Streaming error')
      }
    } catch (e) {
      if (e.message?.includes('Streaming error') || e.message?.includes('Unknown streaming error')) {
        throw e
      }
      // Skip unparseable lines
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

