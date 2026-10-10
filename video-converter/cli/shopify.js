#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const crypto = require('crypto');
const { convertFile } = require('./lib/converter');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) throw new Error('Invalid .env entry on line ' + (index + 1) + '.');
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
      if (match[2].trim().startsWith('"')) {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const DEFAULT_OUTPUT = 'E:\\shopify-video-work';
const READY_TIMEOUT_MS = 120000;
const READY_POLL_MS = 5000;

function printHelp() {
  console.log(`
Shopify Product Video Resizer

Usage:
  node shopify.js <sku> [quality] [format] [options]
  node shopify.js (--handle <handle> | --sku <sku> | --title <title>) [options]

Required environment:
  SHOPIFY_STORE_DOMAIN     Store domain, e.g. example.myshopify.com
  SHOPIFY_ACCESS_TOKEN     Shopify Admin API access token

Setup:
  Copy .env.example to .env and set your store domain and access token.

Options:
  --handle <handle>        Find a product by its exact handle
  --sku <sku>              Find a product by an exact variant SKU
  --title <title>          Find a product by its exact title
  --format <format>        Replacement video format: mp4 (default: mp4)
  --out <directory>        Output directory (default: ${DEFAULT_OUTPUT})
  --resolution <height>    Maximum output height in pixels (default: 1080)
  --quality <preset>       FFmpeg quality: high, medium, or low (default: medium)
  --keep-original          Upload resized videos but keep the original Shopify videos
  --help                   Show this help

Example:
  node shopify.js END5003B medium mp4
  node shopify.js --sku ABC-123 --resolution 720
`);
}

function parseArgs(args) {
  const options = {
    outDir: DEFAULT_OUTPUT,
    resolution: 1080,
    quality: 'medium',
    format: 'mp4',
    keepOriginal: false,
    help: false,
  };
  const selectors = [];
  const positionals = [];
  const valueOptions = new Set(['--handle', '--sku', '--title', '--out', '--resolution', '--quality', '--format']);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--keep-original') {
      options.keepOriginal = true;
      continue;
    }

    const equalAt = arg.indexOf('=');
    const key = equalAt === -1 ? arg : arg.slice(0, equalAt);
    if (!valueOptions.has(key)) {
      if (arg.startsWith('-')) throw new Error('Unknown option: ' + arg);
      positionals.push(arg);
      continue;
    }
    const value = equalAt === -1 ? args[++i] : arg.slice(equalAt + 1);
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + key);

    if (key === '--handle' || key === '--sku' || key === '--title') {
      selectors.push({ type: key.slice(2), value });
    } else if (key === '--out') {
      options.outDir = path.resolve(value);
    } else if (key === '--resolution') {
      options.resolution = Number(value);
      if (!Number.isInteger(options.resolution) || options.resolution < 1) {
        throw new Error('--resolution must be a positive whole number.');
      }
    } else if (key === '--quality') {
      options.quality = value.toLowerCase();
      if (!['high', 'medium', 'low'].includes(options.quality)) {
        throw new Error('--quality must be high, medium, or low.');
      }
    } else if (key === '--format') {
      options.format = value.toLowerCase();
    }
  }

  if (positionals.length > 3) {
    throw new Error('Positional usage is: node shopify.js <sku> [quality] [format].');
  }
  if (positionals.length) {
    if (selectors.length) throw new Error('Use positional SKU or a named product selector, not both.');
    selectors.push({ type: 'sku', value: positionals[0] });
    if (positionals[1] !== undefined) {
      options.quality = positionals[1].toLowerCase();
      if (!['high', 'medium', 'low'].includes(options.quality)) {
        throw new Error('Quality must be high, medium, or low.');
      }
    }
    if (positionals[2] !== undefined) options.format = positionals[2].toLowerCase();
  }
  if (options.format !== 'mp4') {
    throw new Error('Shopify video replacements currently support only mp4 format.');
  }
  if (!options.help && selectors.length !== 1) {
    throw new Error('Provide exactly one product selector: --handle, --sku, or --title.');
  }
  options.selector = selectors[0];
  return options;
}

function getShopifyConfig() {
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
  const rawDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!rawDomain) throw new Error('Set SHOPIFY_STORE_DOMAIN to your Shopify store domain.');
  if (!accessToken) throw new Error('Set SHOPIFY_ACCESS_TOKEN to a Shopify Admin API access token.');

  const domain = rawDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!domain || domain.includes('/') || /\s/.test(domain)) {
    throw new Error('SHOPIFY_STORE_DOMAIN must be a host name, such as example.myshopify.com.');
  }
  return {
    domain,
    accessToken,
    endpoint: 'https://' + domain + '/admin/api/' + apiVersion + '/graphql.json',
  };
}

