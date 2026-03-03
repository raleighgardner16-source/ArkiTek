import { API_PREFIX, API_URL } from './config'
import { getAuthHeaders } from './api'

interface SelectedModel {
  id: string
  model: string
  type: string
  label: string
}

interface SelectedProvider {
  providerKey: string
  providerName: string
  models: SelectedModel[]
}

interface CategoryResult {
  category: string
  needsSearch: boolean
  needsContext: boolean
  recommendedModelType: string
  recommendedModels: Record<string, string>
  rawResponse?: string
  prompt?: string
  tokens: any | null
}

interface BackgroundTheme {
  type: string
  description: string
  colors: string[]
}


// Detect category, determine if web search is needed, and recommend model types using Gemini 2.5 Flash Lite
// selectedProviders: Array of { providerKey, providerName, models: [{ id, model, type, label }] }
export const detectCategory = async (prompt: string, selectedProviders: SelectedProvider[] = [], isDebateMode: boolean = false): Promise<CategoryResult> => {
  if (!prompt || !prompt.trim()) {
    return { 
      category: 'General Knowledge/Other', 
      needsSearch: false,
      needsContext: false,
      recommendedModelType: 'versatile',
      recommendedModels: {},
      tokens: null // No tokens when prompt is empty
    }
  }

  // Build model list for prompt
  let modelsList = ''
  if (selectedProviders.length > 0) {
    modelsList = '\n\nAvailable Models by Provider:\n'
    selectedProviders.forEach(({ providerKey, providerName, models }) => {
      modelsList += `\n${providerName} (${providerKey}):\n`
      models.forEach(({ id, model, type, label }) => {
        modelsList += `  - ${model} (${label} Model, type: ${type}, id: ${id})\n`
      })
    })
    modelsList += '\n'
  }

  // Build the JSON structure string - IMPORTANT: Show false as the default!
  let jsonStructure = `{
  "category": "CategoryName",
  "needsSearch": false,
  "needsContext": false,
  "recommendedModelType": "versatile"`
  
  if (selectedProviders.length > 0) {
    jsonStructure += `,
  "recommendedModels": { "providerKey": "modelId" }`
  }
  
  jsonStructure += `
}`

  // Include today's date so the model understands time-relative queries like "today", "this week", etc.
  const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const categoryPrompt = `Today's date is ${todayDate}.

Classify the user prompt into EXACTLY ONE category from the list below.
IMPORTANT: Always prefer the most specific category. "General Knowledge/Other" is a fallback — only use it when no other category applies. For example, a question about a singer belongs in Arts/Culture, a question about a president belongs in Politics/Law, a question about movies belongs in Arts/Culture.
Determine if a web search would genuinely help answer the query. Recommend a SINGLE model type for ALL providers.
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
${isDebateMode ? `
DEBATE MODE IS ACTIVE — apply a LOWER threshold for needsSearch:
- needsSearch = true if the topic involves real-world entities (people, organizations, policies, countries, technologies) where current data would strengthen debate arguments
- needsSearch = true if the user's claim or opinion could be fact-checked, contextualized, or challenged using recent events or data
- needsSearch = true if the topic touches politics, economics, science, tech, or any domain where the landscape has evolved recently
- needsSearch = false ONLY when the prompt is purely personal, aspirational, hypothetical, or philosophical with NO grounding in verifiable current facts (e.g. "I will be president some day", "what is the meaning of life", "I think dogs are better than cats", "write me a story")
- If the user expresses a personal goal or aspiration without referencing specific real-world facts or entities that need verification, set needsSearch = false
` : ''}
needsContext = true when:
- The query references something previously discussed (e.g. "going back to what we talked about", "remember when I asked about", "like I said before")
- The query is a follow-up or continuation of a topic the user likely discussed before (e.g. "what else should I know about investing" — implies prior investing discussion)
- The query uses pronouns that reference a past topic without naming it (e.g. "tell me more about that", "can you expand on it")

needsContext = false when:
- The query is completely self-contained and does not reference any prior conversation
- The query is a brand new topic with no indication the user has discussed it before
- The query is purely creative or standalone (e.g. "write me a poem about the ocean", "what is 2+2")

CRITICAL: The recommendedModelType you choose will be applied to EVERY provider. Choose ONE type.

Output ONLY this JSON:
${jsonStructure}

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

Model types (choose ONE for ALL providers):
reasoning = complex logic, math, coding, analysis, step-by-step thinking, business strategy, planning, how-to guides, in-depth explanations, research, comparisons, decision-making
versatile = casual conversation, creative writing, simple Q&A, opinions, brainstorming, short-form content  
fast = simple queries, quick responses, low-latency needs, trivial facts, greetings

User prompt:
"${prompt}"${modelsList}

${selectedProviders.length > 0 ? 'IMPORTANT: Select ONE model per provider. You MUST use the SAME model type (reasoning, versatile, or fast) for ALL providers - no exceptions! Return the model IDs (e.g., "openai-gpt-5.2", "google-gemini-3.1-pro") in recommendedModels.' : ''}`

  try {
    const response = await fetch(`${API_URL}${API_PREFIX}/llm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        provider: 'google',
        model: 'gemini-2.5-flash-lite',
        prompt: categoryPrompt,
        userId: null,
        isSummary: false,
      }),
    })

    if (!response.ok) {
      console.error('[Category Detection] Error from API:', response.statusText)
      return { 
        category: 'General Knowledge/Other', 
        needsSearch: false,
        needsContext: false,
        recommendedModelType: 'versatile',
        recommendedModels: {},
        rawResponse: `API Error: ${response.statusText}`,
        prompt: categoryPrompt,
        tokens: null
      }
    }

    const data: any = await response.json()
    const categoryResponse: string = data.text?.trim() || ''
    const rawResponse = categoryResponse // Store raw response for display
    const tokens = data.tokens || null // Extract tokens from API response
    

    // Try to parse JSON response
    try {
      // Extract JSON from response (in case there's extra text or markdown code blocks)
      // First try to find JSON in code blocks
      let jsonString = categoryResponse
      
      // Remove markdown code blocks if present
      jsonString = jsonString.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      
      // Try to find JSON object
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const category: string = parsed.category || parsed.Category || ''
        const needsSearch: boolean = parsed.needsSearch !== undefined ? parsed.needsSearch : false
        const needsContext: boolean = parsed.needsContext !== undefined ? parsed.needsContext : false
        const recommendedModelType: string = parsed.recommendedModelType || 'versatile'
        const recommendedModels: Record<string, string> = parsed.recommendedModels || {}

        // Validate category
        const validCategories = [
          'Science',
          'Tech',
          'Business',
          'Health',
          'Politics/Law',
          'History/Geography',
          'Philosophy/Religion',
          'Arts/Culture',
          'Lifestyle/Self-Improvement',
          'General Knowledge/Other',
        ]

        const matchedCategory = validCategories.find(
          (cat) => category.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(category.toLowerCase())
        )

        if (matchedCategory) {
          return { 
            category: matchedCategory, 
            needsSearch: Boolean(needsSearch),
            needsContext: Boolean(needsContext),
            recommendedModelType: recommendedModelType.toLowerCase() || 'versatile',
            recommendedModels,
            rawResponse, // Include raw response for debugging
            prompt: categoryPrompt,
            tokens // Include tokens from API response
          }
        } else {
          console.warn('[Category Detection] Category not found in valid list:', category)
        }
      } else {
        console.warn('[Category Detection] No JSON object found in response')
      }
    } catch (parseError) {
      console.warn('[Category Detection] Failed to parse JSON, trying fallback:', parseError)
    }

    // Fallback: Try to extract category from text response
    const validCategories = [
      'Science',
      'Tech',
      'Business',
      'Health',
      'Politics/Law',
      'History/Geography',
      'Philosophy/Religion',
      'Arts/Culture',
      'Lifestyle/Self-Improvement',
      'General Knowledge/Other',
    ]

    const lowerResponse = categoryResponse.toLowerCase()
    let matchedCategory: string | null = null

    // Check for category matches
    if (lowerResponse.includes('science')) matchedCategory = 'Science'
    else if (lowerResponse.includes('tech') || lowerResponse.includes('technology')) matchedCategory = 'Tech'
    else if (lowerResponse.includes('business')) matchedCategory = 'Business'
    else if (lowerResponse.includes('health')) matchedCategory = 'Health'
    else if (lowerResponse.includes('politics') || lowerResponse.includes('law')) matchedCategory = 'Politics/Law'
    else if (lowerResponse.includes('history') || lowerResponse.includes('geography')) matchedCategory = 'History/Geography'
    else if (lowerResponse.includes('philosophy') || lowerResponse.includes('religion')) matchedCategory = 'Philosophy/Religion'
    else if (lowerResponse.includes('arts') || lowerResponse.includes('culture')) matchedCategory = 'Arts/Culture'
    else if (lowerResponse.includes('lifestyle') || lowerResponse.includes('self-improvement')) matchedCategory = 'Lifestyle/Self-Improvement'

    // Check if search is needed (look for true/false, yes/no, or keywords)
    const needsSearch = lowerResponse.includes('"needsSearch":true') || 
                       lowerResponse.includes('needsSearch: true') ||
                       lowerResponse.includes('needs search: true') ||
                       lowerResponse.includes('yes') && (lowerResponse.includes('search') || lowerResponse.includes('web') || lowerResponse.includes('internet'))
    const needsContext = lowerResponse.includes('"needsContext":true') || 
                        lowerResponse.includes('needsContext: true')

    return {
      category: matchedCategory || 'General Knowledge/Other',
      needsSearch: Boolean(needsSearch),
      needsContext: Boolean(needsContext),
      recommendedModelType: 'versatile',
      recommendedModels: {},
      rawResponse: categoryResponse || 'No response received',
      prompt: categoryPrompt,
      tokens // Include tokens from API response
    }
  } catch (error: any) {
    console.error('[Category Detection] Error:', error)
    return { 
      category: 'General Knowledge/Other', 
      needsSearch: false,
      needsContext: false,
      recommendedModelType: 'versatile',
      recommendedModels: {},
      rawResponse: `Error: ${error.message}`,
      prompt: categoryPrompt,
      tokens: null
    }
  }
}

// Get background theme based on category
export const getBackgroundTheme = (category: string): BackgroundTheme => {
  const themes: Record<string, BackgroundTheme> = {
    philosophy: {
      type: 'philosophy',
      description: 'Ancient philosophers contemplating',
      colors: ['#1a1a2e', '#16213e', '#0f3460'],
    },
    technology: {
      type: 'tech',
      description: 'Futuristic tech landscape',
      colors: ['#000000', '#1a1a2e', '#16213e'],
    },
    science: {
      type: 'science',
      description: 'Scientific laboratory',
      colors: ['#0a0a0a', '#1a1a2e', '#16213e'],
    },
    business: {
      type: 'business',
      description: 'Modern office space',
      colors: ['#000000', '#1a1a1a', '#2a2a2a'],
    },
    creative: {
      type: 'creative',
      description: 'Artistic studio',
      colors: ['#1a0a2e', '#16213e', '#0f3460'],
    },
    education: {
      type: 'education',
      description: 'Library or classroom',
      colors: ['#0f0f23', '#1a1a2e', '#16213e'],
    },
    health: {
      type: 'health',
      description: 'Wellness center',
      colors: ['#0a1a0a', '#1a2e1a', '#162e16'],
    },
    general: {
      type: 'default',
      description: 'Default space',
      colors: ['#000000', '#0a0a0a', '#1a1a1a'],
    },
  }

  return themes[category] || themes.general
}
