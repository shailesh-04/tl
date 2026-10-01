#!/usr/bin/env node
'use strict';

/**
 * video-converter CLI
 * ===================
 * Terminal-only video converter powered by FFmpeg.
 * No browser, no HTTP server – pure file system in, file system out.
 *
 * Usage:
 *   node index.js convert <file(s)> [options]
 *   node index.js info    <file(s)>
 *   node index.js formats
 *   node index.js --help
 */

const path  = require('path');
const fs    = require('fs');
const { glob } = require('glob');

const { FORMATS, QUALITY, RESOLUTION_LABELS } = require('./lib/formats');
const { probe, convertFile }                   = require('./lib/converter');
const { formatBytes, formatTime, c, C }        = require('./lib/utils');

// ─── Banner ──────────────────────────────────────────────────────────────────

function printBanner() {
  console.log('');
  console.log(c('cyan', C.bold + '  ╔══════════════════════════════════════╗'));
  console.log(c('cyan', '  ║') + c('white', C.bold + '     🎬  Video Converter CLI          ') + c('cyan', '  ║'));
  console.log(c('cyan', '  ║') + c('gray',  '     Terminal-only · Powered by FFmpeg') + c('cyan', ' ║'));
  console.log(c('cyan', C.bold + '  ╚══════════════════════════════════════╝'));
  console.log('');
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  printBanner();
  console.log(c('bold', '  USAGE'));
  console.log('    node index.js <command> [options]');
  console.log('');
  console.log(c('bold', '  COMMANDS'));
  console.log('    ' + c('green', 'convert') + '  <file(s)>   Convert one or more video files');
  console.log('    ' + c('green', 'info')    + '     <file(s)>   Show metadata of a video file');
  console.log('    ' + c('green', 'formats') + '              List supported formats');
  console.log('');
  console.log(c('bold', '  CONVERT OPTIONS'));
  console.log('    ' + c('yellow', '-f,  --format')     + '  <fmt>   Output format  [mp4|webm|mov|mkv|avi|gif|mp3]  default: mp4');
  console.log('    ' + c('yellow', '-q,  --quality')    + '  <q>     Quality preset [high|medium|low]               default: medium');
  console.log('    ' + c('yellow', '-r,  --resolution') + '  <h>     Max height in pixels [1080|720|480|...]         default: original');
  console.log('    ' + c('yellow', '-o,  --out')        + '  <dir>   Output directory                               default: same as input');
  console.log('    ' + c('yellow', '     --no-audio')   + '          Remove audio from output');
  console.log('');
  console.log(c('bold', '  EXAMPLES'));
  console.log('    node index.js convert video.mp4');
  console.log('    node index.js convert video.mp4 -f webm -q high');
  console.log('    node index.js convert video.mp4 -f mp3');
  console.log('    node index.js convert video.mp4 -f gif -r 480');
  console.log('    node index.js convert video.mp4 -f mp4 -q high -r 1080 -o ./output');
  console.log('    node index.js convert "videos/*.mp4" -f webm');
  console.log('    node index.js info    video.mp4');
  console.log('    node index.js formats');
  console.log('');
}

// ─── Argument parser (no external dep) ──────────────────────────────────────

function parseArgs(argv) {
  const args   = argv.slice(2);
  const cmd    = args[0];
  const files  = [];
  const opts   = {
    format:     'mp4',
    quality:    'medium',
    height:     0,
    noAudio:    false,
    outDir:     null,
  };
  let i = 1;
  while (i < args.length) {
    const a = args[i];
    if (a === '-f'  || a === '--format')     { opts.format   = args[++i];                     }
    else if (a === '-q' || a === '--quality'){ opts.quality  = args[++i];                     }
    else if (a === '-r' || a === '--resolution') { opts.height = parseInt(args[++i], 10) || 0; }
    else if (a === '-o' || a === '--out')    { opts.outDir   = path.resolve(args[++i]);        }
    else if (a === '--no-audio')             { opts.noAudio  = true;                           }
    else if (!a.startsWith('-'))             { files.push(a);                                  }
    i++;
  }
  return { cmd, files, opts };
}

// ─── Resolve glob patterns to real file paths ─────────────────────────────────