async function graphql(config, query, variables) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && body.errors
      ? JSON.stringify(body.errors)
      : response.statusText;
    throw new Error('Shopify API request failed (' + response.status + '): ' + detail);
  }
  if (!body) throw new Error('Shopify API returned an invalid JSON response.');
  if (body.errors && body.errors.length) {
    throw new Error('Shopify GraphQL error: ' + body.errors.map(error => error.message).join('; '));
  }
  return body.data;
}

function searchTerm(value) {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

async function findProduct(config, selector) {
  const searchField = selector.type === 'handle' ? 'handle'
    : selector.type === 'sku' ? 'sku' : 'title';
  const queryText = searchField + ':' + searchTerm(selector.value);
  const result = await graphql(config, `
    query FindShopifyProducts($query: String!) {
      products(first: 50, query: $query) {
        nodes {
          id
          title
          handle
          variants(first: 100) {
            nodes { id title sku }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  `, { query: queryText });

  let products = result.products.nodes;
  if (selector.type === 'sku') {
    const exactMatches = [];
    for (const product of products) {
      let variants = product.variants.nodes.slice();
      let matchingVariants = variants.filter(variant =>
        (variant.sku || '').toLowerCase() === selector.value.toLowerCase(),
      );
      let after = product.variants.pageInfo.endCursor;
      let hasNextPage = product.variants.pageInfo.hasNextPage;
      while (!matchingVariants.length && hasNextPage && after) {
        const page = await graphql(config, `
          query FindShopifyProductVariants($id: ID!, $after: String) {
            product(id: $id) {
              variants(first: 100, after: $after) {
                nodes { id title sku }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        `, { id: product.id, after });
        const connection = page.product.variants;
        variants.push(...connection.nodes);
        matchingVariants = connection.nodes.filter(variant =>
          (variant.sku || '').toLowerCase() === selector.value.toLowerCase(),
        );
        after = connection.pageInfo.endCursor;
        hasNextPage = connection.pageInfo.hasNextPage;
      }
      if (matchingVariants.length) {
        product.variants.nodes = variants;
        exactMatches.push(product);
      }
    }
    products = exactMatches;
  } else if (selector.type === 'handle') {
    products = products.filter(product =>
      product.handle.toLowerCase() === selector.value.toLowerCase(),
    );
  } else {
    products = products.filter(product =>
      product.title.toLowerCase() === selector.value.toLowerCase(),
    );
  }

  if (products.length !== 1) {
    throw new Error(products.length
      ? 'The selector matched more than one product. Use a unique handle or SKU.'
      : 'No product matched the exact ' + selector.type + ': ' + selector.value);
  }
  const product = products[0];

  return product;
}

async function getProductVideos(config, productId) {
  const videos = [];
  let after = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const result = await graphql(config, `
      query ProductVideos($id: ID!, $after: String) {
        product(id: $id) {
          media(first: 100, after: $after) {
            nodes {
              id
              mediaContentType
              status
              alt
              ... on Video {
                sources { url mimeType format }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `, { id: productId, after });
    const connection = result.product.media;
    videos.push(...connection.nodes.filter(media => media.mediaContentType === 'VIDEO'));
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }
  return videos;
}

function safeName(value) {
  return String(value || 'product')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100) || 'product';
}

function sourceExtension(source) {
  const byMime = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
  };
  if (source.mimeType && byMime[source.mimeType.toLowerCase()]) {
    return byMime[source.mimeType.toLowerCase()];
  }
  try {
    const ext = path.extname(new URL(source.url).pathname).slice(1).toLowerCase();
    if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return ext;
  } catch (_) {
    // Use the standard Shopify video extension when the source URL has no usable path.
  }
  return 'mp4';
}

async function downloadVideo(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Video download failed (HTTP ' + response.status + ').');
  if (!response.body) throw new Error('Video download returned an empty response body.');
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
}

