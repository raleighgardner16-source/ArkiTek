import axios from 'axios'
import { API_KEYS } from '../config/index.js'
import { countTokens, extractTokensFromResponse } from '../../utils/tokenCounters.js'
import { trackUsage, getCurrentDateStringForUser } from './usage.js'
import db from '../../database/db.js'

const detectCategoryForJudge = async (prompt, userId = null) => {
  const todayDate = await getCurrentDateStringForUser(userId)
  const categoryPrompt = `Today's date is ${todayDate}.

Classify the user prompt into EXACTLY ONE category from the list below.
Determine if a web search would genuinely help answer the query.
Determine if the user's prompt might benefit from context of their previous conversations (memory).

needsSearch = true when:
- The query asks about current events, recent news, or real-time information
- The query references "today", "this year", "this week", "recently", "right now", "currently", "gonna", or any time-relative language
- The query needs factual verification (specific facts, statistics, dates)
- The query asks about specific people, companies, or events that may have recent updates
- The query asks about weather, prices, scores, or anything that changes frequently
- The query asks about rankings, comparisons, or "who/what is best" in a field that evolves over time (e.g. AI, tech, sports, politics, business)
- The query asks for predictions or opinions about factual/evolving topics (e.g. "who will win the AI race", "what's the best phone right now", "which company is leading in X") — even if phrased as an opinion, the answer depends on current real-world data
- The query mentions specific products, models, tools, or technologies that are actively being updated or released (e.g. AI models, software, hardware, games, etc.)

needsSearch = false ONLY when:
- The query is purely about timeless concepts, explanations, or "how does X work" (e.g. "how does gravity work", "explain recursion")
- The query asks for purely personal/creative content with no factual basis needed (e.g. "write me a poem", "give me life advice")
- The query is about well-established historical knowledge that does NOT change (e.g. "when was the French Revolution", "what is the speed of light")

IMPORTANT: When in doubt, set needsSearch = true. It is much better to search unnecessarily than to miss providing current information. If the topic is even slightly time-sensitive or involves entities that change over time, set needsSearch = true.

needsContext = true when:
- The query references something previously discussed (e.g. "going back to what we talked about", "remember when I asked about", "like I said before", "as we discussed")
- The query is a follow-up or continuation of a topic the user likely discussed before (e.g. "what else should I know about investing" — implies prior investing discussion)
- The query uses pronouns that reference a past topic without naming it (e.g. "tell me more about that", "can you expand on it")

needsContext = false when:
- The query is completely self-contained and does not reference any prior conversation
- The query is a brand new topic with no indication the user has discussed it before
- The query is purely creative or standalone (e.g. "write me a poem about the ocean", "what is 2+2")

Output ONLY this JSON:
{
  "category": "CategoryName",
  "needsSearch": false,
  "needsContext": false
}

Categories:
1 Science
2 Tech
3 Business
4 Health
5 Politics/Law
6 History/Geography
7 Philosophy/Religion
8 Arts/Culture
9 Lifestyle/Self-Improvement
10 General Knowledge/Other

User prompt:
"${prompt}"`

  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      throw new Error('Google API key not configured')
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: categoryPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200
        }
      }
    )
    
    if (userId) {
      const responseTokens = extractTokensFromResponse(response.data, 'google')
      if (responseTokens) {
        trackUsage(userId, 'google', 'gemini-2.5-flash-lite', responseTokens.inputTokens || 0, responseTokens.outputTokens || 0, true)
      }
    }

    const categoryResponse = response.data.candidates[0].content.parts[0].text.trim()
    const lowerResponse = categoryResponse.toLowerCase()

    let needsSearch = false
    let needsContext = false
    let category = 'General Knowledge/Other'

    try {
      let jsonContent = categoryResponse
      if (jsonContent.includes('```json')) {
        jsonContent = jsonContent.split('```json')[1].split('```')[0].trim()
      } else if (jsonContent.includes('```')) {
        jsonContent = jsonContent.split('```')[1].split('```')[0].trim()
      }
      
      const parsed = JSON.parse(jsonContent)
      needsSearch = parsed.needsSearch === true
      needsContext = parsed.needsContext === true
      category = parsed.category || 'General Knowledge/Other'
    } catch (parseError) {
      needsSearch = lowerResponse.includes('"needsSearch":true') || 
                   lowerResponse.includes('needsSearch: true') ||
                   (lowerResponse.includes('yes') && (lowerResponse.includes('search') || lowerResponse.includes('web')))
      needsContext = lowerResponse.includes('"needsContext":true') || 
                    lowerResponse.includes('needsContext: true')
      
      if (lowerResponse.includes('science')) category = 'Science'
      else if (lowerResponse.includes('tech') || lowerResponse.includes('technology')) category = 'Tech'
      else if (lowerResponse.includes('business')) category = 'Business'
      else if (lowerResponse.includes('health')) category = 'Health'
      else if (lowerResponse.includes('politics') || lowerResponse.includes('law')) category = 'Politics/Law'
      else if (lowerResponse.includes('history') || lowerResponse.includes('geography')) category = 'History/Geography'
      else if (lowerResponse.includes('philosophy') || lowerResponse.includes('religion')) category = 'Philosophy/Religion'
      else if (lowerResponse.includes('arts') || lowerResponse.includes('culture')) category = 'Arts/Culture'
      else if (lowerResponse.includes('lifestyle') || lowerResponse.includes('self-improvement')) category = 'Lifestyle/Self-Improvement'
    }

    return { category, needsSearch, needsContext }
  } catch (error) {
    console.error('[Category Detection] Error:', error)
    return { category: 'General Knowledge/Other', needsSearch: false, needsContext: false }
  }
}

