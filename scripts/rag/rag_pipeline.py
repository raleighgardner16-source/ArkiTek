"""
Multi-Stage RAG Pipeline for ArkiTek
Reduces costs and increases accuracy through staged processing
"""

import asyncio
import aiohttp
import os
from typing import List, Dict, Optional
from dataclasses import dataclass
import json


@dataclass
class SearchResult:
    """Structure for search results"""
    title: str
    link: str
    snippet: str


@dataclass
class FactWithCitation:
    """Structure for a fact with its source citation"""
    fact: str
    source_quote: str


@dataclass
class RefinedData:
    """Structure for refined data points"""
    query: str
    data_points: List[str]  # Kept for backward compatibility
    facts_with_citations: List[FactWithCitation]  # New citation-based format
    found: bool
    error: Optional[str] = None
    discard_rate: float = 0.0  # Track discard rate for decision making


@dataclass
class CouncilResponse:
    """Structure for council model responses"""
    model_name: str
    response: str
    error: Optional[str] = None


@dataclass
class JudgeAnalysis:
    """Structure for judge's final analysis"""
    consensus: str
    agreements: List[str]
    disagreements: List[str]
    summary: str


class RAGPipeline:
    """Multi-stage RAG pipeline for LLM processing"""
    
    def __init__(self, serper_api_key: str, openai_api_key: str, xai_api_key: str, google_api_key: Optional[str] = None):
        """
        Initialize the RAG pipeline with API keys
        
        Args:
            serper_api_key: Serper API key for search
            openai_api_key: OpenAI API key for refiner (gpt-5-mini)
            xai_api_key: xAI API key for judge (Grok)
            google_api_key: Google API key for secondary refiner (gemini-3-flash) - optional
        """
        self.serper_api_key = serper_api_key
        self.openai_api_key = openai_api_key
        self.xai_api_key = xai_api_key
        self.google_api_key = google_api_key or os.getenv('GOOGLE_API_KEY')
        self.backend_url = os.getenv('BACKEND_URL', 'http://localhost:3001')
    
    async def search_function(self, query: str, num_results: int = 3) -> List[SearchResult]:
        """
        Stage 1: Search Function
        Use Serper to fetch top search results for a user query
        
        Args:
            query: User's search query
            num_results: Number of results to fetch (default: 3)
            
        Returns:
            List of SearchResult objects
        """
        print(f"[Search] Fetching top {num_results} results for: {query}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://serper.dev/search/search',
                    headers={
                        'X-API-KEY': self.serper_api_key,
                        'Content-Type': 'application/json',
                    },
                    json={
                        'q': query,
                        'num': num_results,
                    }
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        results = []
                        
                        # Extract organic results
                        for item in data.get('organic', [])[:num_results]:
                            results.append(SearchResult(
                                title=item.get('title', ''),
                                link=item.get('link', ''),
                                snippet=item.get('snippet', '')
                            ))
                        
                        print(f"[Search] Found {len(results)} results")
                        return results
                    else:
                        error_text = await response.text()
                        print(f"[Search] Error: {response.status} - {error_text}")
                        return []
        except Exception as e:
            print(f"[Search] Exception: {str(e)}")
            return []
    
    def _format_search_results(self, results: List[SearchResult]) -> str:
        """Format search results as text for the refiner"""
        formatted = ""
        for i, result in enumerate(results, 1):
            formatted += f"{i}. {result.title}\n"
            formatted += f"   URL: {result.link}\n"
            formatted += f"   {result.snippet}\n\n"
        return formatted
    
    def verify_extraction(self, raw_text: str, refined_json: List[Dict]) -> List[FactWithCitation]:
        """
        Verify that source quotes exist in the raw text.
        This is a code-based check (free) that catches hallucinations.
        
        Args:
            raw_text: The original search results text
            refined_json: List of facts with citations from the refiner
            
        Returns:
            List of verified facts with citations
        """
        verified_facts = []
        discarded_count = 0
        
        for item in refined_json:
            fact_text = item.get('fact', '')
            source_quote = item.get('source_quote', '')
            
            # Check if the quote exists in the raw text (case-insensitive for robustness)
            if source_quote and source_quote.lower() in raw_text.lower():
                verified_facts.append(FactWithCitation(
                    fact=fact_text,
                    source_quote=source_quote
                ))
            else:
                # Quote not found - potential hallucination
                discarded_count += 1
                print(f"[Refiner] Hallucination detected! Discarding: {fact_text[:50]}...")
                if source_quote:
                    print(f"[Refiner] Quote not found in source: {source_quote[:100]}...")
        
        discard_rate = discarded_count / len(refined_json) if refined_json else 0
        print(f"[Refiner] Verification: {len(verified_facts)}/{len(refined_json)} facts verified ({discard_rate*100:.1f}% discarded)")
        
        return verified_facts, discard_rate
    
    async def refiner_step(self, query: str, search_results: List[SearchResult], use_secondary: bool = False) -> RefinedData:
        """
        Stage 2: Refiner Step with Citation-Based Extraction
        Uses citation-based extraction to reduce hallucinations without requiring a second model.
        Only uses secondary model (Gemini) if verification fails badly (>40% discarded).
        
        Args:
            query: Original user query
            search_results: List of search results from Stage 1
            use_secondary: Whether to use secondary model (Gemini) instead of primary (GPT-4o-mini)
            
        Returns:
            RefinedData object with extracted data points and citations
        """
        model_name = "gemini-3-flash-preview" if use_secondary else "gpt-5-mini"
        print(f"[Refiner] Extracting factual data points for: {query} (using {model_name})")
        
        if not search_results:
            return RefinedData(
                query=query,
                data_points=[],
                facts_with_citations=[],
                found=False
            )
        
        # Format search results
        formatted_results = self._format_search_results(search_results)
        
        # Citation-based extraction prompt
        refiner_prompt = f"""You are a strict data extraction engine. You are forbidden from using outside knowledge. You are forbidden from paraphrasing if it alters meaning.

Task: Answer the user's question using ONLY the provided search results from the query.

Output Format: You must output a JSON array of facts. For EVERY fact, you must include a "fact" field and a "source_quote" field containing the exact substring from the text that proves the fact.

Constraint: If you cannot find a direct quote to support a claim, do NOT include that fact. If the search results do not contain the answer, output: {{"error": "NOT_FOUND"}}

User Query: {query}

Search Results:
{formatted_results}

Output a JSON array of facts with citations. Example format:
[
  {{"fact": "Factual statement here", "source_quote": "Exact quote from source text"}},
  {{"fact": "Another fact", "source_quote": "Another exact quote"}}
]"""
        
        try:
            if use_secondary:
                # Use Gemini as secondary model
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
                        params={'key': self.google_api_key} if self.google_api_key else {},
                        json={
                            'contents': [{
                                'parts': [{'text': refiner_prompt}]
                            }],
                            'generationConfig': {
                                'temperature': 0.3,
                            }
                        }
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            content = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                        else:
                            error_text = await response.text()
                            print(f"[Refiner] Gemini Error: {response.status} - {error_text}")
                            return RefinedData(
                                query=query,
                                data_points=[],
                                facts_with_citations=[],
                                found=False,
                                error=f"API Error: {response.status}"
                            )
            else:
                # Use GPT-4o-mini as primary model
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        'https://api.openai.com/v1/chat/completions',
                        headers={
                            'Authorization': f'Bearer {self.openai_api_key}',
                            'Content-Type': 'application/json',
                        },
                        json={
                            'model': 'gpt-5-mini',
                            'messages': [
                                {'role': 'system', 'content': 'You are a strict data extraction engine. Output only valid JSON.'},
                                {'role': 'user', 'content': refiner_prompt}
                            ],
                            'temperature': 0.3,
                            # Don't force json_object format - we want an array, not an object
                        }
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            content = data['choices'][0]['message']['content']
                        else:
                            error_text = await response.text()
                            print(f"[Refiner] Error: {response.status} - {error_text}")
                            return RefinedData(
                                query=query,
                                data_points=[],
                                facts_with_citations=[],
                                found=False,
                                error=f"API Error: {response.status}"
                            )
            
            # Parse JSON response
            try:
                # Try to extract JSON from response (handle markdown code blocks)
                json_content = content
                if '```json' in content:
                    json_content = content.split('```json')[1].split('```')[0].strip()
                elif '```' in content:
                    json_content = content.split('```')[1].split('```')[0].strip()
                
                # Try to find JSON array in the content
                start_idx = json_content.find('[')
                end_idx = json_content.rfind(']')
                if start_idx != -1 and end_idx != -1:
                    json_content = json_content[start_idx:end_idx+1]
                
                parsed = json.loads(json_content)
                
                # Handle error response
                if isinstance(parsed, dict) and parsed.get('error') == 'NOT_FOUND':
                    print("[Refiner] No relevant data found")
                    return RefinedData(
                        query=query,
                        data_points=[],
                        facts_with_citations=[],
                        found=False
                    )
                
                # Handle array of facts
                if isinstance(parsed, list):
                    facts_json = parsed
                elif isinstance(parsed, dict) and 'facts' in parsed:
                    facts_json = parsed['facts']
                elif isinstance(parsed, dict) and 'fact' in parsed:
                    # Single fact object
                    facts_json = [parsed]
                else:
                    facts_json = []
                
                # Verify citations exist in source text
                verified_facts, discard_rate = self.verify_extraction(formatted_results, facts_json)
                
                # Convert to data_points format for backward compatibility
                data_points = [f.fact for f in verified_facts]
                
                print(f"[Refiner] Extracted {len(verified_facts)} verified facts (discard rate: {discard_rate*100:.1f}%)")
                return RefinedData(
                    query=query,
                    data_points=data_points,
                    facts_with_citations=verified_facts,
                    found=len(verified_facts) > 0,
                    discard_rate=discard_rate
                )
                
            except json.JSONDecodeError as e:
                print(f"[Refiner] JSON parsing error: {str(e)}")
                print(f"[Refiner] Raw content: {content[:500]}")
                # Fallback: try to extract as bullet points
                if 'NOT FOUND' in content.upper() or 'NOT_FOUND' in content.upper():
                    return RefinedData(
                        query=query,
                        data_points=[],
                        facts_with_citations=[],
                        found=False
                    )
                # If JSON parsing fails and we haven't tried secondary, retry with secondary
                if not use_secondary:
                    print("[Refiner] JSON parse failed, retrying with secondary model")
                    return await self.refiner_step(query, search_results, use_secondary=True)
                return RefinedData(
                    query=query,
                    data_points=[],
                    facts_with_citations=[],
                    found=False,
                    error=f"JSON parsing error: {str(e)}"
                )
                
        except Exception as e:
            print(f"[Refiner] Exception: {str(e)}")
            return RefinedData(
                query=query,
                data_points=[],
                facts_with_citations=[],
                found=False,
                error=str(e)
            )
    
    async def _call_council_model(
        self, 
        session: aiohttp.ClientSession,
        model_id: str,
        refined_data: RefinedData,
        backend_url: str
    ) -> CouncilResponse:
        """
        Helper function to call a single council model
        
        Args:
            session: aiohttp session for async requests
            model_id: Model identifier (format: "provider-model")
            refined_data: Refined data points from Stage 2
            backend_url: Backend API URL
            
        Returns:
            CouncilResponse object
        """
        # Split model_id into provider and model
        parts = model_id.split('-', 1)
        if len(parts) != 2:
            return CouncilResponse(
                model_name=model_id,
                response="",
                error=f"Invalid model ID format: {model_id}"
            )
        
        provider, model = parts
        
        # Format data points
        data_points_text = "\n".join([f"• {point}" for point in refined_data.data_points])
        
        # Create council prompt
        council_prompt = f"""Analyze the following factual data points and provide your interpretation, analysis, and perspective on the user's query.

User Query: {refined_data.query}

Factual Data Points:
{data_points_text}

Provide your comprehensive analysis based on these data points. If the data points indicate "NOT FOUND", explain why this information may not be available and provide your best answer based on your training data."""
        
        try:
            async with session.post(
                f'{backend_url}/api/llm',
                json={
                    'provider': provider,
                    'model': model,
                    'prompt': council_prompt,
                    'userId': None,
                    'isSummary': False
                },
                headers={'Content-Type': 'application/json'}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return CouncilResponse(
                        model_name=model_id,
                        response=data.get('text', ''),
                        error=None
                    )
                else:
                    error_text = await response.text()
                    return CouncilResponse(
                        model_name=model_id,
                        response="",
                        error=f"HTTP {response.status}: {error_text}"
                    )
        except Exception as e:
            return CouncilResponse(
                model_name=model_id,
                response="",
                error=str(e)
            )
    
    async def council_processing(
        self, 
        refined_data: RefinedData, 
        selected_models: List[str]
    ) -> List[CouncilResponse]:
        """
        Stage 3: Council Processing
        Send refined data points to user's selected models in parallel
        
        Args:
            refined_data: Refined data from Stage 2
            selected_models: List of model IDs to query (format: "provider-model")
            
        Returns:
            List of CouncilResponse objects
        """
        print(f"[Council] Processing {len(selected_models)} models in parallel")
        
        async with aiohttp.ClientSession() as session:
            # Create tasks for all models to run in parallel
            tasks = [
                self._call_council_model(session, model_id, refined_data, self.backend_url)
                for model_id in selected_models
            ]
            
            # Execute all tasks concurrently
            responses = await asyncio.gather(*tasks)
            
            print(f"[Council] Received {len(responses)} responses")
            return list(responses)
    
    async def judge_refiner_selection(
        self,
        query: str,
        primary_refined: RefinedData,
        backup_refined: RefinedData
    ) -> RefinedData:
        """
        Judge Model: Select the best refiner summary when backup was triggered
        Compares both refiner summaries and selects the one with more/better citations
        
        Args:
            query: Original user query
            primary_refined: Refined data from GPT-4o-mini
            backup_refined: Refined data from Gemini 1.5 Flash
            
        Returns:
            RefinedData object - the selected best summary
        """
        print(f"[Judge] Comparing two refiner summaries to select the best one")
        
        # Format both summaries for comparison
        primary_summary = "\n".join([f"• {f.fact} [Source: {f.source_quote[:100]}...]" for f in primary_refined.facts_with_citations])
        backup_summary = "\n".join([f"• {f.fact} [Source: {f.source_quote[:100]}...]" for f in backup_refined.facts_with_citations])
        
        primary_citation_count = len(primary_refined.facts_with_citations)
        backup_citation_count = len(backup_refined.facts_with_citations)
        
        judge_prompt = f"""You are an expert judge analyzing two summaries of search results. Your task is to select the BEST summary based on:
1. Number of facts with valid source citations
2. Quality and accuracy of citations
3. Relevance to the user's query

Original User Query: "{query}"

--- Summary 1 (GPT-4o-mini) ---
Facts with citations: {primary_citation_count}
Summary:
{primary_summary}

--- Summary 2 (Gemini 1.5 Flash) ---
Facts with citations: {backup_citation_count}
Summary:
{backup_summary}

Analyze both summaries and determine which one has:
- More facts with valid source citations
- Better quality citations (exact quotes from sources)
- More relevant information for the query

Respond with ONLY a JSON object in this format:
{{
  "selected": "primary" or "backup",
  "reasoning": "Brief explanation of why this summary is better"
}}

If both summaries have similar citation quality, prefer the one with more citations."""
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://api.x.ai/v1/chat/completions',
                    headers={
                        'Authorization': f'Bearer {self.xai_api_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': 'grok-4-1-fast-reasoning',
                        'messages': [
                            {'role': 'user', 'content': judge_prompt}
                        ],
                        'temperature': 0.3,
                    }
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        content = data['choices'][0]['message']['content']
                        
                        # Parse JSON response
                        try:
                            json_content = content
                            if '```json' in content:
                                json_content = content.split('```json')[1].split('```')[0].strip()
                            elif '```' in content:
                                json_content = content.split('```')[1].split('```')[0].strip()
                            
                            parsed = json.loads(json_content)
                            selected = parsed.get('selected', 'primary')
                            reasoning = parsed.get('reasoning', '')
                            
                            print(f"[Judge] Selected: {selected} - {reasoning}")
                            
                            if selected == 'backup':
                                return backup_refined
                            else:
                                return primary_refined
                        except json.JSONDecodeError:
                            # Fallback: select based on citation count
                            print(f"[Judge] JSON parse failed, using citation count as fallback")
                            if backup_citation_count > primary_citation_count:
                                print(f"[Judge] Selected backup (more citations: {backup_citation_count} vs {primary_citation_count})")
                                return backup_refined
                            else:
                                print(f"[Judge] Selected primary (more citations: {primary_citation_count} vs {backup_citation_count})")
                                return primary_refined
                    else:
                        # Fallback: select based on citation count
                        print(f"[Judge] API error, using citation count as fallback")
                        if backup_citation_count > primary_citation_count:
                            return backup_refined
                        else:
                            return primary_refined
        except Exception as e:
            print(f"[Judge] Error in refiner selection: {str(e)}, using citation count as fallback")
            # Fallback: select based on citation count
            if backup_citation_count > primary_citation_count:
                return backup_refined
            else:
                return primary_refined
    
    async def judge_finalization(
        self, 
        query: str,
        council_responses: List[CouncilResponse]
    ) -> JudgeAnalysis:
        """
        Stage 4: Judge Finalization
        Send all council responses to Grok 4-1-fast-reasoning for consensus analysis
        
        Args:
            query: Original user query
            council_responses: List of responses from council models
            
        Returns:
            JudgeAnalysis object with consensus, agreements, and disagreements
        """
        print(f"[Judge] Analyzing {len(council_responses)} council responses")
        
        # Filter out error responses
        valid_responses = [r for r in council_responses if not r.error]
        
        if not valid_responses:
            return JudgeAnalysis(
                consensus="No valid responses from council models.",
                agreements=[],
                disagreements=[],
                summary="All council models encountered errors."
            )
        
        # Format council responses
        responses_text = ""
        for i, response in enumerate(valid_responses, 1):
            responses_text += f"\n--- Response {i} ({response.model_name}) ---\n"
            responses_text += f"{response.response}\n"
        
        # Create judge prompt
        judge_prompt = f"""You are an expert judge analyzing multiple AI model responses. Your task is to:

1. Identify consensus - what do most/all models agree on?
2. Identify agreements - specific points where models agree
3. Identify disagreements/contradictions - where models differ or contradict each other
4. Assess reliability - if information lacks proper source citations, indicate this to the user
5. Provide a comprehensive summary

Original User Query: "{query}"

Council Model Responses:
{responses_text}

Please analyze these responses and provide:
- **Consensus/Summary**: What is the overall consensus or most likely correct answer?
- **Agreements**: List specific points where models agree (bullet points)
- **Disagreements**: List specific points where models disagree or contradict (bullet points)
- **Reliability Assessment**: If the information provided lacks proper source citations or has low citation quality, explicitly indicate to the user that the information may not be very reliable due to lack of sources
- **Final Summary**: A concise synthesis for the user

Format your response clearly with these sections. If sources are missing or unreliable, make this clear to the user."""
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://api.x.ai/v1/chat/completions',
                    headers={
                        'Authorization': f'Bearer {self.xai_api_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': 'grok-4-1-fast-reasoning',
                        'messages': [
                            {'role': 'user', 'content': judge_prompt}
                        ],
                        'temperature': 0.7,
                    }
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        judge_output = data['choices'][0]['message']['content']
                        
                        # Parse judge output (simple parsing - can be enhanced)
                        consensus = ""
                        agreements = []
                        disagreements = []
                        summary = ""
                        
                        # Simple parsing logic (can be enhanced with regex or structured output)
                        lines = judge_output.split('\n')
                        current_section = None
                        
                        import re
                        
                        def is_list_item(text):
                            """Check if a line is a list item (bullet, numbered, or asterisk)"""
                            s = text.strip()
                            if not s:
                                return False
                            # Matches: -, •, *, numbered (1., 2., etc.), or lines starting with content after a bullet
                            return bool(re.match(r'^[-•*]\s', s) or re.match(r'^\d+[\.\)]\s', s))
                        
                        def clean_list_item(text):
                            """Remove bullet/number prefix from a list item"""
                            s = text.strip()
                            # Remove bullet markers: -, •, *
                            s = re.sub(r'^[-•*]\s+', '', s)
                            # Remove numbered markers: 1., 2), etc.
                            s = re.sub(r'^\d+[\.\)]\s+', '', s)
                            # Remove bold markers
                            s = s.replace('**', '')
                            return s.strip()
                        
                        def is_section_header(text):
                            """Check if a line is a section header (starts with ** or # or is all caps)"""
                            s = text.strip()
                            return s.startswith('**') or s.startswith('#') or (s.isupper() and len(s) > 3)
                        
                        for line in lines:
                            line_lower = line.lower().strip()
                            
                            # Detect section headers - order matters! Check specific before generic.
                            # Check 'disagreement' BEFORE 'agreement' since 'agreement' is a substring of 'disagreement'
                            # Check 'final summary' BEFORE 'summary' since 'summary' is a substring of 'final summary'
                            if 'final summary' in line_lower or 'synthesis' in line_lower:
                                current_section = 'summary'
                                continue
                            elif 'reliability' in line_lower and ('assessment' in line_lower or 'note' in line_lower or 'caveat' in line_lower):
                                current_section = 'reliability'
                                continue
                            elif 'disagreement' in line_lower or 'contradict' in line_lower or 'difference' in line_lower or 'diverge' in line_lower or 'conflict' in line_lower:
                                current_section = 'disagreements'
                                continue
                            elif 'agreement' in line_lower or ('points of consensus' in line_lower):
                                current_section = 'agreements'
                                continue
                            elif 'consensus' in line_lower or ('summary' in line_lower and 'final' not in line_lower and current_section is None):
                                current_section = 'consensus'
                                continue
                            
                            stripped = line.strip()
                            if not stripped:
                                continue
                            
                            if current_section == 'consensus' and not is_section_header(stripped):
                                consensus += stripped + " "
                            elif current_section == 'agreements' and (is_list_item(stripped) or (not is_section_header(stripped) and len(stripped) > 10)):
                                item = clean_list_item(stripped) if is_list_item(stripped) else stripped
                                if item:
                                    agreements.append(item)
                            elif current_section == 'disagreements' and (is_list_item(stripped) or (not is_section_header(stripped) and len(stripped) > 10)):
                                item = clean_list_item(stripped) if is_list_item(stripped) else stripped
                                if item:
                                    disagreements.append(item)
                            elif current_section == 'summary' and not is_section_header(stripped):
                                summary += stripped + " "
                            elif current_section == 'reliability' and not is_section_header(stripped):
                                # Skip reliability section content - don't add to other sections
                                pass
                        
                        # If parsing didn't work well, use the full output
                        if not consensus and not summary:
                            summary = judge_output
                            consensus = judge_output[:200] + "..."
                        
                        print(f"[Judge] Analysis complete - Agreements: {len(agreements)}, Disagreements: {len(disagreements)}")
                        if not disagreements:
                            print(f"[Judge] WARNING: No disagreements parsed. Raw output preview:\n{judge_output[:500]}")
                        return JudgeAnalysis(
                            consensus=consensus.strip(),
                            agreements=agreements,
                            disagreements=disagreements,
                            summary=summary.strip() or judge_output
                        )
                    else:
                        error_text = await response.text()
                        print(f"[Judge] Error: {response.status} - {error_text}")
                        return JudgeAnalysis(
                            consensus="Judge analysis failed",
                            agreements=[],
                            disagreements=[],
                            summary=f"Error: {error_text}"
                        )
        except Exception as e:
            print(f"[Judge] Exception: {str(e)}")
            return JudgeAnalysis(
                consensus="Judge analysis failed",
                agreements=[],
                disagreements=[],
                summary=f"Exception: {str(e)}"
            )
    
    async def run_full_pipeline(
        self, 
        query: str, 
        selected_models: List[str]
    ) -> Dict:
        """
        Run the complete RAG pipeline from start to finish
        
        Args:
            query: User's query
            selected_models: List of model IDs to use in council stage
            
        Returns:
            Dictionary with all pipeline results
        """
        print(f"\n{'='*60}")
        print(f"Starting RAG Pipeline for: {query}")
        print(f"{'='*60}\n")
        
        # Stage 1: Search
        search_results = await self.search_function(query, num_results=3)
        
        # Stage 2: Primary Refiner (GPT-4o-mini)
        primary_refined = await self.refiner_step(query, search_results, use_secondary=False)
        
        # Check if backup refiner is needed (>30% discard rate)
        refined_data = primary_refined
        backup_refined = None
        
        if primary_refined.discard_rate > 0.3:
            print(f"[Pipeline] High discard rate ({primary_refined.discard_rate*100:.1f}%), triggering backup refiner")
            
            # Stage 2b: Backup Refiner (Gemini 1.5 Flash) - performs NEW Serper query
            backup_search_results = await self.search_function(query, num_results=3)
            backup_refined = await self.refiner_step(query, backup_search_results, use_secondary=True)
            
            # Stage 2c: Judge selects best refiner summary
            print(f"[Pipeline] Judge comparing refiner summaries...")
            refined_data = await self.judge_refiner_selection(query, primary_refined, backup_refined)
            print(f"[Pipeline] Judge selected best summary ({len(refined_data.facts_with_citations)} facts with citations)")
        else:
            print(f"[Pipeline] Primary refiner passed verification ({primary_refined.discard_rate*100:.1f}% discard rate), proceeding to council")
        
        # Stage 3: Council (parallel processing)
        council_responses = await self.council_processing(refined_data, selected_models)
        
        # Stage 4: Judge (final analysis of council responses)
        judge_analysis = await self.judge_finalization(query, council_responses)
        
        # Compile results
        results = {
            'query': query,
            'search_results': [
                {
                    'title': r.title,
                    'link': r.link,
                    'snippet': r.snippet
                }
                for r in search_results
            ],
            'refined_data': {
                'data_points': refined_data.data_points,
                'facts_with_citations': [
                    {'fact': f.fact, 'source_quote': f.source_quote}
                    for f in refined_data.facts_with_citations
                ],
                'found': refined_data.found,
                'discard_rate': refined_data.discard_rate,
                'backup_used': backup_refined is not None
            },
            'council_responses': [
                {
                    'model_name': r.model_name,
                    'response': r.response,
                    'error': r.error
                }
                for r in council_responses
            ],
            'judge_analysis': {
                'consensus': judge_analysis.consensus,
                'agreements': judge_analysis.agreements,
                'disagreements': judge_analysis.disagreements,
                'summary': judge_analysis.summary
            }
        }
        
        print(f"\n{'='*60}")
        print("Pipeline Complete!")
        print(f"{'='*60}\n")
        
        return results


# Example usage
async def main():
    """Example usage of the RAG pipeline"""
    
    # Load API keys from environment variables
    SERPER_API_KEY = os.getenv('SERPER_API_KEY', '')
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
    XAI_API_KEY = os.getenv('XAI_API_KEY', '')
    
    if not all([SERPER_API_KEY, OPENAI_API_KEY, XAI_API_KEY]):
        print("Error: Missing API keys. Set SERPER_API_KEY, OPENAI_API_KEY, and XAI_API_KEY environment variables.")
        return
    
    # Initialize pipeline
    pipeline = RAGPipeline(
        serper_api_key=SERPER_API_KEY,
        openai_api_key=OPENAI_API_KEY,
        xai_api_key=XAI_API_KEY
    )
    
    # Example query and models
    query = "What happened with Charlie Kirk shooting?"
    selected_models = [
        "openai-gpt-5.2",
        "anthropic-claude-4.6-sonnet",
        "google-gemini-3.1-pro"
    ]
    
    # Run pipeline
    results = await pipeline.run_full_pipeline(query, selected_models)
    
    # Print results
    print("\n" + "="*60)
    print("FINAL RESULTS")
    print("="*60)
    print(f"\nQuery: {results['query']}")
    print(f"\nRefined Data Points: {len(results['refined_data']['data_points'])}")
    for point in results['refined_data']['data_points']:
        print(f"  • {point}")
    
    print(f"\nCouncil Responses: {len(results['council_responses'])}")
    for response in results['council_responses']:
        print(f"\n{response['model_name']}:")
        if response['error']:
            print(f"  Error: {response['error']}")
        else:
            print(f"  {response['response'][:200]}...")
    
    print(f"\nJudge Analysis:")
    print(f"  Consensus: {results['judge_analysis']['consensus'][:200]}...")
    print(f"  Agreements: {len(results['judge_analysis']['agreements'])}")
    print(f"  Disagreements: {len(results['judge_analysis']['disagreements'])}")
    print(f"  Summary: {results['judge_analysis']['summary'][:200]}...")


if __name__ == "__main__":
    asyncio.run(main())

