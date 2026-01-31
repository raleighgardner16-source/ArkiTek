# ArkTek - Multi-LLM Comparison Platform

A professional, immersive platform for comparing responses from multiple Large Language Models (LLMs) side-by-side. Experience VR-like navigation, customizable backgrounds, and intelligent UI adaptation based on your queries.

## Features

### 🚀 Core Functionality
- **Multi-LLM Support**: Compare responses from 5-6 major LLM providers simultaneously
- **Model Selection**: Choose any combination of available models via dropdown menu
- **Response Rating**: Rate each model's response on a 5-star scale
- **Category Detection**: Automatically categorizes prompts (philosophy, technology, science, etc.)
- **Gamified Statistics**: Track your usage, ratings, and performance across models and categories

### 🎨 Immersive Experience
- **VR-like Navigation**: Press 'V' to enter VR mode and navigate with mouse drag
- **Customizable Backgrounds**: Choose from pre-built themes (galaxy, jungle, etc.) or let the AI generate one
- **Auto-Adaptive UI**: Background changes based on prompt category (e.g., philosophical questions trigger philosophical themes)
- **Professional Design**: Modern UI with cyan-blue to lime-green gradient matching the ArkTek logo

### 🔧 Technical Features
- **API Key Management**: Store your own API keys per provider to avoid additional charges
- **Responsive Design**: Optimized for all window sizes with smooth transitions
- **Keyboard Shortcuts**: 
  - `P` or `Space`: Open prompt box
  - `V`: Toggle VR mode
  - `Escape`: Close modals
  - `Ctrl+Enter`: Submit prompt

## Supported LLM Providers

- **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **Google**: Gemini Pro, Gemini Pro Vision
- **Groq**: Llama 2, Mixtral, Gemma
- **xAI**: Grok Beta
- **Mistral AI**: Mistral Large, Medium, Small
- **Together AI**: Llama, Mistral, Qwen, DeepSeek, Vicuna, Falcon, BLOOM

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

## Usage

1. **Welcome Screen**: Read about the platform and pricing information
2. **Add API Keys**: Click the "API Keys" button in the bottom right to add your provider API keys
3. **Create Prompt**: Press `P` or click "New Prompt" to open the prompt box
4. **Select Models**: Choose which models you want to compare from the dropdown
5. **Submit**: Enter your prompt and submit (Ctrl+Enter)
6. **Compare & Rate**: View all responses side-by-side and rate them
7. **View Stats**: Click the "Stats" button to see your usage statistics
8. **VR Mode**: Press `V` to enter VR mode and navigate the interface

## Pricing

- **Base Subscription**: $20/month
- **Token Usage**: Additional charges apply based on token usage when using ArkTek's API keys
- **Own API Keys**: Use your own API keys to avoid additional charges beyond the base subscription

## Project Structure

```
ArkTek/
├── src/
│   ├── components/
│   │   ├── WelcomeScreen.jsx      # Opening screen with description
│   │   ├── BackgroundScene.jsx    # VR-like background with particles
│   │   ├── PromptBox.jsx          # Model selection and prompt input
│   │   ├── ResponseComparison.jsx # Side-by-side response display
│   │   ├── StatsPanel.jsx         # Gamification statistics
│   │   └── ApiKeyManager.jsx      # API key management
│   ├── services/
│   │   └── llmProviders.js       # LLM API integrations
│   ├── store/
│   │   └── useStore.js           # Zustand state management
│   ├── utils/
│   │   └── categoryDetector.js   # Category detection and theme generation
│   ├── App.jsx                   # Main application component
│   └── main.jsx                  # Entry point
├── ARKTEK_LOGO.png              # Logo reference
└── package.json
```

## Technologies

- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **Framer Motion**: Animations and transitions
- **Zustand**: State management with persistence
- **Axios**: HTTP client for API calls
- **Lucide React**: Icon library

## Development

The application uses:
- Modern React hooks and functional components
- Local storage for persistence (API keys, stats, preferences)
- Responsive design with CSS-in-JS styling
- Canvas API for particle effects and VR navigation

## License

Proprietary - All rights reserved

