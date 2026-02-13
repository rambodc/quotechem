# ChatGPT Implementation Plan (Production)

## Scope
- Home page is the primary assistant interface.
- More page handles account settings and logout.
- Authentication and account management remain Firebase-based.

## Architecture
1. Frontend (React)
- Keep current chat UI with message thread, prompt suggestions, and composer.
- Add conversation history pagination and per-chat sessions.
- Add optimistic UI for sent messages and typing indicators.

2. Backend API (Node/Firebase Functions)
- Create `chatCompletions` HTTPS callable (or HTTPS endpoint) in `functions/`.
- Validate auth token and per-user rate limits before model call.
- Persist prompts/responses in Firestore by `uid` + `conversationId`.

3. OpenAI Integration
- Use server-side OpenAI API key only.
- Start with GPT-4.1 or latest production model configured via env var.
- Add streamed responses to improve perceived speed.

4. Safety and Controls
- Input validation and max token limits.
- Blocklist/guardrail checks for abuse categories.
- Structured logging for prompt, latency, token usage, and error type.

5. Data Model (Firestore)
- `conversations/{conversationId}`: uid, createdAt, title, model.
- `conversations/{conversationId}/messages/{messageId}`: role, content, createdAt, tokenUsage.

6. Deployment
- Add secrets: `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_ORG_ID`.
- Deploy functions first, then frontend build that points to callable endpoint.
- Add smoke tests for auth, send message, stream response, and persistence.

## Build Order
1. Implement backend callable + auth/rate limits.
2. Wire frontend message send to backend.
3. Add streaming and conversation persistence.
4. Add analytics/monitoring dashboards.
5. Final production rollout with staged traffic.
