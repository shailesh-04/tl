'use strict';

/**
 * Supported output formats and their metadata.
 */
const FORMATS = {
  mp4:  { ext: 'mp4',  desc: 'H.264 + AAC. Plays everywhere.' },
  webm: { ext: 'webm', desc: 'VP8 + Vorbis. Good for the web.' },
  mov:  { ext: 'mov',  desc: 'H.264 + AAC in a QuickTime container.' },
  mkv:  { ext: 'mkv',  desc: 'H.264 + AAC in Matroska.' },
  avi:  { ext: 'avi',  desc: 'MPEG-4 Part 2 + MP3 for older players.' },
  gif:  { ext: 'gif',  desc: 'Animated GIF, no sound.' },
  mp3:  { ext: 'mp3',  desc: 'Extract the audio track as MP3.' },
};

/**
 * Quality presets.
 * crf: H.264/HEVC quality (lower = better)
 * vpxCrf / vpxRate: VP8 quality
 * abr: audio bitrate
 * gifFps: GIF frame rate
 */
const QUALITY = {
  high:    { crf: 20, vpxCrf: 10, vpxRate: '4M',   abr: '192k', mp3: '320k', gifFps: 15, q: 3 },
  medium:  { crf: 26, vpxCrf: 20, vpxRate: '2M',   abr: '128k', mp3: '192k', gifFps: 12, q: 5 },
  low:     { crf: 32, vpxCrf: 32, vpxRate: '800k',  abr: '96k',  mp3: '128k', gifFps: 10, q: 9 },
};

/** Resolution labels for display. */
const RESOLUTION_LABELS = {
  0:    'Original',
  2160: '4K (2160p)',
  1440: '1440p',
  1080: '1080p',
  720:  '720p',
  480:  '480p',
  360:  '360p',
  240:  '240p',
};

module.exports = { FORMATS, QUALITY, RESOLUTION_LABELS };
