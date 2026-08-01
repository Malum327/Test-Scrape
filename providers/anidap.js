const { fetchTmdbMetadata, searchSite, extractUrlsFromText, extractDetailLinks, makeAbsoluteUrl } = require('./shared');

const PROVIDER_NAME = 'AniDap';
const BASE_URL = 'https://anidap.lol';
const SEARCH_PATHS = [
  '/?s={q}',
  '/search?q={q}',
  '/search?keyword={q}',
  '/search?search={q}',
  '/anime?search={q}',
  '/watch?search={q}',
  '/info?search={q}'
];

function customSearchParser(html, context) {
  const text = String(html || '');
  const directUrls = extractUrlsFromText(text);
  const detailLinks = extractDetailLinks(text, context.baseUrl);
  const watchLinks = detailLinks.filter((link) => /(?:\/watch\/|\/info\/|\/anime\/|\/movie\/|\/tv\/|play=true|embed)/i.test(link));
  const rawCandidates = [...directUrls, ...watchLinks];
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

  const explicitMatches = [...text.matchAll(/(?:https?:\/\/|\/)[^\s"'<>]*(?:watch|anime|episode|movie|tv)[^\s"'<>]*/gi)];
  for (const match of explicitMatches) {
    const target = String(match[0] || '').trim();
    const resolved = makeAbsoluteUrl(context.baseUrl, target);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    if (/(?:\/watch\/|\/anime\/|\/movie\/|\/tv\/|play=true|embed)/i.test(resolved)) {
      valid.push({ url: resolved, title: context.title });
    }
  }

  return valid;
}

async function getStreams(item, type = 'tv', season = 1, episode = 1) {
  try {
    const rawBase = item && (item.title || item.name || item.query || item.search || 'anime');
    const qualityHint = item && (item.quality || item.resolution || item.format || '');
    const languageHint = item && (item.language || item.audio || item.lang || '');
    let rawQuery = String(rawBase || '').trim() || 'anime';
    if (type === 'tv' && Number(season) > 0) rawQuery = `${rawQuery} Season ${season}`;
    if (Number(episode) > 0) rawQuery = `${rawQuery} Episode ${episode}`;
    if (languageHint) rawQuery = `${rawQuery} ${languageHint}`;
    if (qualityHint) rawQuery = `${rawQuery} ${qualityHint}`;
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

module.exports = { getStreams };
