# Multi-Stage RAG Pipeline

This RAG (Retrieval-Augmented Generation) pipeline reduces costs and increases accuracy through staged processing.

## Architecture

The pipeline consists of 4 stages:

1. **Search Function**: Uses Serper API to fetch top 3 search results
2. **Refiner Step**: Uses GPT-4o-mini to extract only factual data points (cost-effective)
3. **Council Processing**: Sends refined data to user-selected models in parallel (asyncio)
4. **Judge Finalization**: Uses Grok 4-1-fast-reasoning to identify consensus, agreements, and disagreements

## Installation

```bash
pip install -r requirements_rag.txt
```

## Environment Variables

Set these environment variables:

```bash
export SERPER_API_KEY="your_serper_key"
export OPENAI_API_KEY="your_openai_key"
export XAI_API_KEY="your_xai_key"
export BACKEND_URL="http://localhost:3001"  # Optional, defaults to localhost
```

Or create a `.env` file:

```
SERPER_API_KEY=your_serper_key
OPENAI_API_KEY=your_openai_key
XAI_API_KEY=your_xai_key
BACKEND_URL=http://localhost:3001
```

## Usage

### Basic Usage

```python
from rag_pipeline import RAGPipeline
import asyncio

# Initialize pipeline
pipeline = RAGPipeline(
    serper_api_key="your_serper_key",
    openai_api_key="your_openai_key",
    xai_api_key="your_xai_key"
)

# Run pipeline
async def run():
    results = await pipeline.run_full_pipeline(
        query="What happened with Charlie Kirk shooting?",
        selected_models=[
            "openai-gpt-4o",
            "anthropic-claude-4.5-sonnet",
            "google-gemini-2.5-pro"
        ]
    )
    
    print(results['judge_analysis']['summary'])

asyncio.run(run())
```

### Stage-by-Stage Usage

You can also run stages individually:

```python
# Stage 1: Search
search_results = await pipeline.search_function("your query", num_results=3)

# Stage 2: Refiner
refined_data = await pipeline.refiner_step("your query", search_results)

# Stage 3: Council (parallel)
council_responses = await pipeline.council_processing(
    refined_data, 
    ["openai-gpt-4o", "anthropic-claude-4.5-sonnet"]
)

# Stage 4: Judge
judge_analysis = await pipeline.judge_finalization("your query", council_responses)
```

## Cost Optimization

- **Refiner uses GPT-4o-mini**: Cheaper than using full models for extraction
- **Parallel Council Processing**: All models process simultaneously, reducing total latency
- **Single Search**: One Serper call instead of multiple
- **Focused Data**: Only relevant facts are sent to expensive models

## Model ID Format

Models should be specified in the format: `provider-modelname`

Examples:
- `openai-gpt-4o`
- `anthropic-claude-4.5-sonnet`
- `google-gemini-2.5-pro`
- `xai-grok-4-1-fast-reasoning`

## Output Structure

The pipeline returns a dictionary with:

```python
{
    'query': str,
    'search_results': [
        {
            'title': str,
            'link': str,
            'snippet': str
        }
    ],
    'refined_data': {
        'data_points': List[str],
        'found': bool
    },
    'council_responses': [
        {
            'model_name': str,
            'response': str,
            'error': Optional[str]
        }
    ],
    'judge_analysis': {
        'consensus': str,
        'agreements': List[str],
        'disagreements': List[str],
        'summary': str
    }
}
```

## Integration with Existing Backend

The pipeline uses your existing backend API (`/api/llm`) for council processing, so it integrates seamlessly with your current infrastructure and API key management.

