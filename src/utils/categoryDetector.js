// Detect category, determine if web search is needed, and recommend model types using Gemini 2.5 Flash Lite
// selectedProviders: Array of { providerKey, providerName, models: [{ id, model, type, label }] }
export const detectCategory = async (prompt, selectedProviders = []) => {
  if (!prompt || !prompt.trim()) {
    return { 
      category: 'General Knowledge/Other', 
      needsSearch: false,
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

  // Build the JSON structure string
  let jsonStructure = `{
  "category": "CategoryName",
  "needsSearch": true,
  "recommendedModelType": "reasoning"`
  
  if (selectedProviders.length > 0) {
    jsonStructure += `,
  "recommendedModels": { "providerKey": "modelId" }`
  }
  
  jsonStructure += `
}`

  const categoryPrompt = `Classify the user prompt into EXACTLY ONE category from the list below.
Also decide if a web search is needed (ONLY if information after 2023 is required). 
Recommend a model type: reasoning, versatile, or fast.

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

Model types:
reasoning = complex logic, math, or coding
versatile = general or multi-purpose tasks
fast = simple, low-latency tasks

User prompt:
"${prompt}"${modelsList}

${selectedProviders.length > 0 ? 'Select ONE model per provider. Prefer same model type across providers. Return the model IDs (e.g., "openai-gpt-5.2", "google-gemini-3-pro") in recommendedModels.' : ''}`

  try {
    const response = await fetch('http://localhost:3001/api/llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'google',
        model: 'gemini-2.5-flash-lite',
        prompt: categoryPrompt,
        userId: null, // Category detection doesn't need user tracking
        isSummary: false,
      }),
    })

    if (!response.ok) {
      console.error('[Category Detection] Error from API:', response.statusText)
      return { 
        category: 'General Knowledge/Other', 
        needsSearch: false,
        recommendedModelType: 'versatile',
        recommendedModels: {},
        rawResponse: `API Error: ${response.statusText}`,
        prompt: categoryPrompt,
        tokens: null // No tokens on API error
      }
    }

    const data = await response.json()
    const categoryResponse = data.text?.trim() || ''
    const rawResponse = categoryResponse // Store raw response for display
    const tokens = data.tokens || null // Extract tokens from API response
    
    console.log('[Category Detection] Raw response from Gemini 2.5 Flash Lite:', categoryResponse)
    console.log('[Category Detection] Tokens from API:', tokens)

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
        const category = parsed.category || parsed.Category || ''
        const needsSearch = parsed.needsSearch !== undefined ? parsed.needsSearch : false
        const recommendedModelType = parsed.recommendedModelType || 'versatile'
        const recommendedModels = parsed.recommendedModels || {}

        console.log('[Category Detection] Parsed JSON:', { category, needsSearch, recommendedModelType, recommendedModels })

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
          console.log('[Category Detection] Successfully parsed:', { 
            category: matchedCategory, 
            needsSearch: Boolean(needsSearch),
            recommendedModelType,
            recommendedModels
          })
          return { 
            category: matchedCategory, 
            needsSearch: Boolean(needsSearch),
            recommendedModelType: recommendedModelType.toLowerCase() || 'versatile',
            recommendedModels,
            rawResponse: rawResponse, // Include raw response for debugging
            prompt: categoryPrompt,
            tokens: tokens // Include tokens from API response
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
    let matchedCategory = null

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

    return {
      category: matchedCategory || 'General Knowledge/Other',
      needsSearch: Boolean(needsSearch),
      recommendedModelType: 'versatile',
      recommendedModels: {},
      rawResponse: categoryResponse || 'No response received',
      prompt: categoryPrompt,
      tokens: tokens // Include tokens from API response
    }
  } catch (error) {
    console.error('[Category Detection] Error:', error)
    return { 
      category: 'General Knowledge/Other', 
      needsSearch: false,
      recommendedModelType: 'versatile',
      recommendedModels: {},
      rawResponse: `Error: ${error.message}`,
      prompt: categoryPrompt,
      tokens: null // No tokens on error
    }
  }
}

// Get background theme based on category
export const getBackgroundTheme = (category) => {
  const themes = {
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

