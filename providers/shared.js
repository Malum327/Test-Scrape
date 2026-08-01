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

function isHttpUrl(value = '') {
  const text = String(value || '').trim();
  if (!text || text.startsWith('about:') || text.startsWith('data:') || text.startsWith('javascript:')) return false;
  return /^https?:\/\//i.test(text);
}

function isLikelyStreamUrl(value = '') {
  const text = String(value || '').trim();
  if (!text || text.length < 10) return false;
  if (!isHttpUrl(text) && !text.startsWith('//')) return false;
  const normalized = text.startsWith('//') ? `https:${text}` : text;
  return /(?:\.m3u8|\.mp4|\.mpd|\.mkv|\.webm|master\.m3u8|playlist|manifest)/i.test(normalized) || /(?:m3u8|mp4|mpd)/i.test(normalized);
}

function cleanUrl(raw = '') {
  const value = String(raw || '').trim().replace(/&amp;/g, '&');
  if (!value) return '';
  const trimmed = value.replace(/[),\]>"']+$/g, '').replace(/\.$/, '');
  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith('http') ? trimmed : `https:${trimmed}`;
  }
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function buildStream({ url, providerName, baseUrl, language = 'sub', format = 'm3u8', title = '' }) {
  const streamUrl = cleanUrl(url);
  if (!streamUrl || !isLikelyStreamUrl(streamUrl)) return null;
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
    const stream = buildStream({ url, providerName, baseUrl, language: variant, format, title });
    if (stream) results.push(stream);
  }
  if (!results.length) {
    const stream = buildStream({ url, providerName, baseUrl, language: 'sub', format, title });
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

function extractUrlsFromText(rawText = '') {
  const text = String(rawText || '');
  if (!text) return [];

  const patterns = [
    /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|mpd|mkv|webm)(?:\?[^\s"'<>]*)?/gi,
    /https?:\/\/[^\s"'<>]+(?:master|playlist|manifest)[^\s"'<>]*?(?:m3u8|mp4|mpd|mkv|webm)?/gi,
    /(?:"|')((?:https?:\/\/|\/)[^"'\s<>]+(?:m3u8|mp4|mpd|mkv|webm)(?:\?[^"'\s<>]*)?)/gi,
    /(?:src|href|data-src|data-url|file|source)\s*[:=]\s*["']([^"']+)["']/gi,
    /(?:https?:\/\/|\/)[^\s"'<>]*\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>]*)?/gi,
    /"(?:file|src|url|source|hls|mpd|playlist)"\s*:\s*"([^\"]+)"/gi,
    /'(?:file|src|url|source|hls|mpd|playlist)'\s*:\s*'([^']+)'/gi
  ];

  const seen = new Set();
  const output = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawCandidate = String(match[1] || match[0] || '').replace(/[),\]>"']+$/g, '');
      const cleaned = cleanUrl(rawCandidate);
      if (!cleaned || !isLikelyStreamUrl(cleaned) || seen.has(cleaned)) continue;
      seen.add(cleaned);
      output.push(cleaned);
    }
  }

  return output;
}

function extractDetailLinks(rawText = '', baseUrl = '') {
  const text = String(rawText || '');
  if (!text) return [];
  const matches = [...text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)];
  const links = [];
  const seen = new Set();

  for (const match of matches) {
    const candidate = String(match[1] || '').trim();
    if (!candidate || candidate.startsWith('javascript:') || candidate.startsWith('mailto:') || candidate.startsWith('about:')) continue;
    const resolved = makeAbsoluteUrl(baseUrl, candidate);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    if (/\.(?:png|jpg|jpeg|gif|webp|svg|css|js)(?:\?|$)/i.test(resolved)) continue;
    if (/(watch|anime|movie|tv|play|episode|video|embed|stream|search|api)/i.test(resolved) || /\/[^/]+$/i.test(resolved)) {
      links.push(resolved);
    }
  }

  return links.slice(0, 40);
}

