# PRD: Benana
## A Professional Desktop App for AI Image Generation & Editing

**Version:** 1.0  
**Date:** February 2026  
**Status:** Draft  
**Author:** Benedikt Grimm

---

## 1. Vision & Problem Statement

NanoBanana Pro (Google's Gemini 3 Pro Image model) is arguably the most capable AI image generation and editing engine available today — native 4K output, up to 14 reference images, character consistency across 5 people, search-grounded generation, and advanced text rendering. But there's no dedicated desktop experience for it.

Users today are stuck with:

- The Gemini web app (limited quotas, no gallery, no batch workflows)
- Community web UIs that require running a local dev server
- Third-party wrappers with inconsistent quality

What's missing is a polished, Electron-based desktop application — think "the Codex app, but for image generation" — that treats the Gemini Image API as a first-class citizen and gives creators a professional workspace for their entire visual production pipeline.

**Benana** fills that gap. Bring your own Gemini API key. Everything runs locally. Your images, your prompts, your data.

---

## 2. Target Users

**Primary:** Designers, content creators, marketing teams, and solo creators who use AI image generation as part of their daily workflow and want a fast, keyboard-driven, local-first experience.

**Secondary:** Developers building AI-powered visual tools who want a reference implementation and local testing environment for the Gemini Image API.

**Tertiary:** Agencies and teams who need a shared prompt library and consistent brand asset workflows.

---

## 3. Design Philosophy

### 3.1 Inspired by the Codex App

The OpenAI Codex desktop app established a new standard for AI-native desktop interfaces:

- **Focused, distraction-free windows** — not a browser tab, a dedicated workspace
- **Parallel threads** — multiple tasks running side by side
- **Dark/light theme** with clean typography and generous spacing
- **Sidebar navigation** — projects, skills, history always accessible
- **Inline previews** — results appear right where you're working
- **Keyboard-first** — command palette (Cmd+K), shortcuts for everything
- **Native OS integration** — notifications, drag-and-drop, file associations

Benana adopts these patterns but adapts them for visual creative work instead of code.

### 3.2 Core Design Principles

1. **Canvas, not chat.** The primary interface is a visual workspace, not a chat thread. Prompts are inputs, images are outputs. The conversation happens through iterations, not messages.

2. **Gallery as home base.** Every generated image lives in a persistent, searchable, filterable gallery. Nothing gets lost. The gallery is the app's memory.

3. **Non-destructive editing.** Every edit creates a new version. Full version tree with branching. You can always go back.

4. **Local-first, API-powered.** Images, prompts, metadata, and settings are stored locally in SQLite. The only network calls are to the Gemini API. No telemetry, no cloud sync (unless the user opts in).

5. **Progressive disclosure.** Simple prompting works out of the box. Advanced controls (aspect ratio, resolution, reference images, search grounding, thinking level) are available but not in your face.

---

## 4. Technical Architecture

### 4.1 Stack

| Layer | Technology | Rationale |
|---|---|---|
| Shell | Electron 33+ | Cross-platform, file system access, native menus, notifications |
| Renderer | React 19 + TypeScript | Component model, ecosystem, Codex-level UI quality |
| Styling | Tailwind CSS 4 + Radix UI | Utility-first with accessible primitives |
| State | Zustand + React Query | Lightweight global state + API cache/retry |
| Database | SQLite (via better-sqlite3) | Local gallery, prompt history, metadata |
| Image Processing | Sharp (Node.js) | Thumbnails, EXIF, format conversion |
| File Storage | Local filesystem (~/.nanobanana-studio/) | Images, exports, config |
| API Client | @google/genai SDK | Official Gemini API SDK |
| Build | Vite + electron-builder | Fast HMR in dev, cross-platform builds |

### 4.2 Directory Structure

```
~/.nanobanana-studio/
├── config.json              # API key (encrypted), preferences, theme
├── studio.db                # SQLite: gallery, prompts, projects, tags
├── images/
│   ├── originals/           # Full-res API outputs (PNG)
│   ├── thumbnails/          # 400px previews (WebP)
│   └── references/          # Uploaded reference images
├── exports/                 # User exports (PNG, JPG, WebP)
├── prompts/                 # Saved prompt templates (JSON)
└── projects/                # Project workspaces
```

### 4.3 API Integration Layer

The app wraps the Gemini API with a queue/retry layer:

```typescript
interface GenerationRequest {
  model: 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image-preview';
  prompt: string;
  referenceImages?: Buffer[];        // up to 14
  aspectRatio?: AspectRatio;         // 1:1 | 2:3 | 3:2 | 3:4 | 4:3 | 4:5 | 5:4 | 9:16 | 16:9 | 21:9
  resolution?: '1K' | '2K' | '4K';
  thinkingLevel?: 'none' | 'low' | 'medium' | 'high';
  useGoogleSearch?: boolean;
  responseModalities?: ('TEXT' | 'IMAGE')[];
}
```

Features of the API layer:

- **Request queue** with configurable concurrency (default: 2 parallel)
- **Automatic retry** with exponential backoff on 429/5xx
- **Cost estimation** before generation ($0.134 for 1K/2K, $0.24 for 4K)
- **Token tracking** and session cost display
- **Rate limit awareness** — shows remaining quota
- **Streaming support** where available
- **SynthID detection** — flag AI-generated images on import

---

## 5. Feature Specification

### 5.1 Onboarding & API Key Setup

**First Launch Flow:**

1. Welcome screen with product overview (3 slides max)
2. API key input — link to Google AI Studio for key generation
3. Key validation — test call to confirm the key works
4. Model selection — default to Gemini 3 Pro Image, option for Flash
5. Ready state — drop into empty gallery with a prominent "Create" button

API key is stored encrypted in the OS keychain (Electron safeStorage API). User can rotate or remove keys anytime from Settings.

### 5.2 The Workspace (Main Window)

The main window follows a three-panel layout:

```
┌──────────────────────────────────────────────────────────┐
│  ◉ ◉ ◉   Benana                     [Cmd+K]  [≡]  [⚙]  │
├────────┬─────────────────────────────────┬───────────────┤
│        │                                 │               │
│  Side  │       Canvas / Gallery          │   Inspector   │
│  bar   │                                 │   Panel       │
│        │                                 │               │
│ ────── │                                 │  • Metadata   │
│ Gallery│                                 │  • Prompt     │
│ Create │                                 │  • Settings   │
│ Projects│                                │  • Versions   │
│ Prompts│                                 │  • Actions    │
│ Queue  │                                 │               │
│        │                                 │               │
├────────┴─────────────────────────────────┴───────────────┤
│  [Prompt Composer]                            [Generate]  │
└──────────────────────────────────────────────────────────┘
```

**Sidebar (left, collapsible — Cmd+B):**

- Gallery — masonry grid of all generated images
- Create — new generation workspace
- Projects — organized workspaces with their own galleries
- Prompt Library — saved and community prompts
- Queue — active and recent generation jobs
- Settings — API, theme, preferences

**Canvas (center):**

Context-dependent. Shows either:
- Gallery view (masonry grid with filtering)
- Generation workspace (prompt + preview)
- Image detail view (full-res with editing tools)
- Comparison view (side-by-side versions)

**Inspector (right, collapsible — Cmd+I):**

Shows details for the selected image or active generation:
- Full prompt used
- Model, resolution, aspect ratio
- Generation time and estimated cost
- Version history tree
- Tags and metadata
- Quick actions (export, duplicate, remix, delete)

### 5.3 Generation Workspace

The core creation experience. Accessed via Cmd+N or the Create button.

**Prompt Composer (bottom bar):**

- Multi-line text input with auto-resize
- Reference image slots (drag-and-drop, up to 14)
  - Visual preview of attached references
  - Per-image labels (object, person, style reference)
- Quick settings bar:
  - Model toggle: Pro (Thinking) / Flash (Fast)
  - Aspect ratio picker: visual thumbnails for each ratio
  - Resolution: 1K / 2K / 4K with price indicator
  - Google Search toggle (for fact-grounded images)
  - Thinking level slider: None → Low → Medium → High
- Generate button (Cmd+Enter)
- Batch count selector (1–4 variants per prompt)

**Generation Preview:**

- Live progress indicator with estimated time
- Image appears inline as soon as the API returns
- Alongside the image: any text the model returned (explanations, reasoning)
- Quick actions on the result:
  - ✓ Accept (save to gallery)
  - ↻ Regenerate (same prompt, new seed)
  - ✎ Edit (enter editing mode with this as base)
  - ⇄ Variations (generate 3 more with slight prompt mutations)

### 5.4 Image Editing Mode

When editing an existing image:

```
┌──────────────────────────────────────────────┐
│  [Original]         →        [Preview]        │
│                                               │
│  Source image                Result preview    │
│  with mask overlay           (live after gen)  │
│                                               │
├───────────────────────────────────────────────┤
│  Edit prompt: "Change the sky to sunset..."   │
│  [Reference images]  [Mask tool]  [Apply]     │
└───────────────────────────────────────────────┘
```

**Editing capabilities (all via Gemini API, not local processing):**

- **Inpainting with mask** — brush tool to paint areas for targeted editing
- **Natural language edits** — "make the background blurrier", "change her dress to red"
- **Style transfer** — upload a style reference, apply to current image
- **Aspect ratio change** — re-compose the image for a different ratio
- **Lighting/mood changes** — "make it night time", "add dramatic chiaroscuro"
- **Object removal/addition** — "remove the person on the left", "add a cat on the table"
- **Camera angle adjustments** — "change to a wide-angle shot", "add bokeh"
- **Text rendering** — "add the text 'SALE' in bold red at the top"
- **Localization** — "translate all text to German" (leveraging Gemini's multilingual capabilities)

### 5.5 Gallery

The gallery is the app's home screen and persistent visual memory.

**Layout Options:**

- Masonry grid (default) — Pinterest-style adaptive layout
- Grid — uniform squares, good for comparing
- List — compact view with prompt preview
- Timeline — chronological with date separators

**Filtering & Search:**

- Full-text search across prompts and tags
- Filter by: model, resolution, aspect ratio, date range, project, tags
- Smart collections: "Favorites", "Recent", "4K Only", "With References"
- Sort by: date (newest/oldest), resolution, generation cost

**Bulk Operations:**

- Multi-select with Shift+Click or Cmd+Click
- Bulk export (choose format, resolution, naming convention)
- Bulk tag, move to project, delete
- Bulk re-generate (same prompts, new outputs)

**Image Detail View (click any image):**

- Full-resolution display with zoom (scroll wheel, pinch)
- Pan with drag
- Side-by-side comparison with any other image (Cmd+drag second image)
- EXIF-style metadata overlay (toggle with 'I')
- Version history as a visual tree (branch when edited)
- Copy prompt button
- Open in external editor
- Share/export

### 5.6 Projects

Projects are isolated workspaces within the app.

Each project has:

- Its own gallery subset
- A project-level system prompt (e.g., "All images should be in the style of watercolor illustrations with a warm color palette")
- Shared reference images (brand assets, style guides)
- Export presets (e.g., "Instagram Story: 9:16, 2K, WebP")
- A README/notes field

Use cases: client work, brand kits, content series, campaigns.

### 5.7 Prompt Library

A first-class prompt management system.

**Features:**

- Save any prompt as a template
- Variables in templates: `{subject}`, `{style}`, `{color_palette}`
- Folder organization
- Import/export as JSON (shareable with team)
- Prompt history with search
- "Remix" any past prompt — fork it and modify
- Community prompt import (from GitHub repos like awesome-nano-banana-prompts)

### 5.8 Multi-Image Composition

NanoBanana Pro's killer feature: blending up to 14 reference images.

**Dedicated Composition View:**

```
┌─────────────────────────────────────────┐
│  Reference Images (drag to reorder)      │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐  [+]   │
│  │ 1 │ │ 2 │ │ 3 │ │ 4 │ │ 5 │        │
│  └───┘ └───┘ └───┘ └───┘ └───┘        │
│  👤Person 👤Person 📦Object 🎨Style     │
│                                         │
│  Prompt: "Group photo of these people   │
│  at a beach sunset, casual clothing"    │
│                                         │
│  [Aspect: 16:9] [Res: 2K] [Generate]   │
└─────────────────────────────────────────┘
```

- Drag-and-drop image slots
- Label each reference: Person (up to 5), Object (up to 6), Style
- Visual indicator of API limits (14 total, 5 people, 6 objects)
- Preview composition layout before generating

### 5.9 Batch & Queue System

For production workflows:

- **Queue panel** — shows all active and pending generations
- **Batch generation** — CSV/JSON import of prompts with parameters
- **Scheduled generation** — "generate these 20 product shots, 2 at a time"
- **Progress indicators** — per-job progress with estimated completion
- **Cost dashboard** — running total for the current session/day/month
- **Pause/resume** — pause the queue without losing pending jobs
- **Priority queue** — drag jobs up/down in the queue

### 5.10 Export System

- **Format options:** PNG (lossless), JPG (quality slider), WebP (size-optimized)
- **Resolution options:** Original, downscale to specific dimensions
- **Naming conventions:** Configurable templates (`{project}_{prompt_short}_{date}_{index}`)
- **Batch export:** Export entire projects or filtered selections
- **Quick share:** Copy to clipboard, open in Finder/Explorer
- **Platform presets:**
  - Instagram Post (1:1, 1080px)
  - Instagram Story (9:16, 1080×1920)
  - YouTube Thumbnail (16:9, 1280×720)
  - LinkedIn Post (1:1, 1200px)
  - Print A4 300dpi (4K)
  - Twitter/X Header (3:1, 1500×500)

---

## 6. Keyboard Shortcuts & Command Palette

### 6.1 Command Palette (Cmd+K)

Fuzzy-search across all actions, recent images, prompts, and settings. Inspired by Raycast/Spotlight.

### 6.2 Key Shortcuts

| Action | Shortcut |
|---|---|
| New Generation | Cmd+N |
| Gallery | Cmd+1 |
| Queue | Cmd+2 |
| Prompt Library | Cmd+3 |
| Command Palette | Cmd+K |
| Toggle Sidebar | Cmd+B |
| Toggle Inspector | Cmd+I |
| Generate | Cmd+Enter |
| Regenerate | Cmd+Shift+Enter |
| Save to Favorites | Cmd+S |
| Export Selected | Cmd+E |
| Zoom In/Out | Cmd++ / Cmd+- |
| Toggle Dark/Light | Cmd+Shift+T |
| Settings | Cmd+, |
| Search Gallery | Cmd+F |
| Close Tab/View | Cmd+W |

---

## 7. Theme & Visual Design

### 7.1 Design Language

- **Typography:** Inter for UI, JetBrains Mono for technical details (costs, tokens)
- **Color palette:** Neutral grays with a warm banana-yellow accent (#F5C518)
- **Spacing:** 8px grid system, generous whitespace
- **Corners:** Rounded (8px for cards, 12px for panels, 24px for modals)
- **Shadows:** Subtle elevation for floating panels and modals
- **Animations:** Framer Motion for page transitions, image loading states, and micro-interactions. Subtle, purposeful, never distracting.
- **Glass morphism:** Frosted glass effects on overlays and the command palette (subtle, not heavy)

### 7.2 Dark Mode (Default)

```
Background:     #0A0A0B (near-black, not pure black)
Surface:        #141416
Surface-hover:  #1C1C1F
Border:         #2A2A2E
Text-primary:   #EDEDEF
Text-secondary: #8E8E93
Accent:         #F5C518 (banana yellow)
Accent-hover:   #FFD84D
Success:        #34C759
Error:          #FF3B30
```

### 7.3 Light Mode

```
Background:     #FAFAFA
Surface:        #FFFFFF
Surface-hover:  #F0F0F2
Border:         #E0E0E3
Text-primary:   #1A1A1B
Text-secondary: #6E6E73
Accent:         #D4A600
```

### 7.4 Image Loading States

- **Placeholder:** Soft gradient shimmer in the expected aspect ratio
- **Generating:** Animated progress ring with estimated time countdown
- **Loaded:** Fade-in with subtle scale-up (0.98 → 1.0, 200ms ease-out)
- **Error:** Red outline with retry button

---

## 8. Data Model

### 8.1 Core Entities (SQLite)

```sql
CREATE TABLE images (
  id            TEXT PRIMARY KEY,    -- UUID
  project_id    TEXT,                -- FK to projects
  prompt        TEXT NOT NULL,
  model         TEXT NOT NULL,
  aspect_ratio  TEXT,
  resolution    TEXT,
  thinking_level TEXT,
  used_search   BOOLEAN DEFAULT 0,
  model_text    TEXT,                -- text returned alongside image
  file_path     TEXT NOT NULL,       -- relative path to original
  thumb_path    TEXT,                -- relative path to thumbnail
  width         INTEGER,
  height        INTEGER,
  file_size     INTEGER,
  parent_id     TEXT,                -- FK to images (for edits/versions)
  generation_ms INTEGER,             -- API response time
  cost_estimate REAL,                -- estimated $ cost
  is_favorite   BOOLEAN DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME             -- soft delete
);

CREATE TABLE reference_images (
  id            TEXT PRIMARY KEY,
  image_id      TEXT NOT NULL,       -- FK to images
  file_path     TEXT NOT NULL,
  label         TEXT,                -- 'person' | 'object' | 'style'
  position      INTEGER              -- order in the reference list
);

CREATE TABLE tags (
  id            TEXT PRIMARY KEY,
  name          TEXT UNIQUE NOT NULL,
  color         TEXT                 -- hex color for visual display
);

CREATE TABLE image_tags (
  image_id      TEXT NOT NULL,
  tag_id        TEXT NOT NULL,
  PRIMARY KEY (image_id, tag_id)
);

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  system_prompt TEXT,                -- project-level prompt prefix
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prompts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  template      TEXT NOT NULL,       -- with {variable} placeholders
  variables     TEXT,                -- JSON array of variable definitions
  folder        TEXT,
  usage_count   INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE queue_jobs (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL,       -- pending | running | completed | failed | cancelled
  request       TEXT NOT NULL,       -- JSON GenerationRequest
  result_id     TEXT,                -- FK to images
  error         TEXT,
  priority      INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at    DATETIME,
  completed_at  DATETIME
);

CREATE TABLE usage_log (
  id            TEXT PRIMARY KEY,
  model         TEXT NOT NULL,
  resolution    TEXT,
  cost_estimate REAL,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 8.2 Full-Text Search

```sql
CREATE VIRTUAL TABLE images_fts USING fts5(prompt, model_text, content=images);
```

---

## 9. Performance & UX Considerations

### 9.1 Performance Targets

| Metric | Target |
|---|---|
| App cold start | < 2 seconds |
| Gallery load (1000 images) | < 500ms (thumbnails lazy-loaded) |
| Image detail open | < 100ms (thumbnail instant, full-res streams) |
| Prompt submission to API | < 200ms local processing |
| Search results | < 100ms for 10k+ images |
| Memory usage (idle) | < 200MB |
| Memory usage (gallery, 1000 thumbnails) | < 500MB |

### 9.2 Electron Best Practices

- **IPC separation** — all file I/O and API calls in the main process, never in the renderer
- **Thumbnail generation** — Sharp runs in a worker thread, never blocks the UI
- **Virtual scrolling** — gallery uses react-window for smooth scrolling with 10k+ items
- **Image caching** — LRU cache for recently viewed full-res images
- **Process isolation** — contextBridge with explicit API surface, no nodeIntegration
- **Auto-update** — electron-updater with delta updates
- **Crash reporting** — optional, opt-in Sentry integration
- **Native menus** — proper macOS/Windows menu bar with all shortcuts
- **Deep links** — `nanobanana-studio://` protocol for opening from external tools

### 9.3 Offline Behavior

The app works offline for:

- Browsing and searching the gallery
- Organizing projects, tags, prompts
- Exporting images
- Editing metadata

Generation obviously requires network. The queue system gracefully handles connectivity changes — jobs pause when offline and resume when connected.

---

## 10. Security & Privacy

- API key encrypted via Electron safeStorage (OS keychain)
- No telemetry by default (optional opt-in analytics)
- No cloud sync (all data local)
- No third-party API calls (only googleapis.com)
- SynthID watermark detection on import (inform user, don't remove)
- Local SQLite database — no remote database connections
- Auto-lock option (require system password after idle timeout)

---

## 11. Platform Support

### 11.1 Launch (v1.0)

- macOS (Apple Silicon + Intel)
- Windows 10/11 (x64 + ARM64)
- Linux (AppImage, deb, rpm — x64)

### 11.2 Distribution

- Direct download from GitHub Releases
- Homebrew Cask (macOS)
- winget (Windows)
- Snap Store (Linux)
- Auto-update built in

---

## 12. Roadmap

### v1.0 — Foundation

- API key setup and model selection
- Text-to-image generation with all API parameters
- Image editing with natural language
- Masonry gallery with search and filtering
- Version history
- Basic export
- Dark and light themes
- Keyboard shortcuts and command palette

### v1.1 — Composition & Batch

- Multi-image composition (14 references)
- Batch generation from CSV/JSON
- Queue system with priority
- Cost tracking dashboard
- Platform export presets

### v1.2 — Projects & Prompts

- Project workspaces
- Prompt library with variables
- Community prompt import
- Project-level system prompts
- Shared reference image sets

### v1.3 — Advanced Editing

- Mask painting for inpainting
- Side-by-side comparison view
- Style transfer workflow
- Localization workflow (translate text in images)
- Search-grounded generation UI

### v2.0 — Team & Ecosystem

- Optional cloud sync (bring your own S3/GCS)
- Team prompt sharing
- Plugin API for custom workflows
- Gemini 2.5 Flash video generation integration
- MCP server for integration with Claude Code / Codex / other tools

---

## 13. Success Metrics

| Metric | Target (6 months post-launch) |
|---|---|
| GitHub stars | 2,000+ |
| Monthly active users | 5,000+ |
| Average session duration | 15+ minutes |
| Images generated per session | 8+ |
| Gallery size (p90 user) | 500+ images |
| App Store rating (if distributed) | 4.5+ stars |
| Crash-free sessions | 99.5%+ |

---

## 14. Open Questions

1. **Gemini API pricing changes** — need to handle dynamic pricing and communicate costs clearly. Should we implement a "budget limit" feature?

2. **Vertex AI vs AI Studio keys** — support both? Different auth flows, same models.

3. **Tauri vs Electron** — Tauri gives smaller binary size and lower memory. Worth the tradeoff of a less mature ecosystem? Decision: start with Electron (proven, Codex uses it), migrate to Tauri v2 if performance demands it.

4. **Plugin system scope** — how open should the plugin API be? Full access to the generation pipeline, or just prompt preprocessing and post-processing?

5. **Community prompt marketplace** — build a simple sharing mechanism, or integrate with an existing platform?

6. **Nano Banana (Flash) vs Pro toggle UX** — how to make the speed/quality tradeoff obvious without overwhelming new users?

---

## 15. Competitive Landscape

| App | Strength | Weakness | Benana Advantage |
|---|---|---|---|
| Gemini Web App | Official, free tier | No gallery, limited controls, quota walls | Full API access, persistent gallery, batch |
| NanoBananaEditor (GitHub) | Good editing UI | Web only, no persistence, no gallery | Native app, SQLite gallery, projects |
| nano-banana-ui (GitHub) | Feature-rich web UI | Requires dev server, no offline | Installable, offline gallery, better UX |
| Midjourney (Discord) | Large community | Different model, chat-based UX | Dedicated workspace, local-first |
| ComfyUI + Nano Banana node | Extreme flexibility | Steep learning curve | Accessible to non-developers |

---

*This PRD is a living document. It will evolve as the Gemini Image API matures and community feedback comes in.*
