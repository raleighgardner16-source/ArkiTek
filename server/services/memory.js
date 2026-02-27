import axios from 'axios'
import { API_KEYS } from '../config/index.js'
import { trackUsage } from './usage.js'
import db from '../../database/db.js'

async function generateEmbedding(text, userId = null) {
  const apiKey = API_KEYS.openai
  if (!apiKey) {
    console.warn('[Embedding] OpenAI API key not configured, skipping embedding')
    return null
  }

  try {
    const truncated = text.length > 32000 ? text.substring(0, 32000) : text

    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        model: 'text-embedding-3-small',
        input: truncated,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const embedding = response.data?.data?.[0]?.embedding
    if (!embedding || !Array.isArray(embedding)) {
      console.error('[Embedding] Unexpected response shape')
      return null
    }

    const tokensUsed = response.data?.usage?.total_tokens || 0
    console.log(`[Embedding] Generated ${embedding.length}-dim vector (${tokensUsed} tokens)`)

    if (userId && tokensUsed > 0) {
      trackUsage(userId, 'openai', 'text-embedding-3-small', tokensUsed, 0, true)
    }

    return embedding
  } catch (error) {
    console.error('[Embedding] Error generating embedding:', error.message)
    return null
  }
}

function buildEmbeddingText(originalPrompt, responses, summary, conversationTurns) {
  let text = `User prompt: ${originalPrompt}`

  if (summary && summary.text) {
    text += `\nSummary: ${summary.text.substring(0, 500)}`
  } else if (responses && responses.length > 0) {
    const firstResponse = responses[0]?.text || responses[0]?.modelResponse || ''
    if (firstResponse) {
      text += `\nResponse: ${firstResponse.substring(0, 500)}`
    }
  }

  if (conversationTurns && conversationTurns.length > 0) {
    text += '\nFollow-up conversation:'
    for (const turn of conversationTurns) {
      text += `\nUser: ${(turn.user || '').substring(0, 200)}`
      text += `\n${turn.modelName || 'Assistant'}: ${(turn.assistant || '').substring(0, 300)}`
    }
    if (text.length > 4000) {
      text = text.substring(0, 4000)
    }
  }

  return text
}

