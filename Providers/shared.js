const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/json,*/*',
  'Referer': 'https://www.google.com/'
};
const QUALITY_RANK = {
  '4k': 5,
  '2160p': 5,
  '1080p': 4,
  '720p': 3,
  '480p': 2,
  '360p': 1,
  hd: 0,
  default: 0
};

function normalizeTitle(title = '') {
  return String(title || '')
    .replace(/[\[\](){}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:–-]\s*/g, ' ')
    .trim();
}

function openUrl(url, headers = {}) {
  return fetch(url, {
    method: 'GET',
    headers: { ...DEFAULT_HEADERS, ...headers },
    redirect: 'follow'
  });
}

async function fetchText(url, headers = {}) {
  const response = await openUrl(url, headers);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function fetchJson(url, headers = {}) {
  const response = await openUrl(url, headers);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function normalizeQualityFromUrl(url = '') {
  const text = String(url || '').toLowerCase();
  if (text.includes('2160') || text.includes('4k')) return '4K';
  if (text.includes('1080')) return '1080p';
  if (text.includes('720')) return '720p';
  if (text.includes('480')) return '480p';
  if (text.includes('360')) return '360p';
  return 'HD';
}

function chooseQuality(url = '') {
  return normalizeQualityFromUrl(url);
}

function detectLanguageVariants(text = '', url = '') {
  const source = `${String(text || '')} ${String(url || '')}`.toLowerCase();
  const hasDub = /(dub|dubs|dubbed|voiceover|vo)/i.test(source) || /(?:^|[\-_])dub(?:[\-_]|$)/i.test(source);
  const hasSub = /(sub|subs|subbed|subtitle|subtitles|cc)/i.test(source) || /(?:^|[\-_])sub(?:[\-_]|$)/i.test(source);

  if (hasDub && hasSub) return ['sub', 'dub'];
  if (hasDub) return ['dub'];
  if (hasSub) return ['sub'];
  return ['sub', 'dub'];
}

function sortStreamsByQuality(items = []) {
  const normalized = Array.isArray(items) ? items : [];
  return normalized.sort((a, b) => {
    const aRank = QUALITY_RANK[(a && a.quality ? String(a.quality).toLowerCase() : 'default')] ?? 0;
    const bRank = QUALITY_RANK[(b && b.quality ? String(b.quality).toLowerCase() : 'default')] ?? 0;
    if (bRank !== aRank) return bRank - aRank;
    const aLang = a && a.language ? a.language : 'sub';
    const bLang = b && b.language ? b.language : 'sub';
    const langWeightA = aLang === 'dub' ? 1 : 0;
    const langWeightB = bLang === 'dub' ? 1 : 0;
    if (langWeightA !== langWeightB) return langWeightB - langWeightA;
    return String(a && a.name ? a.name : '').localeCompare(String(b && b.name ? b.name : ''));
  });
}

function dedupeStreams(items = []) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = `${item && item.url ? item.url : ''}|${item && item.language ? item.language : 'sub'}`;
    if (!item || !item.url || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function buildStream({ url, providerName, baseUrl, language = 'sub', format = 'm3u8', title = '' }) {
  const streamUrl = String(url || '').trim();
  if (!streamUrl) return null;
  const rawLanguage = String(language || 'sub').toLowerCase();
  let lang = rawLanguage === 'dub' ? 'dub' : 'sub';
  const variants = detectLanguageVariants(title, streamUrl);
  if (variants.includes('dub') && !variants.includes('sub')) lang = 'dub';
  if (variants.includes('sub') && !variants.includes('dub')) lang = 'sub';
  const quality = normalizeQualityFromUrl(streamUrl);
  return {
    name: `${providerName} ${quality} ${lang === 'dub' ? 'Dub' : 'Sub'}`,
    url: streamUrl,
    quality,
    language: lang,
    format,
    headers: {
      Referer: baseUrl || 'https://www.google.com/',
      'User-Agent': USER_AGENT,
      Origin: baseUrl || 'https://www.google.com/'
    },
    behaviorHints: {
      notWebReady: true,
      proxyHeaders: {
        request: {
          Referer: baseUrl || 'https://www.google.com/',
          Origin: baseUrl || 'https://www.google.com/'
        }
      }
    }
  };
}

function buildLanguageVariants({ url, providerName, baseUrl, format = 'm3u8', title = '' }) {
  const variants = detectLanguageVariants(title, url);
  const results = [];
  for (const variant of variants) {
    const stream = buildStream({
      url,
      providerName,
      baseUrl,
      language: variant,
      format,
      title
    });
    if (stream) results.push(stream);
  }
  if (!results.length) {
    const stream = buildStream({
      url,
      providerName,
      baseUrl,
      language: 'sub',
      format,
      title
    });
    if (stream) results.push(stream);
  }
  return results;
}

function makeAbsoluteUrl(baseUrl, href) {
  if (!href) return '';
  const trimmed = String(href).trim();
  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith('http') ? trimmed : `https:${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `${String(baseUrl).replace(/\/+$/, '')}${trimmed}`;
  }
  return `${String(baseUrl).replace(/\/+$/, '')}/${trimmed}`;
}

function parseSiteStreamUrls(rawText = '', options = {}) {
  const text = String(rawText || '');
  if (!text) return [];
  const { baseUrl = '', title = '' } = options;
  const patterns = [
    /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>]*)?/gi,
    /https?:\/\/[^\s"'<>]+(?:master|playlist|manifest)[^\s"'<>]*?(?:m3u8|mp4|mpd)?/gi,
    /(?:"|')((?:https?:\/\/|\/)[^"'\s<>]+(?:m3u8|mp4|mpd)(?:\?[^"'\s<>]*)?)/gi,
    /href=["']([^"']+)["']/gi,
    /src=["']([^"']+)["']/gi
  ];

  const seen = new Set();
  const results = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawCandidate = String(match[1] || match[0] || '').replace(/[),\]>"']+$/g, '');
      if (!rawCandidate) continue;
      const normalizedCandidate = rawCandidate.replace(/&amp;/g, '&');
      const candidate = /(m3u8|mp4|mpd|manifest)/i.test(normalizedCandidate) ? normalizedCandidate : '';
      if (!candidate) continue;
      const resolved = candidate.startsWith('http') ? candidate : makeAbsoluteUrl(baseUrl, candidate);
      const finalUrl = resolved && resolved.includes('http') ? resolved : '';
      if (!finalUrl || seen.has(finalUrl)) continue;
      seen.add(finalUrl);
      results.push({ url: finalUrl, title });
    }
  }

  return results;
}

function buildSearchUrls(baseUrl, title, type = 'tv', extraPaths = []) {
  const cleaned = normalizeTitle(title);
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const terms = [cleaned, cleaned.replace(/\s+/g, '-'), cleaned.toLowerCase()];
  const urls = new Set();

  if (!root || !cleaned) return [];

  for (const term of terms) {
    if (!term) continue;
    const encoded = encodeURIComponent(term);
    const q = term.replace(/\s+/g, '+');
    const candidates = [
      `${root}/?s=${q}`,
      `${root}/search?q=${q}`,
      `${root}/search/${encoded}`,
      `${root}/search?keyword=${q}`,
      `${root}/anime?search=${q}`,
      `${root}/?search=${q}`,
      `${root}/api/search?q=${q}`,
      `${root}/api/search?query=${q}`
    ];

    for (const entry of candidates) urls.add(entry);
  }

  if (Array.isArray(extraPaths) && extraPaths.length) {
    const q = encodeURIComponent(cleaned.replace(/\s+/g, '+'));
    for (const pattern of extraPaths) {
      const entry = pattern.includes('{q}') ? pattern.replace('{q}', q).replace(/\+/, '%20') : `${root}${pattern}`;
      urls.add(entry);
    }
  }

  if (type === 'movie') {
    urls.add(`${root}/movie?search=${encodeURIComponent(cleaned)}`);
  }

  return [...urls];
}

async function fetchTmdbMetadata(title, type = 'tv') {
  try {
    const cleaned = normalizeTitle(title);
    if (!cleaned) return null;
    const endpoint = `${TMDB_BASE_URL}/search/${type === 'movie' ? 'movie' : 'tv'}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleaned)}&include_adult=false`;
    const payload = await fetchJson(endpoint);
    const results = Array.isArray(payload && payload.results) ? payload.results : [];
    if (!results.length) return null;
    const item = results[0];
    return {
      id: item.id,
      title: item.title || item.name || cleaned,
      originalTitle: item.original_title || item.original_name || cleaned,
      overview: item.overview || '',
      year: (item.release_date || item.first_air_date || '').slice(0, 4) || '',
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
      backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : '',
      type: type === 'movie' ? 'movie' : 'tv'
    };
  } catch (error) {
    return null;
  }
}

async function searchSite({ providerName, baseUrl, title, type = 'tv', extraPaths = [], parser }) {
  const cleaned = normalizeTitle(title);
  if (!cleaned) return [];

  const urls = buildSearchUrls(baseUrl, cleaned, type, extraPaths);
  const discovered = new Set();
  const results = [];

  for (const entry of urls) {
    try {
      const html = await fetchText(entry, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });
      const extracted = typeof parser === 'function'
        ? parser(html, { providerName, baseUrl, title: cleaned, type, extraPaths })
        : parseSiteStreamUrls(html, { baseUrl, title: cleaned });

      for (const item of extracted) {
        const finalUrl = item && item.url ? item.url : String(item || '');
        const normalizedUrl = finalUrl.startsWith('http') ? finalUrl : makeAbsoluteUrl(baseUrl, finalUrl);
        if (!normalizedUrl || discovered.has(normalizedUrl)) continue;
        discovered.add(normalizedUrl);
        const format = normalizedUrl.includes('.m3u8') ? 'm3u8' : (normalizedUrl.includes('.mpd') ? 'mpd' : 'mp4');
        const streamVariants = buildLanguageVariants({
          url: normalizedUrl,
          providerName,
          baseUrl,
          format,
          title: String(item && item.title ? item.title : cleaned)
        });
        results.push(...streamVariants);
      }

      if (results.length >= 8) break;
    } catch (error) {
      // keep trying other URLs
    }
  }

  return sortStreamsByQuality(dedupeStreams(results).slice(0, 12));
}

module.exports = {
  TMDB_API_KEY,
  TMDB_BASE_URL,
  DEFAULT_HEADERS,
  USER_AGENT,
  QUALITY_RANK,
  normalizeTitle,
  fetchText,
  fetchJson,
  chooseQuality,
  normalizeQualityFromUrl,
  detectLanguageVariants,
  sortStreamsByQuality,
  buildStream,
  buildLanguageVariants,
  dedupeStreams,
  parseSiteStreamUrls,
  extractMediaUrls,
  fetchTmdbMetadata,
  buildSearchUrls,
  searchSite,
  makeAbsoluteUrl
};
