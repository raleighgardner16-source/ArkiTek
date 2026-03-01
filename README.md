# ArkiTek

A multi-LLM comparison platform that sends one prompt to ChatGPT, Claude, Gemini, Grok, Llama, DeepSeek, and Mistral simultaneously, then uses an AI judge to produce a consensus summary. Supports structured debate modes, automatic web search (RAG), conversation memory, gamification, and Stripe-powered subscriptions.

## Features

- **Council of LLMs** — choose any combination of models, send a single prompt, compare responses side by side
- **Debate mode** — assign roles (Optimist, Skeptic, Risk Analyst, etc.) for structured multi-model debates with a judge analysis
- **General mode** — direct multi-model answers without role assignment
- **RAG pipeline** — automatic web search via Serper for time-sensitive questions, with source attribution
- **Category detection** — Gemini classifies each prompt to decide search/context needs
- **Conversation memory** — OpenAI embeddings + MongoDB Atlas vector search for follow-up context
- **Saved history** — auto-save conversations organized by date; star, search, and browse
- **Gamification** — streaks, badges, tiers (Bronze–Platinum), daily challenges, monthly rewards
- **Subscriptions & credits** — free trial, Pro ($19.95/mo), Premium ($49.95/mo), plus one-time credit purchases via Stripe
- **Admin panel** — user management, expense tracking, revenue stats
- **Social features** — follow system, leaderboard posts, DMs and group chats (partially disabled in UI)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| State management | Zustand |
| Routing | React Router DOM v7 |
| Animation | Framer Motion |
| Markdown | react-markdown, remark-gfm, KaTeX |
| Backend | Express, TypeScript, tsx |
| Database | MongoDB (native driver) |
| Auth | JWT + bcrypt |
| Payments | Stripe |
| Email | Resend |
| Web search | Serper API |
| LLM providers | OpenAI, Anthropic, Google, xAI, Meta, DeepSeek, Mistral |
| Error tracking | Sentry |
| Logging | Pino |
| Testing | Vitest, Supertest |
| Deployment | Vercel (static + serverless) |

## Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB with vector search support)
- At least one LLM provider API key

## Getting Started

```bash
# Clone the repository
git clone <repo-url> && cd arkitek

# Install dependencies
npm install

# Create your environment file
cp .env.example .env
# Fill in the required values (see Environment Variables below)

# Run database migrations
npm run db:migrate

# Start both frontend and backend in development
npm run dev:all
```

The frontend runs on `http://localhost:3000` and the backend API on `http://localhost:3001`.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend only, port 3000) |
| `npm run dev:server` | Start Express server (backend only, port 3001) |
| `npm run dev:all` | Start both frontend and backend concurrently |
| `npm run build` | Build the frontend for production |
| `npm run start` | Start the production Express server (serves built frontend + API) |
| `npm run preview` | Preview the production build via Vite |
| `npm run db:migrate` | Run database migrations and create indexes |
| `npm run db:migrate:dry` | Preview migrations without applying changes |
| `npm run db:verify` | Verify current schema matches expected indexes |
| `npm run typecheck` | Type-check both server and client |
| `npm run typecheck:server` | Type-check server code only |
| `npm run typecheck:client` | Type-check client code only |
| `npm run test` | Run tests (single pass) |
| `npm run test:watch` | Run tests in watch mode |

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Required variables are marked below.

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `DB_NAME` | Yes | Primary database name (default: `Arkitek`) |
| `ADMIN_DB_NAME` | Yes | Admin database name |
| `JWT_SECRET` | Yes | Secret for signing JWTs (`openssl rand -hex 32`) |
| `PORT` | No | Server port (default: `3001`) |
| `APP_URL` | Yes | Public URL of the app |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
| `OPENAI_API_KEY` | * | OpenAI API key (also used for embeddings) |
| `ANTHROPIC_API_KEY` | * | Anthropic (Claude) API key |
| `GOOGLE_API_KEY` | * | Google (Gemini) API key |
| `XAI_API_KEY` | * | xAI (Grok) API key |
| `META_API_KEY` | * | Meta (Llama) API key |
| `DEEPSEEK_API_KEY` | * | DeepSeek API key |
| `MISTRAL_API_KEY` | * | Mistral API key |
| `SERPER_API_KEY` | No | Serper web search API key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `STRIPE_PRICE_ID` | Yes | Stripe Pro plan price ID |
| `STRIPE_PREMIUM_PRICE_ID` | Yes | Stripe Premium plan price ID |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `RESEND_API_KEY` | Yes | Resend email API key |
| `FROM_EMAIL` | No | Sender email (default: `noreply@arkitek.app`) |
| `LOG_LEVEL` | No | Pino log level (default: `info` prod / `debug` dev) |
| `SENTRY_DSN` | No | Server-side Sentry DSN |
| `VITE_SENTRY_DSN` | No | Client-side Sentry DSN |

\* At least one LLM provider key is required. `OPENAI_API_KEY` is recommended since it powers embeddings for conversation memory.

