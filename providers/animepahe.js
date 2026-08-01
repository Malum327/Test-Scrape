const { fetchTmdbMetadata, searchSite, extractUrlsFromText, extractDetailLinks, makeAbsoluteUrl } = require('./shared');

const PROVIDER_NAME = 'AnimePahe';
const BASE_URL = 'https://animepahe.pw';
const SEARCH_PATHS = [
  '/search?search={q}',
  '/search?q={q}',
  '/anime?search={q}',
  '/anime?q={q}',
  '/watch?search={q}',
  '/api?m=search&q={q}'
];

function customSearchParser(html, context) {
  const text = String(html || '');
  const directUrls = extractUrlsFromText(text);
  const detailLinks = extractDetailLinks(text, context.baseUrl);
  const rawCandidates = [...directUrls, ...detailLinks];
  const valid = [];
  const seen = new Set();

  for (const value of rawCandidates) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (/m3u8|mp4|mpd|manifest/i.test(normalized)) {
      valid.push({ url: normalized, title: context.title });
    }
  }

  const apiPatternMatches = [...text.matchAll(/https?:\/\/[^\s"'<>]*?(?:api|anime|watch|episode|info)[^\s"'<>]*?(?:search|episode|anime|watch|info)[^\s"'<>]*/gi)];
  for (const match of apiPatternMatches) {
    const candidate = String(match[0] || '').trim();
    const resolved = makeAbsoluteUrl(context.baseUrl, candidate);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    if (/(?:api|anime|watch|episode)/i.test(resolved)) {
      valid.push({ url: resolved, title: context.title });
    }
  }

  return valid;
}

async function getStreams(item, type = 'tv', _season = 1, _episode = 1) {
  try {
    const rawQuery = item && (item.title || item.name || item.query || item.search || 'anime');
    const metadata = await fetchTmdbMetadata(rawQuery, type);
    const query = metadata && metadata.title ? metadata.title : rawQuery;
    const results = await searchSite({
      providerName: PROVIDER_NAME,
      baseUrl: BASE_URL,
      title: query,
      type,
      extraPaths: SEARCH_PATHS,
      parser: customSearchParser
    });
    return Array.isArray(results) ? results : [];
  } catch (error) {
    return [];
  }
}

const __provider = { getStreams };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = __provider;
}
if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = __provider.getStreams;
}
if (typeof global !== 'undefined') {
  global.getStreams = __provider.getStreams;
}
if (typeof self !== 'undefined') {
  self.getStreams = __provider.getStreams;
}
