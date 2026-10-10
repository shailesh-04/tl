# Video Converter CLI

A Node.js command-line tool for converting local video files with bundled FFmpeg, plus a Shopify workflow that finds one product, downloads its videos, resizes them to MP4, and uploads replacements.

The Shopify command uses Shopify's Admin GraphQL API over HTTPS. The existing local `convert`, `info`, and `formats` commands continue to work independently and do not need Shopify credentials.

## Requirements

- Node.js 18 or later (Node.js 20 or later recommended).
- npm.
- For Shopify operations: a Shopify store and an Admin API access token for an app with product read/write access.

## Install

From this directory:

```powershell
npm install
```

FFmpeg and FFprobe are provided by the project dependencies; a separate system installation is not normally required.

## Local video commands

Run the existing converter entry point:

```powershell
node .\index.js <command> [options]
```

| Command | Description |
| --- | --- |
| `convert <file(s)>` | Convert one or more video files. |
| `info <file(s)>` | Show metadata for one or more video files. |
| `formats` | List supported output formats and quality presets. |
| `--help` | Show command help. |

### Convert options

| Option | Default | Description |
| --- | --- | --- |
| `-f, --format <format>` | `mp4` | Output format: `mp4`, `webm`, `mov`, `mkv`, `avi`, `gif`, or `mp3`. |
| `-q, --quality <preset>` | `medium` | Quality preset: `high`, `medium`, or `low`. |
| `-r, --resolution <height>` | Original size | Maximum output height in pixels, for example `1080`, `720`, or `480`. |
| `-o, --out <directory>` | Same directory as input | Output directory. |
| `--no-audio` | Off | Remove audio from the output. |

### Local conversion examples

```powershell
# Convert a video to MP4
node .\index.js convert .\videos\input.mov

# Convert to high-quality WebM
node .\index.js convert .\videos\input.mp4 --format webm --quality high

# Resize to a maximum height of 720 pixels and save under .\output
node .\index.js convert .\videos\input.mp4 --resolution 720 --out .\output

# Convert every MP4 in a folder to WebM
node .\index.js convert ".\videos\*.mp4" --format webm

# Extract audio as MP3
node .\index.js convert .\videos\input.mp4 --format mp3

# Show file metadata or list formats
node .\index.js info .\videos\input.mp4
node .\index.js formats
```

## Shopify product video workflow

Run the separate Shopify entry point:

```powershell
node .\shopify.js <product selector> [options]
```

For the common SKU workflow, the SKU, quality, and output format can also be supplied positionally:

```powershell
node .\shopify.js <sku> [quality] [format]
```

The command requires exactly one product selector:

| Selector | Description |
| --- | --- |
| `--handle <handle>` | Match a product by its exact handle. |
| `--sku <sku>` | Match a product by an exact variant SKU. |
| `--title <title>` | Match a product by its exact title. |

Product lookup is exact; if a selector matches no product or more than one product, the command reports an error rather than choosing one arbitrarily.
The positional form treats the first argument as a SKU. Quality defaults to `medium`; the supported Shopify replacement format is currently `mp4`.

### Configure Shopify credentials

1. Create/install a Shopify app with the product read/write access it needs to find product media, add replacement media, and remove old media.
2. Copy the example environment file to `.env` in this CLI directory:

   ```powershell
   Copy-Item .\.env.example .\.env
   ```

3. Edit `.env` and set your store domain and Admin API access token:

   ```dotenv
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   SHOPIFY_ACCESS_TOKEN=shpat_your_admin_api_access_token
   SHOPIFY_API_VERSION=2025-10
   ```

Use the access token issued for your app and store. Do not share it or commit `.env`; `.env` is ignored by Git. The checked-in `.env.example` contains placeholders only. Environment variables already set in your shell take precedence over values in `.env`.

The API version is optional and defaults to `2025-10`. The store domain may be entered as a host name, such as `your-store.myshopify.com`.

### Shopify options

| Option | Default | Description |
| --- | --- | --- |
| `--handle <handle>` | — | Select a product by handle. Use exactly one of the three selectors. |
| `--sku <sku>` | — | Select a product by variant SKU. |
| `--title <title>` | — | Select a product by exact title. |
| `--format <format>` | `mp4` | Shopify replacement video format. Currently supports `mp4`. |
| `--out <directory>` | `E:\shopify-video-work` | Root folder for downloaded videos, resized videos, and product report. |
| `--resolution <height>` | `1080` | Maximum output video height in pixels. |
| `--quality <preset>` | `medium` | FFmpeg quality preset: `high`, `medium`, or `low`. |
| `--keep-original` | Off | Upload replacements but leave the original Shopify videos attached to the product. |
| `--help` | — | Show Shopify command help. |

### Shopify examples

Run from `video-converter\cli` in PowerShell after setting up `.env`:

```powershell
# Short form: SKU, quality, format
node .\shopify.js END5003B medium mp4

# Find a product by handle, download all its videos, resize to 1080p MP4,
# upload replacements, and remove originals after replacements are ready
node .\shopify.js --handle "summer-shirt"

# Find by variant SKU and resize to 720p
node .\shopify.js --sku "SHIRT-BLUE-M" --resolution 720

# Find by exact title, use higher quality, and keep original Shopify videos
node .\shopify.js --title "Blue Summer Shirt" --quality high --keep-original

# Save the run under another directory
node .\shopify.js --sku "SHIRT-BLUE-M" --out "D:\product-video-work"
```

### Shopify output and update behavior

By default, the files are organized under `E:\shopify-video-work`:

```text
E:\shopify-video-work\
└── <product-handle>\
    ├── product-details.json
    └── runs\
        └── <run-id>\
            ├── downloaded\    # Original Shopify video files
            └── resized\       # Resized MP4 files uploaded as replacements
```

`product-details.json` records the selected product details, run configuration, each original and replacement media ID, local file paths, per-video status, and any issues. A failed video is recorded and does not stop the remaining videos from being processed. The command exits with a non-zero status if the run has issues.

By default, each resized MP4 is attached to the product as a new Shopify video. The matching original is deleted only after Shopify reports that its replacement is `READY`. If processing is still underway, or the replacement fails, the original is kept and the report records the outcome. Use `--keep-original` to skip original deletion even when replacements are ready.

## Supported local output formats

| Format | Encoding |
| --- | --- |
| `mp4` | H.264 video and AAC audio |
| `webm` | VP8 video and Vorbis audio |
| `mov` | H.264 video and AAC audio in QuickTime |
| `mkv` | H.264 video and AAC audio in Matroska |
| `avi` | MPEG-4 Part 2 video and MP3 audio |
| `gif` | Animated GIF without audio |
| `mp3` | Audio-only extraction |

## Quality presets

| Preset | H.264 CRF | Audio bitrate |
| --- | ---: | ---: |
| `high` | 20 | 192 kb/s |
| `medium` | 26 | 128 kb/s |
| `low` | 32 | 96 kb/s |
