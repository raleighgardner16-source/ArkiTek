import axios from 'axios'
import * as cheerio from 'cheerio'
import { API_KEYS } from '../config/index.js'
import { getCurrentMonthYear } from '../helpers/date.js'

async function performSerperSearch(query: string, num: number = 10): Promise<any> {
  const apiKey = API_KEYS.serper
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('No Serper API key configured. Please add SERPER_API_KEY to the backend .env file.')
  }

  const dateTag = getCurrentMonthYear()
  const datedQuery = `${query} ${dateTag}`

  console.log('[Serper] Search request:', { original: query, datedQuery, num })

  const response = await axios.post(
    'https://google.serper.dev/search',
    { q: datedQuery, num },
    {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    }
  )

  console.log('[Serper] Search successful, results:', response.data?.organic?.length || 0)
  return response.data
}

function buildSearchContextSnippet(contextSummaries: any[] = [], fallbackText: string = ''): string {
  const parts = []
  const latest = Array.isArray(contextSummaries) && contextSummaries.length > 0 ? contextSummaries[0] : null

  if (latest?.originalPrompt) {
    parts.push(`Previous user prompt: ${String(latest.originalPrompt).substring(0, 500)}`)
  }

  const latestAssistant = latest?.isFull && latest?.response ? latest.response : latest?.summary
  if (latestAssistant) {
    parts.push(`Previous assistant response: ${String(latestAssistant).substring(0, 1000)}`)
  } else if (fallbackText && String(fallbackText).trim()) {
    parts.push(`Previous assistant response: ${String(fallbackText).substring(0, 1000)}`)
  }

  return parts.join('\n')
}

async function reformulateSearchQuery(userMessage: string, userId: string | null = null, contextSnippet: string = ''): Promise<string> {
  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      console.warn('[Query Reformulation] Google API key not configured, using raw query')
      return userMessage
    }

    const { trackUsage } = await import('./usage.js')

    const trimmedContext = String(contextSnippet || '').trim()
    const contextBlock = trimmedContext
      ? `\nConversation context (use this to resolve references like "this", "that", "it", and "latest"):\n${trimmedContext}\n`
      : ''

    const reformulationPrompt = `Convert the following user message into a concise, effective Google search query. 
- Remove conversational language, filler words, and self-referential pronouns (e.g. "your", "you", "my")
- Focus on the core topic the user wants information about
- If the message is a follow-up with vague references, resolve them using the conversation context
- Preserve specific topic nouns from context so the query is not generic
- Keep it under 10 words if possible
- Output ONLY the search query, nothing else
${contextBlock}

User message: "${userMessage}"

Search query:`

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: reformulationPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 50
        }
      }
    )

    const reformulated = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    
    if (reformulated && reformulated.length > 3 && reformulated.length < 200) {
      console.log(`[Query Reformulation] "${userMessage}" -> "${reformulated}"`)
      
      if (userId) {
        const inputTokens = response.data.usageMetadata?.promptTokenCount || 0
        const outputTokens = response.data.usageMetadata?.candidatesTokenCount || 0
        if (inputTokens || outputTokens) {
          trackUsage(userId, 'google', 'gemini-2.5-flash-lite', inputTokens, outputTokens)
        }
      }
      
      return reformulated
    }
    
    console.warn('[Query Reformulation] Bad reformulation result, using raw query')
    return userMessage
  } catch (error: any) {
    console.error('[Query Reformulation] Error:', error.message)
    return userMessage
  }
}

const fetchPageContent = async (url: string, timeout: number = 10000): Promise<string | null> => {
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      maxRedirects: 5
    })
    
    const $ = cheerio.load(response.data)
    $('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar').remove()
    
    let content = ''
    const mainContent = $('article, main, [role="main"], .content, .post-content, .entry-content, .article-content')
    if (mainContent.length > 0) {
      const paragraphs = mainContent.first().find('p').map((i, el) => $(el).text().trim()).get()
      const validParagraphs = paragraphs.filter(p => p.length > 20).slice(0, 4)
      content = validParagraphs.join(' ')
      if (content.length < 200) {
        content = mainContent.first().text()
      }
    } else {
      const paragraphs = $('body p').map((i, el) => $(el).text().trim()).get()
      const validParagraphs = paragraphs.filter(p => p.length > 20).slice(0, 4)
      content = validParagraphs.join(' ')
      if (content.length < 200) {
        content = $('body').text()
      }
    }
    
    content = content.replace(/\s+/g, ' ').trim()
    
    if (content.length > 1500) {
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [content]
      const firstSentences = sentences.slice(0, 10).join(' ')
      if (firstSentences.length > 1500) {
        content = firstSentences.substring(0, 1500) + '...'
      } else {
        content = firstSentences
      }
    }
    
    return content || null
  } catch (error: any) {
    console.log(`[Web Scraping] Failed to fetch ${url}: ${error.message}`)
    return null
  }
}

