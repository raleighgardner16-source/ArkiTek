import { describe, it, expect } from 'vitest'
import { parseCouncilSummary, parseDebateSummary, parseSummaryResponse } from '../src/utils/summaryParser.js'

describe('parseCouncilSummary', () => {
  it('parses a full council summary with all sections', () => {
    const raw = `**CONSENSUS**: 85%

**SUMMARY**: All models agree on the core principles.

**AGREEMENTS**:
- Point one
- Point two

**CONTRADICTIONS**:
- Conflict one

**DIFFERENCES**:
- Nuance one`
    const result = parseCouncilSummary(raw)
    expect(result.consensus).toBe(85)
    expect(result.summary).toBeTruthy()
    expect(result.agreements).toHaveLength(2)
    expect(result.contradictions).toHaveLength(1)
    expect(result.differences).toHaveLength(1)
  })

  it('clamps consensus to 0-100 range', () => {
    const raw = `Consensus: 150%\nSummary: Test`
    const result = parseCouncilSummary(raw)
    expect(result.consensus).toBe(100)
  })

  it('returns null consensus when not present', () => {
    const raw = `Summary: No consensus here.\nAgreements:\n- One`
    const result = parseCouncilSummary(raw)
    expect(result.consensus).toBeNull()
  })

  it('returns raw text as summary when no summary section found', () => {
    const raw = 'Just some plain text without sections'
    const result = parseCouncilSummary(raw)
    expect(result.summary).toContain('Just some plain text')
  })

  it('handles empty agreements/contradictions/differences', () => {
    const raw = `Consensus: 50%\nSummary: Test summary`
    const result = parseCouncilSummary(raw)
    expect(result.agreements).toEqual([])
    expect(result.contradictions).toEqual([])
    expect(result.differences).toEqual([])
  })

  it('strips bullet markers from list items', () => {
    const raw = `Agreements:\n- First point\n• Second point\n* Third point`
    const result = parseCouncilSummary(raw)
    expect(result.agreements[0]).toBe('First point')
    expect(result.agreements[1]).toBe('Second point')
    expect(result.agreements[2]).toBe('Third point')
  })

  it('formats output with markdown headers', () => {
    const raw = `Consensus: 90%\nSummary: Good summary\nAgreements:\n- One`
    const result = parseCouncilSummary(raw)
    expect(result.formattedText).toContain('## CONSENSUS: 90%')
    expect(result.formattedText).toContain('## SUMMARY')
    expect(result.formattedText).toContain('## AGREEMENTS')
    expect(result.formattedText).toContain('## CONTRADICTIONS')
    expect(result.formattedText).toContain('## DIFFERENCES')
  })

  it('shows "None identified" for empty sections', () => {
    const raw = `Summary: Test`
    const result = parseCouncilSummary(raw)
    expect(result.formattedText).toContain('None identified.')
  })

  it('handles DISAGREEMENTS as alias for CONTRADICTIONS', () => {
    const raw = `Summary: Test\nDisagreements:\n- They disagree on X`
    const result = parseCouncilSummary(raw)
    expect(result.contradictions).toHaveLength(1)
    expect(result.contradictions[0]).toContain('They disagree on X')
  })
})

describe('parseDebateSummary', () => {
  it('parses a full debate summary', () => {
    const raw = `**BALANCE**: 65%

**DEBATE OVERVIEW**: The debate centered on economic policy.

**STRONGEST ARGUMENTS**:
- Argument A
- Argument B

**KEY TENSIONS**:
- Tension one`
    const result = parseDebateSummary(raw)
    expect(result.consensus).toBeNull()
    expect(result.summary).toContain('economic policy')
    expect(result.agreements).toHaveLength(2)
    expect(result.contradictions).toHaveLength(1)
    expect(result.differences).toEqual([])
  })

  it('formats with debate-specific headers', () => {
    const raw = `Balance: 70%\nDebate Overview: Overview text\nStrongest Arguments:\n- One\nKey Tensions:\n- Two`
    const result = parseDebateSummary(raw)
    expect(result.formattedText).toContain('## DEBATE OVERVIEW')
    expect(result.formattedText).toContain('## STRONGEST ARGUMENTS')
    expect(result.formattedText).toContain('## KEY TENSIONS')
    expect(result.formattedText).not.toContain('BALANCE')
  })

  it('always returns empty differences array', () => {
    const raw = `Balance: 50%\nDebate Overview: Test`
    const result = parseDebateSummary(raw)
    expect(result.differences).toEqual([])
  })
})

describe('parseSummaryResponse', () => {
  it('delegates to parseDebateSummary when isDebateMode is true', () => {
    const raw = `Balance: 80%\nDebate Overview: Debate text`
    const result = parseSummaryResponse(raw, true)
    expect(result.formattedText).toContain('DEBATE OVERVIEW')
  })

  it('delegates to parseCouncilSummary when isDebateMode is false', () => {
    const raw = `Consensus: 80%\nSummary: Council text`
    const result = parseSummaryResponse(raw, false)
    expect(result.formattedText).toContain('CONSENSUS')
  })
})
