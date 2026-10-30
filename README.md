# TL — Tools Library

A collection of free, open-source developer tools that run **entirely in your
browser**. No uploads, no accounts, no tracking.

Live site: **<https://shailesh-04.github.io/tl/>**

## Tools

| Tool | What it does |
| --- | --- |
| [JSON Converter & Data Filter](./json-converter/) | JSON → CSV, XLSX, TSV, XML, or reshaped JSON, with nested-field selection and AND/OR filters |
| [JSON Formatter & Validator](./json-formatter/) | Beautify or minify JSON, with syntax errors reported by position |
| [XLSX to JSON](./to-json/) | Parse `.xlsx` / `.xls` workbooks into JSON |
| [CSV to JSON](./csv-to-json/) | Parse CSV text or files into an array of JSON objects |
| [Base64 Encoder & Decoder](./base64-encoder-decoder/) | Encode and decode Base64 with full UTF-8 support |
| [Regex Tester](./regex-tester/) | Live match highlighting, capture groups, flags, cheat sheet |
| [UUID Generator](./uuid-generator/) | Cryptographically random UUID v4, single or bulk |
| [Markdown Previewer](./markdown-previewer/) | Split-pane live Markdown rendering |
| [Image Optimizer](./image-optimizer/) | Compress and resize JPEG, PNG, WebP with before/after comparison |
| [Video Converter](./video-converter/) | FFmpeg-in-WebAssembly batch conversion to MP4, WebM, MOV, MKV, AVI, GIF, MP3 |

[Browse them all](./tools-hub/) on the dashboard.

## Tests

The JSON conversion and filtering helpers are dependency-free and covered by
Node's built-in test runner:

```sh
node --test json-converter/tests/converter.test.js
```

## Local preview

```sh
python -m http.server 8765
```

Then open <http://localhost:8765/>.

## SEO and discoverability

Search and AI-crawler metadata lives alongside the pages:

- `sitemap.xml` — all 14 URLs with `lastmod`, `changefreq`, and image entries.
- `robots.txt` — explicitly allows search engines and AI crawlers (GPTBot,
  ClaudeBot, PerplexityBot, Google-Extended, and others).
- `llms.txt` — a plain-text map of the site for large language models.
- `site.webmanifest` — PWA metadata and app shortcuts.
- `404.html` — branded not-found page linking every tool.

Each tool page carries a unique title and meta description, a canonical URL,
Open Graph and Twitter Card tags, and JSON-LD for `SoftwareApplication`,
`BreadcrumbList`, `FAQPage`, and `HowTo`. The homepage additionally publishes
`WebSite`, `Organization`, `ItemList`, and `FAQPage`.

When adding a new tool, add it to `sitemap.xml`, `llms.txt`, the tools-hub grid,
and the homepage `ItemList` schema so it stays discoverable.

## Licence

MIT — see [LICENSE](./LICENSE).
