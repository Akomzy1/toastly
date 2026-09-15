# Toastly

A verification-first dating-to-marriage platform for Nigerian Gen Z — Nigeria-domestic-led, with a diaspora bridge for Nigerians abroad.

This repository currently holds product documentation and static HTML page prototypes. Application code has not started yet.

## Local development

```bash
cp .env.example .env.local   # nothing is required for the marketing site
npm install
npm run dev
npm run verify               # typecheck, lint, product-constraint checks, build
node scripts/audit-mobile.mjs http://localhost:3000 360   # overflow + touch targets
```

**Don't develop inside a OneDrive-synced folder.** OneDrive treats a rebuild
overwriting `.next` as a sync conflict and renames build files with the
machine name (`BUILD_ID-<machine>`, `build-manifest-<machine>.json`). Next can
no longer find its own manifests, so `next start` fails with
`Error: UNKNOWN: unknown error, read` — and retrying never fixes it. It also
makes `npm install` take many minutes. Clone somewhere unsynced, or exclude
`.next` and `node_modules` from sync.

## Documentation

| File | What it covers |
|---|---|
| [PRD.md](PRD.md) | Product requirements: positioning, market, personas, features, phasing |
| [CLAUDE.md](CLAUDE.md) | Working context and conventions for Claude Code |
| [SKILL.md](SKILL.md) | Skill definition |
| [build-prompts.md](build-prompts.md) | Claude Code build prompts for the pages |
| [slim_prototypes.py](slim_prototypes.py) | Regenerates the readable `.slim.html` prototypes |

## Prototypes

Two forms of each page live in [design/prototype/](design/prototype/):

- **`<name>.html`** — the original bundled export. Opens directly in a browser, assets included, no build step. 8-20 MB, too large to read as text.
- **`<name>.slim.html`** — the same markup with the base64 asset manifest stripped out. This is the one to read. Regenerate with `python slim_prototypes.py design/prototype/`, which also writes the (gitignored) `assets/` folder the slim pages reference.

| Page | File |
|---|---|
| Home | [home.slim.html](design/prototype/home.slim.html) |
| How It Works | [how-it-works.slim.html](design/prototype/how-it-works.slim.html) |
| Features | [features.slim.html](design/prototype/features.slim.html) |
| Pricing | [pricing.slim.html](design/prototype/pricing.slim.html) |
| Stories | [stories.slim.html](design/prototype/stories.slim.html) |
| Diaspora | [diaspora.slim.html](design/prototype/diaspora.slim.html) |
| Safety | [safety.slim.html](design/prototype/safety.slim.html) |
| Locked Inbox | [locked-inbox.slim.html](design/prototype/locked-inbox.slim.html) |
| Design System | [design-system.slim.html](design/prototype/design-system.slim.html) |
| Brand — The Stake | [brand-the-stake.slim.html](design/prototype/brand-the-stake.slim.html) |
| Brand Assets | [brand-assets.slim.html](design/prototype/brand-assets.slim.html) |
