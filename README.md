# Benana

Benana is a local-first desktop workspace for Gemini image generation.
It combines project context, prompt templates, generation queueing, and a searchable gallery in one Electron app.

## Status

This project is in active development (`0.1.x`) and currently optimized for local workflows.
Expect rapid iteration and occasional breaking changes.

## Highlights

- Local-first architecture (SQLite + filesystem, no cloud backend required)
- Gemini API integration with key validation and encrypted key storage
- Queue-based generation pipeline with retry and backoff behavior
- Project workspace with brand assets and reusable prompt templates
- Gallery view with favorites, search, and image metadata inspection
- Cost tracking (session/day/month/all windows)

## Stack

- Electron (main process + secure preload bridge)
- React + TypeScript + Vite (renderer)
- SQLite via `better-sqlite3`
- Local image pipeline via `sharp`
- State/data: Zustand + TanStack Query

## Repository Layout

- `electron/` main process, IPC handlers, queue, storage, Gemini client
- `src/` renderer app and UI components
- `shared/` shared TypeScript contracts between main/renderer
- `.github/workflows/` CI and release workflows
- `PRD.md` product requirements and roadmap context

## Requirements

- Node.js `22.x`
- npm `10.x`+
- Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Quick Start

```bash
npm ci
npm run dev
```

Dev mode starts:

- Vite renderer on `http://localhost:5173`
- Electron main process TypeScript watch build
- Electron app reload loop via `nodemon`

## First Launch

1. Open the app.
2. Complete onboarding.
3. Add and validate your Gemini API key.
4. Choose a default model and start generating.

## Data Storage

Benana stores all local data under `~/.benana`:

- `config.json` local config (includes encrypted API key payload)
- `studio.db` SQLite database
- `images/originals` generated source images
- `images/thumbnails` generated thumbnails
- `images/references` reference/remix inputs
- `projects/` project-related files and brand assets
- `exports/` downloaded/exported images

## Scripts

- `npm run dev` run renderer + main + Electron in watch mode
- `npm run build` typecheck + renderer build + main build
- `npm run build:renderer` build web renderer bundle
- `npm run build:main` compile Electron main/preload TypeScript
- `npm run typecheck` run strict TS checks for renderer and Electron
- `npm run lint` run ESLint
- `npm run test` run Vitest
- `npm run dist:mac` build and package macOS artifacts with electron-builder

## CI and Releases

- CI workflow (`.github/workflows/ci.yml`) runs lint/test/typecheck/build checks on macOS.
- The macOS release workflow (`.github/workflows/release-mac.yml`) runs on version tags (`v*`) and publishes `.dmg`/`.zip` artifacts.
- `electron-liquid-glass` is installed as an optional macOS-only dependency so non-macOS installs do not fail.

## Troubleshooting

### `EBADPLATFORM` for `electron-liquid-glass`

If you hit this locally, ensure you are on the latest lockfile and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

`electron-liquid-glass` is macOS-only and optional; npm skips it automatically on non-macOS runners.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Run `npm run lint && npm run test && npm run typecheck`.
4. Open a pull request with a clear problem/solution description.

## License

MIT. See [`LICENSE`](LICENSE).