## Project Structure

```
├── api/                    # Vercel serverless entry point
│   └── index.ts
├── database/               # MongoDB connection, schema, migrations
│   ├── db.ts               # Connection and collection accessors
│   ├── adminDb.ts          # Admin database access
│   ├── schema.ts           # Collection schemas and indexes
│   ├── types.ts            # Document type definitions
│   └── migrate.ts          # Migration runner
├── docs/                   # Internal documentation
├── scripts/                # One-off scripts (backfill, data migration)
├── server/                 # Express backend
│   ├── config/             # Environment, logging, Sentry setup
│   ├── helpers/            # Auth, date, pricing utilities
│   ├── middleware/          # CORS, rate limiting, auth guards
│   ├── routes/             # API route handlers
│   │   ├── auth.ts         # Signup, signin, email verification, password reset
│   │   ├── stats.ts        # Usage tracking, badges, daily challenges
│   │   ├── judge.ts        # Judge context and conversation summaries
│   │   ├── llm.ts          # Non-streaming LLM calls, streaming summaries
│   │   ├── search.ts       # Web search and query reformulation
│   │   ├── rag.ts          # RAG streaming pipeline
│   │   ├── memory.ts       # Embedding-based memory retrieval
│   │   ├── history.ts      # Conversation save, list, search
│   │   ├── stripe.ts       # Checkout, webhooks, billing portal
│   │   ├── admin.ts        # Admin endpoints and pricing
│   │   ├── leaderboard.ts  # Posts, likes, comments
│   │   ├── social.ts       # Profiles, follow system
│   │   ├── messaging.ts    # DMs and group chats
│   │   ├── model.ts        # Per-model conversation context
│   │   └── notifications.ts
│   ├── services/           # Business logic
│   │   ├── context.ts      # Category detection, judge prompt building
│   │   ├── memory.ts       # Embedding generation, vector search
│   │   ├── search.ts       # Serper integration, source formatting
│   │   ├── subscription.ts # Subscription checks, overage emails
│   │   └── usage.ts        # Usage tracking, stats aggregation
│   └── types/              # Shared API helpers
├── server.ts               # Express app entry point
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── MainView.tsx        # Primary prompt + response view
│   │   ├── LandingPage.tsx     # Marketing / pricing page
│   │   ├── AuthView.tsx        # Sign in, sign up, password reset
│   │   ├── StatisticsView.tsx  # Usage stats dashboard
│   │   ├── AdminView.tsx       # Admin panel
│   │   ├── SettingsView.tsx    # Account and subscription settings
│   │   ├── NavigationBar.tsx   # Bottom tab bar
│   │   └── ...                 # ~30 more components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # LLM provider API calls
│   ├── store/              # Zustand state management
│   └── utils/              # Client utilities (API, config, theme, etc.)
├── tests/                  # Vitest test suite
├── utils/                  # Shared utilities (token counting)
├── tsconfig.json           # Server TypeScript config
├── tsconfig.app.json       # Client TypeScript config
└── vite.config.ts          # Vite configuration
```

## Architecture

### Request Flow

1. **Frontend** — React SPA sends requests to the Express API (proxied in dev via Vite, served from the same origin in production).
2. **Middleware** — requests pass through CORS, rate limiting (`express-rate-limit`), and JWT auth guards.
3. **Routes** — thin route handlers validate input and delegate to services.
4. **Services** — business logic layer handles LLM calls, search, embeddings, usage tracking, and Stripe.
5. **Database** — MongoDB native driver with typed collection accessors; no ORM.

### Council Pipeline

```
User prompt
  → Category detection (Gemini Flash)
  → [Optional] Web search (Serper) → source extraction
  → [Optional] Memory retrieval (vector search on past conversations)
  → Parallel LLM calls (selected models)
  → Judge synthesis (agreements, contradictions, unique insights)
  → Response displayed in side-by-side columns
```

### Database Design

MongoDB collections live in two databases:

- **Arkitek** (primary) — `users`, `user_stats`, `usage_data`, `prompts`, `conversation_history`, `purchases`, `judge_context`, `relationships`, `notifications`, `password_resets`, `email_verifications`, `messages`, `conversations`, and more.
- **Arkitek** (admin) — `admins`, `metadata`, `expenses`.

A vector index (`conversation_embedding_index`) on `conversation_history` supports 1536-dimensional cosine similarity search for memory retrieval.

### Deployment

The app deploys to Vercel. `api/index.ts` wraps the Express app as a serverless function. `vercel.json` routes `/api/*` to the serverless handler and everything else to the static SPA build.

## Testing

```bash
npm run test          # single run
npm run test:watch    # watch mode
```

Tests use Vitest with mocked database, Stripe, Resend, and Sentry dependencies (see `tests/setup.ts`). Current coverage includes auth (bcrypt, JWT), middleware (token validation), and rate limiting.

## License

Proprietary. All rights reserved.