function multipartField(boundary, name, value) {
  const safeNameValue = String(name).replace(/["\r\n]/g, '');
  return Buffer.from(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="' + safeNameValue + '"\r\n\r\n' +
    String(value) + '\r\n',
  );
}

function multipartFileHeader(boundary, filename, contentType) {
  const safeFilename = String(filename).replace(/["\r\n]/g, '');
  const safeType = String(contentType || 'application/octet-stream').replace(/[\r\n]/g, '');
  return Buffer.from(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="' + safeFilename + '"\r\n' +
    'Content-Type: ' + safeType + '\r\n\r\n',
  );
}

async function uploadToStagedTarget(target, localPath, filename) {
  const boundary = '----shopify-video-' + crypto.randomBytes(18).toString('hex');
  const fields = target.parameters.map(parameter =>
    multipartField(boundary, parameter.name, parameter.value),
  );
  const fileHeader = multipartFileHeader(boundary, filename, 'video/mp4');
  const fileFooter = Buffer.from('\r\n--' + boundary + '--\r\n');
  const fileSize = fs.statSync(localPath).size;
  const contentLength = fields.reduce((length, field) => length + field.length, 0) +
    fileHeader.length + fileSize + fileFooter.length;

  async function* body() {
    for (const field of fields) yield field;
    yield fileHeader;
    for await (const chunk of fs.createReadStream(localPath)) yield chunk;
    yield fileFooter;
  }

  const response = await fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': String(contentLength),
    },
    body: Readable.from(body()),
    duplex: 'half',
  });
  if (!response.ok) {
    throw new Error('Shopify staged video upload failed (HTTP ' + response.status + ').');
  }
}

async function stageVideo(config, filePath, filename) {
  const size = fs.statSync(filePath).size;
  const result = await graphql(config, `
    mutation StageShopifyVideo($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `, {
    input: [{
      resource: 'VIDEO',
      filename,
      mimeType: 'video/mp4',
      httpMethod: 'POST',
      fileSize: String(size),
    }],
  });
  const payload = result.stagedUploadsCreate;
  if (payload.userErrors.length) {
    throw new Error('Could not prepare Shopify video upload: ' +
      payload.userErrors.map(error => error.message).join('; '));
  }
  const target = payload.stagedTargets[0];
  if (!target) throw new Error('Shopify did not return a staged upload target.');
  await uploadToStagedTarget(target, filePath, filename);
  return target.resourceUrl;
}

async function addVideoToProduct(config, productId, resourceUrl, alt) {
  const result = await graphql(config, `
    mutation AddShopifyProductVideo($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) {
        product { id }
        userErrors { field message }
      }
    }
  `, {
    product: { id: productId },
    media: [{ mediaContentType: 'VIDEO', originalSource: resourceUrl, alt }],
  });
  const payload = result.productUpdate;
  if (payload.userErrors.length) {
    throw new Error('Shopify could not add the resized video: ' +
      payload.userErrors.map(error => error.message).join('; '));
  }
  if (!payload.product) throw new Error('Shopify did not confirm the product video update.');
}

async function getNewestAddedVideo(config, productId, previousIds) {
  const result = await graphql(config, `
    query LatestProductVideos($id: ID!) {
      product(id: $id) {
        media(first: 100, reverse: true) {
          nodes {
            id
            mediaContentType
            status
            ... on Video { sources { url mimeType format } }
          }
        }
      }
    }
  `, { id: productId });
  return result.product.media.nodes.find(media =>
    media.mediaContentType === 'VIDEO' && !previousIds.has(media.id),
  );
}

async function waitUntilVideoReady(config, mediaId) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await graphql(config, `
      query ShopifyVideoStatus($id: ID!) {
        node(id: $id) {
          ... on Video { id status }
        }
      }
    `, { id: mediaId });
    const node = result.node;
    if (!node) throw new Error('The new Shopify video could not be found.');
    if (node.status === 'READY') return node.status;
    if (node.status === 'FAILED') throw new Error('Shopify reported that the new video processing failed.');
    await new Promise(resolve => setTimeout(resolve, READY_POLL_MS));
  }
  return 'PROCESSING';
}

async function deleteOriginalVideo(config, productId, mediaId) {
  const result = await graphql(config, `
    mutation DeleteShopifyProductVideo($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        userErrors { field message }
      }
    }
  `, { productId, mediaIds: [mediaId] });
  const payload = result.productDeleteMedia;
  if (payload.userErrors.length) {
    throw new Error('The replacement is ready, but the original video could not be removed: ' +
      payload.userErrors.map(error => error.message).join('; '));
  }
}

function writeReport(reportPath, report) {
  const tempPath = reportPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(tempPath, reportPath);
}

