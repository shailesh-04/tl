'use strict';

const path = require('path');
const fs   = require('fs');

/** Strip extension from a filename. */
function baseName(filePath) {
  return path.basename(filePath, path.extname(filePath)) || 'video';
}

/** Human-readable file size. */
function formatBytes(bytes) {
  if (bytes < 1024)           return bytes + ' B';
  if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3)      return (bytes / 1024 ** 2).toFixed(2) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

/** Human-readable duration (seconds → H:MM:SS). */
function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '0:00';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

/**
 * Build the output file path.
 * Places the converted file in outDir (default: same folder as input).
 */
function buildOutputPath(inputPath, ext, outDir) {
  const dir  = outDir || path.dirname(inputPath);
  const name = baseName(inputPath);
  let dest   = path.join(dir, name + '.' + ext);

  // Only avoid collision if input file and output file resolve to the exact same path
  if (path.resolve(inputPath).toLowerCase() === path.resolve(dest).toLowerCase()) {
    dest = path.join(dir, name + '_converted.' + ext);
  }
  return dest;
}

/** Simple ANSI colour helpers (no dependencies). */
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
};

function c(color, text) { return C[color] + text + C.reset; }

/** Draw an ASCII progress bar. */
function progressBar(pct, width) {
  width = width || 30;
  const filled = Math.round(pct / 100 * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + '] ' + String(Math.round(pct)).padStart(3) + '%';
}

module.exports = { baseName, formatBytes, formatTime, buildOutputPath, C, c, progressBar };
