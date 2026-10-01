    # Video Converter CLI

Terminal-only video converter powered by **FFmpeg** (bundled — no system install needed).
No browser. No HTTP server. Pure file system in → file system out.

---

## File Structure

```
video-converter/
├── index.html          ← Web version (untouched)
├── vendor/ffmpeg/      ← WASM vendor files (untouched)
└── cli/                ← Node.js CLI project (this folder)
    ├── index.js        ← Entry point  →  node index.js
    ├── package.json
    ├── lib/
    │   ├── converter.js    ← FFmpeg conversion logic
    │   ├── formats.js      ← Format & quality definitions
    │   └── utils.js        ← Helpers (colours, progress bar, …)
    └── README.md
```

---

## Setup (one time)

```bash
cd video-converter/cli
npm install
```

---

## Usage

```bash
node index.js <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `convert <file(s)>` | Convert one or more video files |
| `info    <file(s)>` | Show video metadata |
| `formats`           | List all supported formats & quality presets |
| `--help`            | Show help |

### Convert Options

| Flag | Default | Description |
|------|---------|-------------|
| `-f, --format` | `mp4` | Output format: `mp4` `webm` `mov` `mkv` `avi` `gif` `mp3` |
| `-q, --quality` | `medium` | Quality preset: `high` `medium` `low` |
| `-r, --resolution` | original | Max height in pixels e.g. `1080` `720` `480` |
| `-o, --out` | same as input | Output directory |
| `--no-audio` | — | Strip audio from output |

---

## Examples

```bash
# Basic convert to MP4 (default)
node index.js convert myvideo.mp4

# Convert to WebM, high quality
node index.js convert myvideo.mp4 -f webm -q high

# Extract audio as MP3
node index.js convert myvideo.mp4 -f mp3

# Make an animated GIF capped at 480p
node index.js convert myvideo.mp4 -f gif -r 480

# Convert to 1080p MP4, save to ./output/
node index.js convert myvideo.mp4 -f mp4 -q high -r 1080 -o ./output

# Batch convert all MP4s in a folder to WebM
node index.js convert "videos/*.mp4" -f webm

# Show metadata of a file
node index.js info myvideo.mp4

# List all formats
node index.js formats
```

---

## Supported Formats

| Format | Description |
|--------|-------------|
| `mp4`  | H.264 + AAC – plays everywhere |
| `webm` | VP8 + Vorbis – great for the web |
| `mov`  | H.264 + AAC in QuickTime container |
| `mkv`  | H.264 + AAC in Matroska |
| `avi`  | MPEG-4 Part 2 + MP3 |
| `gif`  | Animated GIF (no audio) |
| `mp3`  | Audio-only extract |

## Quality Presets

| Preset | CRF | Audio |
|--------|-----|-------|
| `high`   | 20 | 192k |
| `medium` | 26 | 128k |
| `low`    | 32 | 96k  |