async function processVideo(config, product, video, index, paths, options, report, reportPath, oldIds) {
  const entry = {
    originalMediaId: video.id,
    originalStatus: video.status,
    status: 'pending',
    downloadPath: null,
    resizedPath: null,
    replacementMediaId: null,
    replacementStatus: null,
    originalRemoved: false,
    issue: null,
  };
  report.videos.push(entry);
  const videoLabel = 'video-' + String(index + 1).padStart(2, '0') + '-' + safeName(video.id.split('/').pop());

  try {
    const source = (video.sources || []).find(item => item.url);
    if (!source) throw new Error('Shopify did not provide a downloadable video source.');
    const originalPath = path.join(paths.downloads, videoLabel + '.' + sourceExtension(source));
    entry.downloadPath = originalPath;
    entry.status = 'downloading';
    writeReport(reportPath, report);
    await downloadVideo(source.url, originalPath);
    entry.status = 'downloaded';
    writeReport(reportPath, report);

    entry.status = 'resizing';
    writeReport(reportPath, report);
    const converted = await convertFile(originalPath, {
      format: options.format,
      quality: options.quality,
      height: options.resolution,
      noAudio: false,
      outDir: paths.resized,
    });
    entry.resizedPath = converted.outputPath;
    entry.status = 'resized';
    writeReport(reportPath, report);

    const uploadName = path.basename(converted.outputPath);
    entry.status = 'uploading';
    writeReport(reportPath, report);
    const resourceUrl = await stageVideo(config, converted.outputPath, uploadName);
    await addVideoToProduct(config, product.id, resourceUrl, video.alt || uploadName);
    entry.status = 'processing-on-shopify';
    writeReport(reportPath, report);

    const replacement = await getNewestAddedVideo(config, product.id, oldIds);
    if (!replacement) {
      throw new Error('Shopify accepted the upload but the new product video could not be located; original kept.');
    }
    entry.replacementMediaId = replacement.id;
    oldIds.add(replacement.id);
    entry.replacementStatus = await waitUntilVideoReady(config, replacement.id);

    if (entry.replacementStatus === 'READY' && !options.keepOriginal) {
      await deleteOriginalVideo(config, product.id, video.id);
      entry.originalRemoved = true;
    }
    entry.status = entry.replacementStatus === 'READY'
      ? (entry.originalRemoved || options.keepOriginal ? 'updated' : 'uploaded-original-kept')
      : 'uploaded-processing';
    if (entry.status === 'uploaded-processing') {
      const message = 'Replacement is still processing on Shopify; the original video was kept.';
      entry.issue = message;
      report.issues.push({ videoMediaId: video.id, message });
    }
  } catch (error) {
    entry.status = 'failed';
    entry.issue = error.message;
    report.issues.push({
      videoMediaId: video.id,
      message: error.message,
    });
  }
  writeReport(reportPath, report);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const config = getShopifyConfig();
  const runId = new Date().toISOString().replace(/[:.]/g, '-') +
    '-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  const runRoot = path.join(options.outDir, 'runs', runId);
  fs.mkdirSync(runRoot, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    shop: config.domain,
    apiVersion: process.env.SHOPIFY_API_VERSION,
    selector: options.selector,
    options: {
      resolution: options.resolution,
      quality: options.quality,
      format: options.format,
      keepOriginal: options.keepOriginal,
    },
    product: null,
    paths: { runDirectory: runRoot },
    videos: [],
    issues: [],
    status: 'running',
  };
  let reportPath = path.join(runRoot, 'product-details.json');

  try {
    writeReport(reportPath, report);
    const product = await findProduct(config, options.selector);
    const productRoot = path.join(options.outDir, safeName(product.handle));
    const runProductRoot = path.join(productRoot, 'runs', runId);
    const paths = {
      productDirectory: productRoot,
      runDirectory: runProductRoot,
      downloads: path.join(runProductRoot, 'downloaded'),
      resized: path.join(runProductRoot, 'resized'),
    };
    for (const directory of [paths.downloads, paths.resized]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    report.product = {
      id: product.id,
      handle: product.handle,
      title: product.title,
      variants: product.variants.nodes,
    };
    report.paths = paths;
    const initialReportPath = reportPath;
    reportPath = path.join(productRoot, 'product-details.json');
    writeReport(reportPath, report);
    fs.unlinkSync(initialReportPath);
    fs.rmdirSync(runRoot);

    console.log('Product: ' + product.title + ' (' + product.handle + ')');
    console.log('Downloads: ' + paths.downloads);
    console.log('Resized:   ' + paths.resized);
    console.log('Report:    ' + reportPath);

    const videos = await getProductVideos(config, product.id);
    report.videoCount = videos.length;
    if (!videos.length) {
      report.status = 'no-videos';
      report.issues.push({ message: 'The product has no video media.' });
    } else {
      const oldIds = new Set(videos.map(video => video.id));
      for (let i = 0; i < videos.length; i++) {
        console.log('[' + (i + 1) + '/' + videos.length + '] ' + videos[i].id);
        await processVideo(config, product, videos[i], i, paths, options, report, reportPath, oldIds);
        const current = report.videos[report.videos.length - 1];
        console.log('  ' + current.status + (current.issue ? ': ' + current.issue : ''));
      }
      report.status = report.issues.length ? 'completed-with-issues' : 'completed';
    }
  } catch (error) {
    report.status = 'failed';
    report.issues.push({ message: error.message });
    console.error('Report saved: ' + reportPath);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    writeReport(reportPath, report);
  }

  console.log('Report saved: ' + reportPath);
  if (report.issues.length) {
    console.error(report.issues.length + ' issue(s) recorded. See product-details.json.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Shopify video job failed: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, findProduct, getProductVideos };