const isNonParseableSource = (url: string): boolean => {
  const nonParseablePatterns = [
    /youtube\.com/i,
    /youtu\.be/i,
    /vimeo\.com/i,
    /tiktok\.com/i,
    /\.mp4$/i,
    /\.mov$/i,
    /\.avi$/i,
    /\.mkv$/i,
    /\.webm$/i,
    /\.flv$/i,
  ]
  return nonParseablePatterns.some(pattern => pattern.test(url))
}

const formatSearchResults = async (searchResults: any[], maxParseableSources: number = 5): Promise<string> => {
  let formatted = ''
  let parseableCount = 0
  const processedUrls = new Set()
  
  for (let index = 0; index < searchResults.length; index++) {
    const result = searchResults[index]
    
    if (isNonParseableSource(result.link)) {
      console.log(`[Web Scraping] Skipping non-parseable source: ${result.link}`)
      continue
    }
    
    if (parseableCount >= maxParseableSources) {
      console.log(`[Web Scraping] Reached maximum of ${maxParseableSources} parseable sources, stopping`)
      break
    }
    
    processedUrls.add(result.link)
    formatted += `${parseableCount + 1}. ${result.title}\n`
    formatted += `   URL: ${result.link}\n`
    formatted += `   Snippet: ${result.snippet}\n`
    
    console.log(`[Web Scraping] Fetching content from: ${result.link}`)
    const pageContent = await fetchPageContent(result.link)
    
    if (pageContent && pageContent.trim().length > 100) {
      formatted += `   Full Content: ${pageContent}\n`
      parseableCount++
    } else {
      formatted += `   Full Content: [Unable to fetch substantial content - using snippet only]\n`
    }
    
    formatted += '\n'
  }
  
  if (parseableCount < maxParseableSources) {
    console.warn(`[Web Scraping] Only found ${parseableCount} parseable sources (wanted ${maxParseableSources})`)
  } else {
    console.log(`[Web Scraping] Successfully processed ${parseableCount} parseable sources`)
  }
  
  return formatted
}

const formatRawSourcesForPrompt = async (searchResults: any[], maxParseableSources: number = 5): Promise<{ formatted: string; sourceCount: number; scrapedSources: any[] }> => {
  let formatted = ''
  let parseableCount = 0
  const scrapedSources: any[] = []
  
  for (let index = 0; index < searchResults.length; index++) {
    const result = searchResults[index]
    
    if (isNonParseableSource(result.link)) {
      console.log(`[Raw Sources] Skipping non-parseable source: ${result.link}`)
      continue
    }
    
    if (parseableCount >= maxParseableSources) {
      console.log(`[Raw Sources] Reached maximum of ${maxParseableSources} parseable sources, stopping`)
      break
    }
    
    console.log(`[Raw Sources] Fetching content from: ${result.link}`)
    const pageContent = await fetchPageContent(result.link)
    
    parseableCount++
    const sourceNum = parseableCount
    
    formatted += `Source ${sourceNum}: "${result.title}"\n`
    formatted += `URL: ${result.link}\n`
    
    if (pageContent && pageContent.trim().length > 100) {
      formatted += `Content: ${pageContent}\n`
      scrapedSources.push({ title: result.title, link: result.link, snippet: result.snippet, hasContent: true })
    } else {
      formatted += `Content: ${result.snippet || '[Unable to fetch content]'}\n`
      scrapedSources.push({ title: result.title, link: result.link, snippet: result.snippet, hasContent: false })
    }
    
    formatted += '\n'
  }
  
  if (parseableCount < maxParseableSources) {
    console.warn(`[Raw Sources] Only found ${parseableCount} parseable sources (wanted ${maxParseableSources})`)
  } else {
    console.log(`[Raw Sources] Successfully processed ${parseableCount} parseable sources`)
  }
  
  return { formatted, sourceCount: parseableCount, scrapedSources }
}

