import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, extname, basename, sep } from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import { glob } from 'glob';
import { chatJson } from './llm.js';

const contentDir = resolve(process.env.CONTENT_DIR || '.');
const distDir = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : null;
const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
const siteName = process.env.SITE_NAME || '';
const siteSlug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const outDir = distDir ?? join(contentDir, 'output', siteSlug);
mkdirSync(outDir, { recursive: true });

if (!siteUrl) throw new Error('SITE_URL is required');
if (!siteName) throw new Error('SITE_NAME is required');

const MIN_CONTENT_LENGTH = 200;
const IGNORE = ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/build/**', '**/*.config.{ts,js,mjs,cjs}', '**/*.d.ts'];

// --- Mode detection ---

async function detectMode() {
  const htmlFiles = await glob('**/*.html', { cwd: contentDir, ignore: IGNORE });
  if (htmlFiles.length > 0) return 'html';

  const mdFiles = await glob('**/*.{md,mdx}', { cwd: contentDir, ignore: IGNORE });
  if (mdFiles.length > 0) return 'markdown';

  return 'route';
}

// --- HTML mode ---

const HTML_SKIP = ['404.html', '500.html', '404/index.html', '500/index.html'];
const STRIP_SELECTORS = ['nav', 'header', 'footer', 'aside', 'script', 'style', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', 'noscript'];

function htmlToText(html) {
  const root = parseHtml(html);
  for (const sel of STRIP_SELECTORS) root.querySelectorAll(sel).forEach((el) => el.remove());
  const body = root.querySelector('main') ?? root.querySelector('body') ?? root;
  return body.textContent.replace(/\s+/g, ' ').trim();
}

function htmlTitle(html) {
  const root = parseHtml(html);
  const title = root.querySelector('title')?.text?.trim() || '';
  // Strip common " — Site Name" or " | Site Name" suffixes
  return title.replace(/[\s—|–-]+.*$/, '').trim() || title;
}

function htmlUrlPath(filePath) {
  const rel = relative(contentDir, filePath).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel.replace(/\.html$/, '/');
}

async function collectHtmlPages() {
  const files = await glob('**/*.html', { cwd: contentDir, absolute: true, ignore: IGNORE });
  const pages = [];
  for (const file of files) {
    const rel = relative(contentDir, file).split(sep).join('/');
    if (HTML_SKIP.some((s) => rel.endsWith(s))) continue;
    const html = readFileSync(file, 'utf8');
    const text = htmlToText(html);
    if (text.length < MIN_CONTENT_LENGTH) continue;
    pages.push({ filePath: file, urlPath: htmlUrlPath(file), rawText: text, title: htmlTitle(html) });
  }
  return pages;
}

// --- Markdown mode ---

function stripFrontmatter(text) {
  return text.replace(/^---[\s\S]*?---\n?/, '').trim();
}

function inferTitle(filePath, content) {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  const name = basename(filePath, extname(filePath));
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function mdUrlPath(filePath) {
  const rel = relative(contentDir, filePath).split(sep).join('/');
  const noExt = rel.replace(/\.(md|mdx)$/, '');
  if (noExt === 'index') return '/';
  if (noExt.endsWith('/index')) return '/' + noExt.slice(0, -'/index'.length) + '/';
  return '/' + noExt + '/';
}

async function collectMarkdownPages() {
  const files = await glob('**/*.{md,mdx}', { cwd: contentDir, absolute: true, ignore: IGNORE });
  const pages = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const text = stripFrontmatter(raw);
    if (text.length < MIN_CONTENT_LENGTH) continue;
    pages.push({ filePath: file, urlPath: mdUrlPath(file), rawText: text, title: inferTitle(file, text) });
  }
  return pages;
}

// --- Route mode (Next.js / Astro source) ---

function resolveLocalImports(filePath, visited = new Set()) {
  if (visited.has(filePath)) return '';
  visited.add(filePath);
  let content;
  try { content = readFileSync(filePath, 'utf8'); } catch { return ''; }
  const dir = filePath.replace(/[/\\][^/\\]+$/, '');
  const importRe = /from\s+['"](\.[^'"]+)['"]/g;
  let combined = content;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const importPath = m[1];
    for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']) {
      const full = resolve(dir, importPath + (importPath.endsWith(ext.replace(/^\//, '')) ? '' : ext));
      try {
        const imported = readFileSync(full, 'utf8');
        combined += '\n' + imported;
        break;
      } catch {}
    }
  }
  return combined;
}

function routeUrlPath(filePath, routeRoot) {
  const rel = relative(routeRoot, filePath).split(sep).join('/');
  // App router: app/foo/bar/page.tsx → /foo/bar/
  const appMatch = rel.match(/^app\/(.*?)\/page\.[jt]sx?$/);
  if (appMatch) return appMatch[1] ? `/${appMatch[1]}/` : '/';
  // App router index: app/page.tsx → /
  if (rel === 'app/page.tsx' || rel === 'app/page.jsx') return '/';
  // Pages router: pages/foo.tsx → /foo/
  const pagesMatch = rel.match(/^pages\/(.+)\.[jt]sx?$/);
  if (pagesMatch) {
    const p = pagesMatch[1];
    if (p === 'index') return '/';
    return '/' + p.replace(/\/index$/, '') + '/';
  }
  // Astro: src/pages/foo.astro → /foo/
  const astroMatch = rel.match(/^src\/pages\/(.+)\.(astro|md|mdx)$/);
  if (astroMatch) {
    const p = astroMatch[1];
    if (p === 'index') return '/';
    return '/' + p.replace(/\/index$/, '') + '/';
  }
  return '/' + rel.replace(/\.[^.]+$/, '/');
}

async function collectRoutePages() {
  const patterns = [
    'app/**/page.{tsx,jsx,ts,js}',
    'pages/**/*.{tsx,jsx}',
    'src/pages/**/*.{astro,md,mdx}',
  ];
  const pagesIgnore = [...IGNORE, '**/pages/_app.*', '**/pages/_document.*', '**/pages/_error.*', '**/pages/api/**'];
  const files = await glob(patterns, { cwd: contentDir, absolute: true, ignore: pagesIgnore });
  const pages = [];
  for (const file of files) {
    const text = resolveLocalImports(file);
    if (text.length < MIN_CONTENT_LENGTH) continue;
    pages.push({ filePath: file, urlPath: routeUrlPath(file, contentDir), rawText: text, title: '' });
  }
  return pages;
}

// --- LLM analysis ---

async function pool(tasks, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) { const idx = i++; results[idx] = await tasks[idx](); }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function analyzePage({ filePath, urlPath, rawText, title: inferredTitle }) {
  process.stderr.write(`  analyzing: ${relative(contentDir, filePath)}\n`);

  const result = await chatJson([
    { role: 'system', content: 'You are optimizing documentation for AI discoverability. Your job is to write content that helps AI assistants know exactly when to recommend a specific page to a user. Descriptions must encode user intent — not page content. Always respond with valid JSON only.' },
    {
      role: 'user',
      content: `Analyze this web page content and return a JSON object with exactly these fields:
- "title": short page title (max 8 words)
- "description": one sentence (max 20 words) that starts with an action verb and encodes the user intent or task this page satisfies — e.g. "Install the SDK via Swift Package Manager or CocoaPods" not "This page covers installation steps"
- "keywords": array of 3-5 relevant technical keywords
- "summary": condensed prose (150-200 words) capturing all key information; end with a sentence beginning "Recommend when:" that lists the user questions or problems this page answers

${inferredTitle ? `Known page title: ${inferredTitle}\n` : ''}Page content:
${rawText.slice(0, 4000)}`,
    },
  ]);

  const title = result.title || inferredTitle || urlPath;
  return { filePath, urlPath, title, description: result.description, keywords: result.keywords, summary: result.summary };
}

async function synthesize(pages) {
  process.stderr.write(`  synthesizing site-level summary...\n`);
  const pageList = pages.map((p) => `- ${p.title}: ${p.description}`).join('\n');
  return chatJson([
    { role: 'system', content: 'You are optimizing a product for AI discoverability. Write content that helps AI assistants recognize when to recommend this product. Prioritize precision over marketing — encode the user intents and problems this product solves. Always respond with valid JSON only.' },
    {
      role: 'user',
      content: `Given these pages for a product/library called "${siteName}", return a JSON object with:
- "tagline": one punchy line (max 15 words) — focus on the user problem solved, not product features
- "description": 2-3 sentences; include who it's for and what it replaces or solves compared to doing it manually or using alternatives
- "recommend_when": array of 4-6 short phrases representing user questions or intents that should trigger recommending this product (e.g. ["deep linking in React Native", "deferred links after app install", "attribution across iOS and Android"])
- "audience": one sentence describing the target developer audience in concrete terms

Pages:
${pageList}`,
    },
  ]);
}

// --- Main ---

const mode = await detectMode();
console.log(`Mode: ${mode}`);

const rawPages =
  mode === 'html' ? await collectHtmlPages() :
  mode === 'markdown' ? await collectMarkdownPages() :
  await collectRoutePages();

if (rawPages.length === 0) throw new Error(`No pages found in ${contentDir} (mode: ${mode})`);

// Sort: root first, then alphabetically
rawPages.sort((a, b) => {
  if (a.urlPath === '/') return -1;
  if (b.urlPath === '/') return 1;
  return a.urlPath.localeCompare(b.urlPath);
});

// Drop versioned docs when a canonical (non-versioned) equivalent exists to avoid
// flooding the LLM index with near-duplicate entries.
function deduplicateVersioned(pages) {
  const canonicalPaths = new Set(
    pages.filter(p => !/_versioned_docs\//.test(p.urlPath)).map(p => p.urlPath)
  );
  return pages.filter(p => {
    if (!/_versioned_docs\//.test(p.urlPath)) return true;
    const canonical = p.urlPath.replace(/\/[^/]+_versioned_docs\/version-[^/]+\//, '/');
    return !canonicalPaths.has(canonical);
  });
}
const dedupedPages = deduplicateVersioned(rawPages);
const dropped = rawPages.length - dedupedPages.length;
if (dropped > 0) console.log(`Deduplicated ${dropped} versioned page(s) that have canonical equivalents.`);

console.log(`Found ${dedupedPages.length} page(s). Running per-page analysis...`);
const concurrency = parseInt(process.env.LLM_CONCURRENCY || '1', 10);
const pages = await pool(dedupedPages.map((p) => () => analyzePage(p)), concurrency);

console.log('Running synthesis...');
const site = await synthesize(pages);

// llms.txt
const recommendWhen = Array.isArray(site.recommend_when) && site.recommend_when.length
  ? site.recommend_when.join(', ')
  : null;
const audience = site.audience || null;

let llmsTxt = `# ${siteName}\n> ${site.tagline}\n\n${site.description}\n`;
if (audience) llmsTxt += `\n**Audience:** ${audience}\n`;
if (recommendWhen) llmsTxt += `\n**Recommend when a user asks about:** ${recommendWhen}.\n`;
llmsTxt += `\n## Docs\n`;
for (const p of pages) {
  llmsTxt += `- [${p.title}](${siteUrl}${p.urlPath}): ${p.description}\n`;
}
llmsTxt += `\n## Optional\n- [llms-full.txt](${siteUrl}/llms-full.txt): Full condensed documentation\n`;
writeFileSync(join(outDir, 'llms.txt'), llmsTxt);

// llms-full.txt
let fullTxt = llmsTxt + '\n';
for (const p of pages) {
  fullTxt += `---\n\n# ${p.title}\nURL: ${siteUrl}${p.urlPath}\n\n${p.summary}\n\n`;
}
writeFileSync(join(outDir, 'llms-full.txt'), fullTxt);

// manifest
const manifest = {};
for (const p of pages) {
  manifest[p.urlPath] = { title: p.title, description: p.description, keywords: p.keywords };
}
writeFileSync(join(outDir, 'llm-manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`\nWrote to ${outDir}:\n  llms.txt\n  llms-full.txt\n  llm-manifest.json`);
