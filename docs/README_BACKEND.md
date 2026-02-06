# Backend Server Setup

The backend server proxies all LLM API calls to avoid CORS issues and keep API keys secure.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Backend Server
```bash
npm run dev:server
```

The backend will run on `http://localhost:3001`

### 3. Start the Frontend (in a new terminal)
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

### 4. Or Run Both Together
```bash
npm run dev:all
```

This will start both the backend and frontend servers simultaneously.

## How It Works

- **Frontend** (port 3000): Your React app
- **Backend** (port 3001): Express server that proxies API calls to LLM providers

The frontend sends requests to `/api/llm` on the backend, which then makes the actual API calls to:
- OpenAI
- Anthropic (Claude)
- Google (Gemini)
- Groq
- xAI (Grok)

## Environment Variables

Create a `.env` file in the root directory with your API keys:

```
PORT=3001
VITE_BACKEND_URL=http://localhost:3001

# LLM Provider API Keys
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here
XAI_API_KEY=your_xai_key_here
META_API_KEY=your_meta_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
MISTRAL_API_KEY=your_mistral_key_here

# Serper API Key (for search queries)
SERPER_API_KEY=your_serper_key_here
```

**Note**: Get your Serper API key from [serper.dev](https://serper.dev)

## Troubleshooting

If you get "Network Error: Cannot connect to backend server":
1. Make sure the backend server is running (`npm run dev:server`)
2. Check that port 3001 is not in use
3. Verify the backend URL in your `.env` file matches the actual backend port