function searchUrlsForTitle(baseUrl, title, extraPaths = []) {
  const cleaned = normalizeTitle(title);
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const q = encodeURIComponent(cleaned.replace(/\s+/g, '+'));
  const urls = new Set();

  if (!root || !cleaned) return [];

  const variants = [
    cleaned,
    cleaned.replace(/\s+/g, '-'),
    cleaned.toLowerCase(),
    cleaned.replace(/\s+/g, '+')
  ];

  for (const variant of variants) {
    const encoded = encodeURIComponent(variant);
    const plain = variant.replace(/\s+/g, '+');
    const candidates = [
      `${root}/?s=${plain}`,
      `${root}/search?q=${plain}`,
      `${root}/search/${encoded}`,
      `${root}/search?keyword=${plain}`,
      `${root}/anime?search=${plain}`,
      `${root}/movie?search=${plain}`,
      `${root}/api/search?q=${plain}`,
      `${root}/api/search?query=${plain}`,
      `${root}/search?search=${plain}`
    ];
    for (const entry of candidates) urls.add(entry);
  }

  if (Array.isArray(extraPaths) && extraPaths.length) {
    for (const pattern of extraPaths) {
      let entry = pattern;
      if (pattern.includes('{q}')) {
        entry = pattern.replace('{q}', q);
      } else if (pattern.includes('search') || pattern.includes('query') || pattern.includes('s=')) {
        entry = pattern.replace('{q}', q).replace(/\{q\}/g, q);
      }
      urls.add(`${root}${entry}`);
    }
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

async function resolveSearchPage(url, baseUrl, title, providerName, formatGuess = 'm3u8') {
  const html = await fetchText(url, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  });
  const directUrls = extractUrlsFromText(html);
  const detailLinks = extractDetailLinks(html, baseUrl);
  const items = [];

  for (const directUrl of directUrls) {
    items.push({ url: directUrl, title });
  }

  for (const detailLink of detailLinks) {
    const watchUrl = String(detailLink || '').trim();
    if (!watchUrl || /\.(?:png|jpg|jpeg|gif|webp|svg|css|js)(?:\?|$)/i.test(watchUrl)) continue;
    try {
      const detailHtml = await fetchText(watchUrl, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });
      const nested = extractUrlsFromText(detailHtml);
      for (const nestedUrl of nested) items.push({ url: nestedUrl, title });
    } catch (error) {
      // continue
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const normalized = cleanUrl(item.url);
    if (!normalized || !isLikelyStreamUrl(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ url: normalized, title: item.title || title });
  }

  return unique.slice(0, 12).map((item) => {
    const stream = buildStream({
      url: item.url,
      providerName,
      baseUrl,
      language: 'sub',
      format: formatGuess,
      title: item.title
    });
    return stream || { url: item.url, title: item.title };
  });
}

async function searchSite({ providerName, baseUrl, title, type = 'tv', extraPaths = [], parser }) {
  const cleaned = normalizeTitle(title);
  if (!cleaned) return [];

  const urls = searchUrlsForTitle(baseUrl, cleaned, extraPaths);
  const discovered = new Set();
  const results = [];

  for (const entry of urls) {
    try {
      const html = await fetchText(entry, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });

      const watchLinks = extractDetailLinks(html, baseUrl).filter((link) => /(?:\/watch\/|\/anime\/|\/movie\/|\/tv\/|\/info\/|play=true|video=|embed)/i.test(link));

      let parsed = [];
      if (typeof parser === 'function') {
        parsed = parser(html, { providerName, baseUrl, title: cleaned, type, extraPaths }) || [];
      }

      if (!parsed.length) {
        parsed = await resolveSearchPage(entry, baseUrl, cleaned, providerName);
      }

      for (const watchLink of watchLinks.slice(0, 8)) {
        try {
          const watchHtml = await fetchText(watchLink, {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          });
          const nested = typeof parser === 'function' ? (parser(watchHtml, { providerName, baseUrl, title: cleaned, type, extraPaths }) || []) : extractUrlsFromText(watchHtml);
          for (const item of nested) {
            const finalUrl = item && item.url ? item.url : String(item || '');
            parsed.push({ url: finalUrl, title: cleaned });
          }
        } catch (error) {
          // continue
        }
      }

      const pending = [];
      for (const item of parsed) {
        const finalUrl = item && item.url ? item.url : String(item || '');
        const normalized = cleanUrl(finalUrl);
        if (!normalized || normalized.startsWith('about:') || normalized.startsWith('javascript:') || normalized.startsWith('data:')) continue;

        if (isLikelyStreamUrl(normalized)) {
          pending.push({ url: normalized, title: String(item && item.title ? item.title : cleaned) });
          continue;
        }

        if (/(?:\/watch\/|\/anime\/|\/movie\/|\/tv\/|\/info\/|play=true|embed|video=)/i.test(normalized)) {
          try {
            const detailHtml = await fetchText(normalized, {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            });
            const nestedCandidates = extractUrlsFromText(detailHtml);
            for (const candidate of nestedCandidates) {
              const nestedUrl = cleanUrl(candidate);
              if (nestedUrl && isLikelyStreamUrl(nestedUrl)) {
                pending.push({ url: nestedUrl, title: String(item && item.title ? item.title : cleaned) });
              }
            }
          } catch (error) {
            // keep resolved watch pages from being treated as final stream URLs
          }
        }
      }

      for (const item of pending) {
        const normalized = cleanUrl(item.url);
        if (!normalized || discovered.has(normalized)) continue;
        discovered.add(normalized);

        const format = normalized.includes('.m3u8') ? 'm3u8' : (normalized.includes('.mpd') ? 'mpd' : 'mp4');
        const streamVariants = buildLanguageVariants({
          url: normalized,
          providerName,
          baseUrl,
          format,
          title: String(item && item.title ? item.title : cleaned)
        });
        results.push(...streamVariants);
      }

      if (results.length >= 8) break;
    } catch (error) {
      // Keep trying all provider search variants.
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
  extractUrlsFromText,
  extractDetailLinks,
  fetchTmdbMetadata,
  searchUrlsForTitle,
  resolveSearchPage,
  searchSite,
  makeAbsoluteUrl,
  cleanUrl,
  isHttpUrl,
  isLikelyStreamUrl
};
