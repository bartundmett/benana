# Benana

Desktop app foundation for Gemini image generation and local-first gallery workflows.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Implemented v1 slice

- Electron + React + TypeScript desktop scaffold
- Local storage bootstrap in `~/.benana`
- SQLite schema from PRD (images, prompts, projects, queue, usage, FTS)
- API key onboarding + validation + encrypted storage fallback
- Queue-based generation pipeline with retry/backoff
- Gallery persistence + thumbnail generation
- Three-panel workspace UI with Gallery/Create/Queue/Settings
- Command palette + key shortcuts
