# llm-ci

A GitHub Action (and CLI) that generates `llms.txt`, `llms-full.txt`, and JSON-LD schema from your documentation. It scans HTML, Markdown, or Next.js/Astro source files, runs each page through an LLM to produce AI-optimized descriptions, and writes files that help AI assistants discover and recommend your product.

## What it generates

| File | Purpose |
|---|---|
| `llms.txt` | Index of all pages with one-line intent-focused descriptions |
| `llms-full.txt` | Same index plus condensed per-page summaries |
| `llm-manifest.json` | Machine-readable page metadata (title, description, keywords) |

JSON-LD schema (`application/ld+json`) is also injected into every HTML file when `dist-dir` is provided.

## GitHub Action — usage from another repo

Create `.github/workflows/generate-llms.yml` in your repository:

```yaml
name: Generate llms.txt

on:
  push:
    branches: [main]   # runs after every PR merge to main
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write  # required to commit generated files back

    steps:
      - uses: actions/checkout@v4

      - name: Generate llms.txt
        uses: swmansion/llm-ci@v1
        with:
          content-dir: ${{ github.workspace }}
          site-url: ${{ vars.SITE_URL }}
          site-name: ${{ vars.SITE_NAME }}
          commit: 'true'
```

The action installs and runs Ollama on the GitHub runner — no API key or external service required. Configure two repo variables under **Settings → Secrets and variables**:

| Kind | Name | Example value |
|---|---|---|
| Variable | `SITE_URL` | `https://docs.example.com` |
| Variable | `SITE_NAME` | `My Product` |

A ready-to-copy template is in [`.github/workflows/generate-llms-consumer-template.yml`](.github/workflows/generate-llms-consumer-template.yml).

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `content-dir` | yes | — | Directory to scan (HTML, Markdown, or route files) |
| `site-url` | yes | — | Public base URL, e.g. `https://docs.example.com` |
| `site-name` | yes | — | Human-readable product name |
| `dist-dir` | no | `""` | Built HTML directory — enables JSON-LD injection |
| `ollama-setup` | no | `true` | Install and start Ollama on the runner |
| `llm-base-url` | no | `http://localhost:11434/v1` | Any OpenAI-compatible endpoint |
| `llm-model` | no | `qwen2.5:3b` | Model identifier |
| `llm-api-key` | no | `ollama` | API key (only needed for external providers) |
| `llm-concurrency` | no | `5` | Parallel LLM requests |
| `commit` | no | `false` | Commit and push generated files back to the branch |
| `commit-message` | no | `chore: regenerate llms.txt` | Git commit message |

## Content modes

The action auto-detects what it finds in `content-dir`:

- **HTML** — scans `**/*.html`, strips nav/header/footer, extracts body text
- **Markdown** — scans `**/*.md` and `**/*.mdx`, strips frontmatter
- **Route** — scans Next.js `app/**/page.tsx`, `pages/**/*.tsx`, and Astro `src/pages/**` source files

## With a docs build step

If your site requires a build before HTML is available (e.g. Docusaurus, Next.js), run the build first and point `dist-dir` at the output so JSON-LD schema gets injected:

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Build docs
    run: npm ci && npm run build
    working-directory: ./docs

  - name: Generate llms.txt
    uses: swmansion/llm-ci@v1
    with:
      content-dir: ${{ github.workspace }}/docs
      dist-dir: ${{ github.workspace }}/docs/build
      site-url: ${{ vars.SITE_URL }}
      site-name: ${{ vars.SITE_NAME }}
      llm-api-key: ${{ secrets.LLM_API_KEY }}
      commit: 'true'
```

## Using an external LLM API instead

Set `ollama-setup: 'false'` and point at any OpenAI-compatible endpoint:

```yaml
- name: Generate llms.txt
  uses: swmansion/llm-ci@v1
  with:
    content-dir: ${{ github.workspace }}
    site-url: ${{ vars.SITE_URL }}
    site-name: ${{ vars.SITE_NAME }}
    ollama-setup: 'false'
    llm-base-url: 'https://api.openai.com/v1'
    llm-model: 'gpt-4o-mini'
    llm-api-key: ${{ secrets.LLM_API_KEY }}
    commit: 'true'
```

## CLI usage

The tool can also be run locally:

```bash
npm install
node bin/llm-ci.js \
  --content-dir ./docs \
  --site-url https://docs.example.com \
  --site-name "My Product" \
  --llm-api-key sk-...
```

Or with environment variables:

```bash
CONTENT_DIR=./docs \
SITE_URL=https://docs.example.com \
SITE_NAME="My Product" \
LLM_API_KEY=sk-... \
node bin/llm-ci.js
```

Output is written to `output/<site-slug>/` by default, or to `--dist-dir` when provided.