const summarizeJudgeResponse = async (judgeResponseText, userId = null) => {
  console.log('[Summarize] Summarizing judge response using Gemini 2.5 Flash Lite')
  
  const summaryPrompt = `Summarize this response in 75 tokens or less. Be concise but preserve key information and context:

${judgeResponseText}

Provide only the summary (max 75 tokens):`
  
  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      console.warn('[Summarize] Google API key not configured, using fallback truncation')
      return { 
        summary: judgeResponseText.substring(0, 200) + (judgeResponseText.length > 200 ? '...' : ''), 
        tokens: 50
      }
    }
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: summaryPrompt }] }],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.3
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
    let summary = response.data.candidates[0].content.parts[0].text.trim()
    let tokens = await countTokens(summary, 'google', 'gemini-2.5-flash-lite')
    
    if (tokens > 75) {
      console.log(`[Summarize] Summary is ${tokens} tokens, truncating to 75...`)
      const words = summary.split(' ')
      let truncated = ''
      let tokenCount = 0
      
      for (const word of words) {
        const wordTokens = await countTokens(word + ' ', 'google', 'gemini-2.5-flash-lite')
        if (tokenCount + wordTokens > 75) break
        truncated += (truncated ? ' ' : '') + word
        tokenCount += wordTokens
      }
      
      summary = truncated + (truncated.length < summary.length ? '...' : '')
      tokens = tokenCount
    }
    
    if (userId) {
      const responseTokens = extractTokensFromResponse(response.data, 'google')
      let inputTokens = 0
      let outputTokens = 0
      
      if (responseTokens) {
        inputTokens = responseTokens.inputTokens || 0
        outputTokens = responseTokens.outputTokens || 0
      } else {
        inputTokens = await countTokens(summaryPrompt, 'google', 'gemini-2.5-flash-lite')
        outputTokens = await countTokens(summary, 'google', 'gemini-2.5-flash-lite')
      }
      
      trackUsage(userId, 'google', 'gemini-2.5-flash-lite', inputTokens, outputTokens, true)
    }
    
    console.log(`[Summarize] Summary created: ${tokens} tokens`)
    return { summary, tokens }
  } catch (error) {
    console.error('[Summarize] Error summarizing judge response:', error)
    return { 
      summary: judgeResponseText.substring(0, 200) + (judgeResponseText.length > 200 ? '...' : ''), 
      tokens: 50
    }
  }
}

const storeJudgeContext = async (userId, judgeResponse, originalPrompt = null) => {
  if (!userId) return
  
  try {
    const userUsage = await db.usage.getOrDefault(userId)
    
    if (!userUsage.judgeConversationContext) {
      userUsage.judgeConversationContext = []
    }
    
    const context = userUsage.judgeConversationContext
    
    if (context.length > 0 && context[0].isFull) {
      console.log('[Judge Context] Summarizing previous full response before adding new one')
      const { summary, tokens } = await summarizeJudgeResponse(context[0].response, userId)
      context[0] = {
        summary,
        tokens,
        originalPrompt: context[0].originalPrompt,
        timestamp: context[0].timestamp,
        isFull: false
      }
    }
    
    context.unshift({
      response: judgeResponse,
      summary: null,
      tokens: null,
      originalPrompt: originalPrompt || null,
      timestamp: new Date().toISOString(),
      isFull: true
    })
    
    const trimmedContext = context.slice(0, 5)
    await db.usage.update(userId, { judgeConversationContext: trimmedContext })
    console.log(`[Judge Context] Stored full response for user ${userId}, total context entries: ${trimmedContext.length}`)
  } catch (error) {
    console.error('[Judge Context] Error storing context:', error)
  }
}

const storeModelContext = async (userId, modelName, modelResponse, originalPrompt = null) => {
  if (!userId || !modelName) return
  
  try {
    const userUsage = await db.usage.getOrDefault(userId)
    
    if (!userUsage.modelConversationContext) {
      userUsage.modelConversationContext = {}
    }
    
    if (!userUsage.modelConversationContext[modelName]) {
      userUsage.modelConversationContext[modelName] = []
    }
    
    const context = userUsage.modelConversationContext[modelName]
    
    if (context.length > 0 && context[0].isFull) {
      console.log(`[Model Context] Summarizing previous full response for ${modelName} before adding new one`)
      const { summary, tokens } = await summarizeJudgeResponse(context[0].response, userId)
      context[0] = {
        summary,
        tokens,
        originalPrompt: context[0].originalPrompt,
        timestamp: context[0].timestamp,
        isFull: false
      }
    }
    
    context.unshift({
      response: modelResponse,
      summary: null,
      tokens: null,
      originalPrompt: originalPrompt || null,
      timestamp: new Date().toISOString(),
      isFull: true
    })
    
    userUsage.modelConversationContext[modelName] = context.slice(0, 5)
    await db.usage.update(userId, { modelConversationContext: userUsage.modelConversationContext })
    console.log(`[Model Context] Stored full response for ${modelName}, user ${userId}, total context entries: ${userUsage.modelConversationContext[modelName].length}`)
  } catch (error) {
    console.error(`[Model Context] Error storing context for ${modelName}:`, error)
  }
}

export {
  detectCategoryForJudge,
  summarizeJudgeResponse,
  storeJudgeContext,
  storeModelContext,
}
