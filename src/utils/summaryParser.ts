export interface ParsedSummary {
  formattedText: string
  consensus: number | null
  summary: string
  agreements: string[]
  contradictions: string[]
  differences: string[]
}

const toBulletArray = (text: string | null | undefined): string[] => {
  if (!text) return []
  return text
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
}

export function parseDebateSummary(rawText: string): ParsedSummary {
  const normalizedText = rawText
    .replace(/\*\*(BALANCE|Balance|DEBATE OVERVIEW|Debate Overview|STRONGEST ARGUMENTS?|Strongest Arguments?|KEY TENSIONS|Key Tensions)\*\*[:\-]?/gi, '\n$1:')
    .replace(/\*(BALANCE|Balance|DEBATE OVERVIEW|Debate Overview|STRONGEST ARGUMENTS?|Strongest Arguments?|KEY TENSIONS|Key Tensions)\*[:\-]?/gi, '\n$1:')

  const balanceMatch = normalizedText.match(/(?:Balance|BALANCE)[:\-]?\s*(?:\[|\*\*)?\s*(\d+)\s*(?:%|]|\*\*)?/i)
  const overviewMatch = normalizedText.match(/(?:Debate Overview|DEBATE OVERVIEW)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:STRONGEST ARGUMENTS?|Strongest Arguments?)[:\-]|\n\s*(?:KEY TENSIONS|Key Tensions)[:\-]|$)/i)
  const strongestMatch = normalizedText.match(/(?:Strongest Arguments?|STRONGEST ARGUMENTS?)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:KEY TENSIONS|Key Tensions)[:\-]|$)/i)
  const tensionsMatch = normalizedText.match(/(?:Key Tensions|KEY TENSIONS)[:\-]?\s*([\s\S]+)$/i)

  let consensus: number | null = null
  if (balanceMatch) {
    const score = parseInt(balanceMatch[1], 10)
    if (!Number.isNaN(score)) consensus = Math.max(0, Math.min(100, score))
  }

  const summary = (overviewMatch ? overviewMatch[1] : rawText)
    .replace(/^(?:\*\*)?(?:Debate Overview|DEBATE OVERVIEW)[:\-]?\s*\*?\*?\s*/i, '')
    .replace(/^:\s*/, '')
    .trim()

  const agreements = toBulletArray((strongestMatch?.[1] || '').trim())
  const contradictions = toBulletArray((tensionsMatch?.[1] || '').trim())

  let formattedText = ''
  if (consensus !== null) formattedText += `## BALANCE: ${consensus}%\n\n`
  if (summary) formattedText += `## DEBATE OVERVIEW\n${summary}\n\n`
  formattedText += `## STRONGEST ARGUMENTS\n${agreements.length ? agreements.map(a => `- ${a}`).join('\n') : 'None identified.'}\n\n`
  formattedText += `## KEY TENSIONS\n${contradictions.length ? contradictions.map(c => `- ${c}`).join('\n') : 'None identified.'}`

  return { formattedText, consensus, summary, agreements, contradictions, differences: [] }
}

export function parseCouncilSummary(rawText: string): ParsedSummary {
  const normalizedText = rawText
    .replace(/\*\*(SUMMARY|Summary|AGREEMENTS|Agreements|CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements|DIFFERENCES|Differences|CONSENSUS|Consensus)\*\*[:\-]?/gi, '\n$1:')
    .replace(/\*(SUMMARY|Summary|AGREEMENTS|Agreements|CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements|DIFFERENCES|Differences|CONSENSUS|Consensus)\*[:\-]?/gi, '\n$1:')

  const consensusMatch = normalizedText.match(/(?:Consensus|consensus)[:\-]?\s*(?:\[|\*\*)?\s*(\d+)\s*(?:%|]|\*\*)?/i)
  const summaryMatch = normalizedText.match(/(?:Summary|SUMMARY)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:AGREEMENTS|Agreements)[:\-]|\n\s*(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]|\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
  const agreementsMatch = normalizedText.match(/(?:AGREEMENTS|Agreements)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]|\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
  const contradictionsMatch = normalizedText.match(/(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
  const differencesMatch = normalizedText.match(/(?:DIFFERENCES|Differences)[:\-]?\s*([\s\S]+)$/i)

  let consensus: number | null = null
  if (consensusMatch) {
    const score = parseInt(consensusMatch[1], 10)
    if (!Number.isNaN(score)) consensus = Math.max(0, Math.min(100, score))
  }

  const summary = (summaryMatch ? summaryMatch[1] : rawText)
    .replace(/^(?:\*\*)?(?:Summary|SUMMARY)[:\-]?\s*\*?\*?\s*/i, '')
    .replace(/^:\s*/, '')
    .trim()

  const agreements = toBulletArray((agreementsMatch?.[1] || '').trim())
  const contradictions = toBulletArray((contradictionsMatch?.[1] || '').trim())
  const differences = toBulletArray((differencesMatch?.[1] || '').trim())

  let formattedText = ''
  if (consensus !== null) formattedText += `## CONSENSUS: ${consensus}%\n\n`
  if (summary) formattedText += `## SUMMARY\n${summary}\n\n`
  formattedText += `## AGREEMENTS\n${agreements.length ? agreements.map(a => `- ${a}`).join('\n') : 'None identified.'}\n\n`
  formattedText += `## CONTRADICTIONS\n${contradictions.length ? contradictions.map(c => `- ${c}`).join('\n') : 'None identified — all models are in factual agreement.'}\n\n`
  formattedText += `## DIFFERENCES\n${differences.length ? differences.map(d => `- ${d}`).join('\n') : 'None identified.'}`

  return { formattedText, consensus, summary, agreements, contradictions, differences }
}

export function parseSummaryResponse(rawText: string, isDebateMode: boolean): ParsedSummary {
  return isDebateMode ? parseDebateSummary(rawText) : parseCouncilSummary(rawText)
}
