# Token Counting Implementation Guide

## Problem Statement

You need to track input and output tokens per user for accurate billing, but providers don't always report token counts per user. Each provider and model counts tokens differently.

## Solution Implemented

We've implemented a **three-tier token counting system** that follows industry best practices:

### 1. **Priority 1: Extract from API Response** (Most Accurate)
   - Many providers include token counts in their API responses
   - We extract these when available (most accurate)
   - Supports OpenAI-compatible, Anthropic, and Google formats

### 2. **Priority 2: Provider-Specific Tokenizers** (Accurate)
   - **OpenAI**: Uses `tiktoken` library (model-specific encoding)
   - **Anthropic**: Uses improved estimation (Claude tokenization ~3.5 chars/token)
   - **Google**: Uses improved estimation (Gemini ~2.5 chars/token)
   - **Mistral**: Uses improved estimation (SentencePiece ~2.5 chars/token)
   - **xAI**: Uses improved estimation (BPE-based ~3 chars/token)

### 3. **Priority 3: Fallback Estimation** (Last Resort)
   - Only used if tokenizers fail
   - Basic 4 characters per token estimation

## Files Created/Modified

### New File: `server/helpers/tokenCounters.ts`
- Contains all token counting logic
- Provider-specific token counting functions
- API response token extraction
- Fallback mechanisms

### Modified: `server.js`
- Replaced `estimateTokens()` with proper token counting
- Updated all API endpoints to use new system:
  - `/api/llm` (main LLM endpoint)
  - Anthropic endpoint
  - Google endpoint
  - xAI fallback models
  - RAG pipeline council calls

### Modified: `package.json`
- Added `tiktoken` dependency for OpenAI token counting

## How It Works

### Token Counting Flow

```
1. API Call Made
   ↓
2. Check API Response for Token Counts
   ├─ Yes → Use API response tokens (most accurate)
   └─ No → Count tokens ourselves
       ├─ Use provider-specific tokenizer
       │   ├─ OpenAI: tiktoken
       │   ├─ Anthropic: Improved estimation
       │   ├─ Google: Improved estimation
       │   └─ Others: Improved estimation
       └─ Fallback: Basic estimation
   ↓
3. Track Usage (inputTokens, outputTokens)
   ↓
4. Calculate Costs
   ↓
5. Store in usage.json
```

## Current Implementation Status

✅ **Completed:**
- Token counting utility created
- API response token extraction
- Provider-specific tokenizers (OpenAI with tiktoken)
- Improved estimations for other providers
- All API endpoints updated
- Fallback mechanisms in place

⚠️ **Note on Accuracy:**
- **OpenAI models**: Highly accurate (using tiktoken)
- **Other providers**: Improved estimations (better than 4-char fallback, but not perfect)
- **Best practice**: Reconcile monthly totals against provider invoices

## Usage Example

```javascript
// In your API endpoint:
const responseTokens = extractTokensFromResponse(response.data, provider)
let inputTokens = 0
let outputTokens = 0

if (responseTokens) {
  // Use API response (most accurate)
  inputTokens = responseTokens.inputTokens || 0
  outputTokens = responseTokens.outputTokens || 0
} else {
  // Count ourselves
  inputTokens = await countTokens(prompt, provider, model)
  outputTokens = await countTokens(responseText, provider, model)
}

trackUsage(userId, provider, model, inputTokens, outputTokens)
```

## Recommendations for Future Improvements

1. **Install Anthropic SDK** (if available):
   ```bash
   npm install @anthropic-ai/sdk
   ```
   Then use their token counting utilities

2. **Add Google Gemini SDK**:
   ```bash
   npm install @google/generative-ai
   ```
   Use their token counting methods

3. **Monthly Reconciliation**:
   - Compare your totals against provider invoices
   - Adjust for any discrepancies
   - Add padding (3-8%) for xAI if needed

4. **Add Safety Controls**:
   - Per-user token caps
   - Per-minute token limits
   - Daily usage quotas
   - Hard stops if exceeded

## Testing

After installation, test with:
1. Make API calls to different providers
2. Check console logs for token counting messages
3. Verify token counts in usage.json
4. Compare against provider dashboards (when available)

## Key Insight

**You are building a billing system, not just calling APIs.**

This implementation:
- ✅ Tracks tokens per user (not per API key)
- ✅ Uses accurate tokenizers when available
- ✅ Falls back gracefully when tokenizers aren't available
- ✅ Extracts token counts from API responses when provided
- ✅ Maintains consistency for billing accuracy

