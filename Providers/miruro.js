const { fetchTmdbMetadata, searchSite, parseSiteStreamUrls } = require('./shared');

const PROVIDER_NAME = 'Miruro';
const BASE_URL = 'https://www.miruro.tv';
const SEARCH_PATHS = [
  '/search?query={q}',
  '/api/search?query={q}',
  '/api/search?q={q}',
  '/anime?search={q}'
];

function customSearchParser(html, context) {
  return parseSiteStreamUrls(html, {
    baseUrl: context.baseUrl,
    title: context.title
  }).filter((entry) => /m3u8|mp4|mpd|manifest/i.test(entry.url));
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