const verifyExtraction = (rawText: string, factsJson: any[]): { verifiedFacts: any[]; discardRate: number } => {
  const verifiedFacts = []
  let discardedCount = 0
  
  for (const item of factsJson) {
    const factText = item.fact || ''
    const sourceQuote = item.source_quote || ''
    const sourceUrl = item.source_url || ''
    
    if (sourceQuote && rawText.toLowerCase().includes(sourceQuote.toLowerCase())) {
      verifiedFacts.push({
        fact: factText,
        source_quote: sourceQuote,
        source_url: sourceUrl
      })
    } else {
      discardedCount++
      console.log(`[Refiner] Hallucination detected! Discarding: ${factText.substring(0, 50)}...`)
    }
  }
  
  const discardRate = factsJson.length > 0 ? discardedCount / factsJson.length : 0
  console.log(`[Refiner] Verification: ${verifiedFacts.length}/${factsJson.length} facts verified (${(discardRate * 100).toFixed(1)}% discarded)`)
  
  return { verifiedFacts, discardRate }
}

const cleanMistralResponse = (content: string | null | undefined): string | null | undefined => {
  if (!content || typeof content !== 'string') {
    return content
  }
  
  const trimmed = content.trim()
  
  if (trimmed.startsWith('{') && trimmed.includes('"type":"thinking"')) {
    try {
      let braceCount = 0
      let jsonEndIndex = -1
      let inString = false
      let escapeNext = false
      
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i]
        
        if (escapeNext) {
          escapeNext = false
          continue
        }
        
        if (char === '\\') {
          escapeNext = true
          continue
        }
        
        if (char === '"') {
          inString = !inString
          continue
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++
          } else if (char === '}') {
            braceCount--
            if (braceCount === 0) {
              jsonEndIndex = i
              break
            }
          }
        }
      }
      
      if (jsonEndIndex >= 0) {
        const afterJson = trimmed.substring(jsonEndIndex + 1).trim()
        if (afterJson.length > 0) {
          console.log('[Mistral Clean] Extracted text after thinking JSON:', afterJson.substring(0, 100))
          return afterJson
        }
      }
      
      if (jsonEndIndex >= 0) {
        const jsonPart = trimmed.substring(0, jsonEndIndex + 1)
        try {
          const parsed = JSON.parse(jsonPart)
          if (parsed.type === 'thinking' && Array.isArray(parsed.thinking)) {
            const afterJson = trimmed.substring(jsonEndIndex + 1).trim()
            if (afterJson.length > 0) {
              return afterJson
            }
            const textItems = parsed.thinking.filter((item: any) => item.type === 'text' && item.text)
            if (textItems.length > 0) {
              return textItems[textItems.length - 1].text
            }
          }
        } catch (parseError) {
          // JSON parsing failed, continue to next fallback
        }
      }
      
      const jsonMatch = trimmed.match(/^(\{[^}]*"type"\s*:\s*"thinking"[^}]*\})/s)
      if (jsonMatch) {
        const afterJson = trimmed.substring(jsonMatch[0].length).trim()
        if (afterJson.length > 0) {
          console.log('[Mistral Clean] Extracted text using regex:', afterJson.substring(0, 100))
          return afterJson
        }
      }
      
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.type === 'thinking' && Array.isArray(parsed.thinking)) {
          const textItems = parsed.thinking.filter((item: any) => item.type === 'text' && item.text)
          if (textItems.length > 0) {
            return textItems[textItems.length - 1].text
          }
        }
        if (parsed.text) {
          return parsed.text
        }
      } catch (parseError) {
        // If parsing fails, it means there's text after JSON
      }
      
      console.warn('[Mistral Clean] Could not clean response, returning as-is')
      return content
    } catch (e: any) {
      console.error('[Mistral Clean] Error cleaning response:', e.message)
      return content
    }
  }
  
  return content
}

export {
  performSerperSearch,
  buildSearchContextSnippet,
  reformulateSearchQuery,
  fetchPageContent,
  isNonParseableSource,
  formatSearchResults,
  formatRawSourcesForPrompt,
  verifyExtraction,
  cleanMistralResponse,
}
