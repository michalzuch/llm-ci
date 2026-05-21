import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const distDir = resolve(process.env.DIST_DIR || 'dist');
const manifestDir = resolve(process.env.DIST_DIR || '.');
const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
const siteName = process.env.SITE_NAME || '';

if (!siteUrl) throw new Error('SITE_URL is required');
if (!siteName) throw new Error('SITE_NAME is required');

const manifestPath = join(manifestDir, 'llm-manifest.json');
let manifest = {};
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  console.warn(`Warning: could not read llm-manifest.json at ${manifestPath}. Falling back to HTML metadata.`);
}

function collectHtml(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...collectHtml(full));
    else if (entry.endsWith('.html')) results.push(full);
  }
  return results;
}

function fileToUrlPath(filePath) {
  const rel = relative(distDir, filePath).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel;
}

const files = collectHtml(distDir);
let count = 0;

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: siteName,
  url: siteUrl,
};

for (const file of files) {
  let html = readFileSync(file, 'utf8');
  if (html.includes('application/ld+json')) continue;

  const urlPath = fileToUrlPath(file);
  const isIndex = urlPath === '/';
  const entry = manifest[urlPath] || manifest[urlPath.replace(/\/$/, '')] || null;

  let description = entry?.description || null;
  if (!description) {
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    description = metaMatch?.[1] || null;
  }

  const schema = isIndex
    ? { ...websiteSchema, ...(description ? { description } : {}) }
    : {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: entry?.title || siteName,
        url: `${siteUrl}${urlPath}`,
        ...(description ? { description } : {}),
        ...(entry?.keywords?.length ? { keywords: entry.keywords.join(', ') } : {}),
        isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
      };

  const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
  const updated = html.replace('</head>', `${scriptTag}\n</head>`);

  if (updated !== html) {
    writeFileSync(file, updated);
    count++;
  }
}

console.log(`Injected JSON-LD into ${count} of ${files.length} HTML files in ${distDir}`);