async function resolveFiles(patterns) {
  const results = [];
  for (const pat of patterns) {
    if (pat.includes('*') || pat.includes('?')) {
      // Glob requires forward slashes even on Windows
      const normalised = pat.replace(/\\/g, '/');
      const matches = await glob(normalised, { absolute: true, nocase: true });
      results.push(...matches);
    } else {
      results.push(path.resolve(pat));
    }
  }
  return [...new Set(results)]; // deduplicate
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdFormats() {
  printBanner();
  console.log(c('bold', '  Supported Formats\n'));
  const header = '  ' + 'Format'.padEnd(8) + 'Extension'.padEnd(12) + 'Description';
  console.log(c('gray', header));
  console.log(c('gray', '  ' + '─'.repeat(60)));
  for (const [key, f] of Object.entries(FORMATS)) {
    console.log('  ' + c('green', key.padEnd(8)) + ('.' + f.ext).padEnd(12) + c('gray', f.desc));
  }
  console.log('');
  console.log(c('bold', '  Quality Presets\n'));
  const qHeader = '  ' + 'Preset'.padEnd(10) + 'CRF'.padEnd(6) + 'Audio BR';
  console.log(c('gray', qHeader));
  console.log(c('gray', '  ' + '─'.repeat(30)));
  for (const [key, q] of Object.entries(QUALITY)) {
    console.log('  ' + c('yellow', key.padEnd(10)) + String(q.crf).padEnd(6) + q.abr);
  }
  console.log('');
  console.log(c('bold', '  Resolutions') + c('gray', '  (--resolution / -r)\n'));
  for (const [h, label] of Object.entries(RESOLUTION_LABELS)) {
    console.log('  ' + c('cyan', String(h).padEnd(6)) + label);
  }
  console.log('');
}

async function cmdInfo(files, opts) {
  printBanner();
  if (!files.length) { console.error(c('red', '  ✖  Provide at least one file.\n')); return; }
  const resolved = await resolveFiles(files);
  for (const fp of resolved) {
    console.log(c('bold', '  ── ' + path.basename(fp) + ' ──'));
    if (!fs.existsSync(fp)) {
      console.log(c('red', '  File not found: ' + fp + '\n'));
      continue;
    }
    try {
      const meta   = await probe(fp);
      const fmt    = meta.format;
      const vStream = (meta.streams || []).find(s => s.codec_type === 'video');
      const aStream = (meta.streams || []).find(s => s.codec_type === 'audio');
      const rows = [
        ['Path',      fp],
        ['Size',      formatBytes(fs.statSync(fp).size)],
        ['Duration',  fmt.duration ? formatTime(parseFloat(fmt.duration)) : 'N/A'],
        ['Container', fmt.format_long_name || fmt.format_name || 'N/A'],
        ['Bitrate',   fmt.bit_rate ? Math.round(fmt.bit_rate / 1000) + ' kb/s' : 'N/A'],
      ];
      if (vStream) {
        rows.push(['Video',    vStream.codec_name + ' ' + (vStream.width || '?') + 'x' + (vStream.height || '?') + ' @ ' + (vStream.r_frame_rate || 'N/A') + ' fps']);
      }
      if (aStream) {
        rows.push(['Audio',    aStream.codec_name + ' ' + (aStream.sample_rate || '?') + ' Hz, ' + (aStream.channels || '?') + 'ch']);
      }
      for (const [k, v] of rows) {
        console.log('  ' + c('cyan', (k + ':').padEnd(12)) + v);
      }
    } catch (err) {
      console.log(c('red', '  Error: ' + err.message));
    }
    console.log('');
  }
}

async function cmdConvert(files, opts) {
  printBanner();
  if (!files.length) {
    console.error(c('red', '  ✖  Provide at least one file to convert.\n'));
    printHelp();
    return;
  }

  // Validate options
  if (!FORMATS[opts.format]) {
    console.error(c('red', '  ✖  Unknown format: ' + opts.format));
    console.error('     Valid formats: ' + Object.keys(FORMATS).join(', ') + '\n');
    return;
  }
  if (!QUALITY[opts.quality]) {
    console.error(c('red', '  ✖  Unknown quality: ' + opts.quality));
    console.error('     Valid presets: ' + Object.keys(QUALITY).join(', ') + '\n');
    return;
  }

  const resolved = await resolveFiles(files);
  if (!resolved.length) {
    console.error(c('red', '  ✖  No files matched the pattern(s).\n'));
    return;
  }

  // Ensure output directory exists
  if (opts.outDir) {
    fs.mkdirSync(opts.outDir, { recursive: true });
  }

  // Print job summary
  console.log(c('bold', '  Job Summary'));
  console.log('  ' + c('gray', '─'.repeat(42)));
  console.log('  Files     : ' + c('white', String(resolved.length)));
  console.log('  Format    : ' + c('green', opts.format.toUpperCase()));
  console.log('  Quality   : ' + c('yellow', opts.quality));
  console.log('  Resolution: ' + c('cyan', opts.height ? opts.height + 'p max' : 'Original'));
  console.log('  Audio     : ' + c('cyan', opts.noAudio ? 'Removed' : 'Keep'));
  if (opts.outDir) console.log('  Output dir: ' + c('cyan', opts.outDir));
  console.log('  ' + c('gray', '─'.repeat(42)));
  console.log('');

  let ok = 0, failed = 0;

  for (let i = 0; i < resolved.length; i++) {
    const fp   = resolved[i];
    const name = path.basename(fp);
    const num  = '[' + (i + 1) + '/' + resolved.length + ']';

    console.log(c('bold', '  ' + num + ' ' + name));
    if (!fs.existsSync(fp)) {
      console.log(c('red', '  ✖  File not found.\n'));
      failed++;
      continue;
    }

    try {
      const result = await convertFile(fp, opts);
      const ratio  = result.inputSize ? (result.outputSize / result.inputSize * 100).toFixed(1) : '?';
      console.log('  ' + c('green', '✔  Done in ' + result.elapsed + 's'));
      console.log('  ' + c('gray', 'Output : ') + result.outputPath);
      console.log('  ' + c('gray', 'Size   : ') + formatBytes(result.inputSize) + ' → ' + c('cyan', formatBytes(result.outputSize)) + c('gray', ' (' + ratio + '%)'));
      ok++;
    } catch (err) {
      console.log('  ' + c('red', '✖  Error: ' + err.message));
      failed++;
    }
    console.log('');
  }

  // Final summary
  console.log('  ' + c('gray', '─'.repeat(42)));
  if (failed === 0) {
    console.log('  ' + c('green', C.bold + '✔  All ' + ok + ' file(s) converted successfully.'));
  } else {
    console.log('  ' + c('green', '✔  ' + ok + ' converted') + '  ' + c('red', '✖  ' + failed + ' failed'));
  }
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { cmd, files, opts } = parseArgs(process.argv);

  switch (cmd) {
    case 'convert':  await cmdConvert(files, opts); break;
    case 'info':     await cmdInfo(files, opts);    break;
    case 'formats':  await cmdFormats();            break;
    case '--help':
    case '-h':
    case 'help':
    case undefined:  printHelp();                   break;
    default:
      console.error(c('red', '\n  ✖  Unknown command: ' + cmd));
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(c('red', '\n  ✖  Fatal error: ' + err.message));
  process.exit(1);
});
