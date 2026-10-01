'use strict';

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const path = require('path');
const fs = require('fs');

const { FORMATS, QUALITY } = require('./formats');
const { buildOutputPath, formatBytes, formatTime, c, progressBar } = require('./utils');

// Point fluent-ffmpeg at the bundled binaries
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/**
 * Probe a video file and return its metadata.
 * @param {string} filePath
 * @returns {Promise<object>} ffprobe metadata
 */
function probe(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) reject(err);
      else resolve(meta);
    });
  });
}

/**
 * Build ffmpeg options for a given job.
 * @param {string} fmt      - output format key
 * @param {object} quality  - quality preset object
 * @param {object} opts     - { height, noAudio }
 * @param {object} probeData - ffprobe streams/format
 */
function buildFfmpegOptions(fmt, quality, opts, probeData) {
  const videoStream = (probeData.streams || []).find(s => s.codec_type === 'video');
  const audioStream = (probeData.streams || []).find(s => s.codec_type === 'audio');
  const withAudio = !!audioStream && !opts.noAudio && fmt !== 'gif';

  const ffArgs = [];

  // ── MP3 (audio-only extract) ──────────────────────────────────────
  if (fmt === 'mp3') {
    if (!audioStream) throw new Error('This file has no audio track.');
    return {
      outputOptions: ['-map 0:a:0', '-vn', '-c:a libmp3lame', '-b:a ' + quality.mp3],
      videoFilters: null,
      noVideo: true,
    };
  }

  if (!videoStream) throw new Error('No video stream found in this file.');

  // ── GIF ──────────────────────────────────────────────────────────
  if (fmt === 'gif') {
    const scaleW = opts.height ? '-2:min(' + opts.height + '\\,ih)' : 'min(640\\,iw):-2';
    const vf = [
      'fps=' + quality.gifFps,
      'scale=' + scaleW + ':flags=lanczos',
      'setsar=1',
      'split[s0][s1]',
      '[s0]palettegen=stats_mode=diff[p]',
      '[s1][p]paletteuse=dither=bayer:bayer_scale=5',
    ].join(',');
    return {
      outputOptions: ['-map 0:v:0', '-an', '-loop 0'],
      videoFilters: vf,
      noVideo: false,
    };
  }

  // ── Scale filter ─────────────────────────────────────────────────
  let scaleFilter;
  if (!opts.height) {
    scaleFilter = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1';
  } else {
    scaleFilter = "scale=-2:trunc(min(" + opts.height + "\\,ih)/2)*2,setsar=1";
  }

  // ── Video codec ───────────────────────────────────────────────────
  const outOpts = ['-map 0:v:0'];
  if (withAudio) outOpts.push('-map 0:a:0');

  if (fmt === 'webm') {
    outOpts.push(
      '-c:v libvpx',
      '-deadline realtime',
      '-cpu-used 8',
      '-crf ' + quality.vpxCrf,
      '-b:v ' + quality.vpxRate,
    );
    outOpts.push(...(withAudio ? ['-c:a libvorbis', '-b:a ' + quality.abr] : ['-an']));
  } else if (fmt === 'avi') {
    outOpts.push('-c:v mpeg4', '-q:v ' + quality.q, '-tag:v XVID');
    outOpts.push(...(withAudio ? ['-c:a libmp3lame', '-b:a ' + quality.abr] : ['-an']));
  } else {
    // mp4 / mov / mkv  →  H.264
    outOpts.push('-c:v libx264', '-preset veryfast', '-crf ' + quality.crf, '-pix_fmt yuv420p');
    outOpts.push(...(withAudio ? ['-c:a aac', '-b:a ' + quality.abr] : ['-an']));
    if (fmt === 'mp4' || fmt === 'mov') outOpts.push('-movflags +faststart');
  }

  return { outputOptions: outOpts, videoFilters: scaleFilter, noVideo: false };
}

/**
 * Convert a single file.
 * @param {string} inputPath  - absolute path to input file
 * @param {object} opts       - { format, quality, height, noAudio, outDir }
 * @returns {Promise<{ outputPath, inputSize, outputSize, duration }>}
 */
function convertFile(inputPath, opts) {
  return new Promise(async (resolve, reject) => {
    const fmt = opts.format || 'mp4';
    const qualKey = opts.quality || 'medium';
    const quality = QUALITY[qualKey];

    if (!FORMATS[fmt]) return reject(new Error('Unknown format: ' + fmt));
    if (!quality) return reject(new Error('Unknown quality: ' + qualKey));
    if (!fs.existsSync(inputPath)) return reject(new Error('File not found: ' + inputPath));

    let probeData;
    try { probeData = await probe(inputPath); }
    catch (err) { return reject(new Error('Cannot read file: ' + err.message)); }

    let ffOpts;
    try { ffOpts = buildFfmpegOptions(fmt, quality, opts, probeData); }
    catch (err) { return reject(err); }

    const outputPath = buildOutputPath(inputPath, FORMATS[fmt].ext, opts.outDir);
    const inputSize = fs.statSync(inputPath).size;
    const totalSec = probeData.format && probeData.format.duration
      ? parseFloat(probeData.format.duration)
      : 0;
    const startTime = Date.now();

    // Print progress on the same line
    let lastPct = -1;
    process.stdout.write('  ' + c('cyan', progressBar(0)) + '\r');

    const cmd = ffmpeg(inputPath)
      .outputOptions('-y')
      .outputOptions(ffOpts.outputOptions)
      .output(outputPath)
      .on('progress', function (info) {
        let pct = 0;
        if (totalSec && info.timemark) {
          const parts = info.timemark.split(':');
          const secs = (+parts[0]) * 3600 + (+parts[1]) * 60 + parseFloat(parts[2]);
          pct = Math.min(99, Math.max(0, secs / totalSec * 100));
        } else if (info.percent) {
          pct = Math.min(99, info.percent);
        }
        if (Math.floor(pct) !== lastPct) {
          lastPct = Math.floor(pct);
          const speed = info.currentFps ? '  ' + info.currentFps + ' fps' : '';
          process.stdout.write('  ' + c('cyan', progressBar(pct)) + speed + '      \r');
        }
      })
      .on('end', function () {
        process.stdout.write('  ' + c('green', progressBar(100)) + '      \n');
        const outputSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        resolve({ outputPath, inputSize, outputSize, elapsed });
      })
      .on('error', function (err) {
        process.stdout.write('\n');
        reject(new Error(err.message));
      });

    if (ffOpts.videoFilters && !ffOpts.noVideo) {
      cmd.videoFilters(ffOpts.videoFilters);
    }

    cmd.run();
  });
}

module.exports = { probe, convertFile };