async function findRelevantContext(userId, currentPrompt, limit = 3, scoreThreshold = 0.75, targetModel = null) {
  if (!userId || !currentPrompt) return []

  try {
    const queryEmbedding = await generateEmbedding(`User prompt: ${currentPrompt}`, userId)
    if (!queryEmbedding) {
      console.log('[Memory] Could not generate query embedding, skipping context retrieval')
      return []
    }

    const dbInstance = await db.getDb()
    const results = await dbInstance.collection('conversation_history').aggregate([
      {
        $vectorSearch: {
          index: 'conversation_embedding_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 50,
          limit: limit + 5,
          filter: { userId: userId }
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          originalPrompt: 1,
          'summary.text': 1,
          'summary.consensus': 1,
          'responses.modelName': 1,
          'responses.actualModelName': 1,
          'responses.text': 1,
          savedAt: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]).toArray()

    if (!results || results.length === 0) {
      console.log(`[Memory] No relevant past conversations found for user ${userId}`)
      return []
    }

    const contexts = results
      .filter(r => r.score >= scoreThreshold)
      .slice(0, limit)
      .map(r => {
        let snippet = ''

        if (targetModel && r.responses && r.responses.length > 0) {
          const modelResponse = r.responses.find(resp => 
            resp.modelName === targetModel || resp.actualModelName === targetModel
          )
          if (modelResponse && modelResponse.text) {
            snippet = modelResponse.text.substring(0, 800)
            console.log(`[Memory] Using ${targetModel}'s specific response for context (${snippet.length} chars)`)
          }
        }

        if (!snippet && r.summary?.text) {
          const summaryText = r.summary.text

          const summaryStart = summaryText.indexOf('## SUMMARY')
          const agreementsStart = summaryText.indexOf('## AGREEMENTS')
          const contradictionsStart = summaryText.indexOf('## CONTRADICTIONS')
          const disagreementsStart = contradictionsStart !== -1 ? contradictionsStart : summaryText.indexOf('## DISAGREEMENTS')
          let summarySection = ''
          if (summaryStart !== -1) {
            const summaryEnd = agreementsStart !== -1 ? agreementsStart : summaryText.length
            summarySection = summaryText.substring(summaryStart + 10, summaryEnd).trim()
          } else {
            const lines = summaryText.split('\n').filter(l => l.trim() && !l.startsWith('**CONSENSUS'))
            summarySection = lines.join(' ').trim()
          }

          const boilerplatePatterns = [
            /^all\s+(?:four\s+|three\s+|two\s+)?(?:council\s+)?models?\s+(?:unanimously\s+)?(?:state|agree|clarify|acknowledge|note|confirm|indicate|explain|emphasize)\s+(?:that\s+)?they\s+(?:do\s+not|don't|cannot|can\s*not|lack|have\s+no)\s+[^.]*(?:memory|recall|access|history|past\s+(?:conversations?|interactions?))[^.]*\.\s*/i,
            /^the\s+(?:council\s+)?models?\s+(?:unanimously\s+)?(?:state|agree|clarify|confirm|note)\s+(?:that\s+)?they\s+(?:do\s+not|don't|cannot|have\s+no|lack)[^.]*\.\s*/i,
            /^each\s+(?:model|session)\s+(?:is\s+)?(?:treated|started|considered)\s+as\s+[^.]*\.\s*/i,
            /^they\s+(?:all\s+)?(?:collectively\s+)?(?:invite|request|encourage|ask)\s+the\s+user\s+to\s+(?:provide|share|give)[^.]*\.\s*/i,
            /^every\s+model\s+(?:requests?|asks?)\s+(?:that\s+)?the\s+user\s+provide[^.]*\.\s*/i,
            /^despite\s+this\s+(?:limitation|constraint)[^.]*\.\s*/i,
            /^however,?\s+(?:all\s+)?(?:every\s+)?(?:each\s+)?(?:the\s+)?models?\s+(?:express|show|demonstrate)[^.]*willingness[^.]*\.\s*/i,
            /^-\s*all\s+models?\s+(?:lack|confirm|state|agree|note)\s+(?:they\s+)?(?:have\s+no|lack|cannot|do\s+not\s+have)\s+[^.\n]*(?:memory|access|history|recall|past\s+(?:conversations?|interactions?))[^.\n]*\.?\s*/im,
            /^-\s*each\s+(?:session|model)\s+is\s+(?:treated|started)\s+as\s+[^.\n]*\.?\s*/im,
            /^-\s*(?:all|every)\s+models?\s+(?:express|request|invite|ask)[^.\n]*(?:provide|context|summary|details)[^.\n]*\.?\s*/im,
          ]
          for (let pass = 0; pass < 3; pass++) {
            const before = summarySection
            for (const pattern of boilerplatePatterns) {
              summarySection = summarySection.replace(pattern, '').trim()
            }
            if (summarySection === before) break
          }

          let agreementsSection = ''
          if (agreementsStart !== -1) {
            const agreementsEnd = disagreementsStart !== -1 ? disagreementsStart : summaryText.length
            agreementsSection = summaryText.substring(agreementsStart + 14, agreementsEnd).trim()
            for (let pass = 0; pass < 3; pass++) {
              const before = agreementsSection
              for (const pattern of boilerplatePatterns) {
                agreementsSection = agreementsSection.replace(pattern, '').trim()
              }
              if (agreementsSection === before) break
            }
          }

          if (summarySection && agreementsSection) {
            snippet = `${summarySection.substring(0, 400)}\nKey points: ${agreementsSection.substring(0, 400)}`
          } else if (summarySection) {
            snippet = summarySection
          } else if (agreementsSection) {
            snippet = agreementsSection
          }
          snippet = snippet.substring(0, 800)
        }

        if (!snippet && r.responses?.[0]?.text) {
          snippet = r.responses[0].text.substring(0, 800)
        }

        return {
          title: r.title || r.originalPrompt?.substring(0, 80),
          originalPrompt: r.originalPrompt,
          summarySnippet: snippet,
          score: r.score,
          savedAt: r.savedAt,
        }
      })

    if (contexts.length === 0) {
      console.log(`[Memory] All ${results.length} results below score threshold (${scoreThreshold}) for user ${userId} (best score: ${results[0]?.score?.toFixed(3)})`)
      return []
    }

    console.log(`[Memory] Found ${contexts.length} relevant past conversations for user ${userId} (scores: ${contexts.map(c => c.score?.toFixed(3)).join(', ')}, threshold: ${scoreThreshold}${targetModel ? `, targetModel: ${targetModel}` : ''})`)
    return contexts
  } catch (error) {
    if (error.codeName === 'InvalidPipelineOperator' || error.message?.includes('vectorSearch') || error.code === 40324) {
      console.warn('[Memory] Vector Search index not found — skipping context retrieval. Create the index in Atlas to enable memory.')
    } else {
      console.error('[Memory] Error finding relevant context:', error.message)
    }
    return []
  }
}

function formatMemoryContext(contexts) {
  if (!contexts || contexts.length === 0) return ''

  const formatted = contexts.map((ctx, i) => {
    const date = ctx.savedAt ? new Date(ctx.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'
    const ellipsis = ctx.summarySnippet.length >= 795 ? '...' : ''
    return `${i + 1}. [${date}] User asked: "${ctx.originalPrompt}"\n   Context: ${ctx.summarySnippet}${ellipsis}`
  }).join('\n\n')

  return `Relevant context from this user's previous conversations (use as background knowledge if helpful):\n\n${formatted}\n\n`
}

export {
  generateEmbedding,
  buildEmbeddingText,
  findRelevantContext,
  formatMemoryContext,
}
