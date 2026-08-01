const fs = require('fs');
const path = require('path');

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const providerFiles = manifest.scrapers.map((scraper) => scraper.filename);

for (const file of providerFiles) {
  const mod = require(path.join(root, file));
  if (typeof mod.getStreams !== 'function') {
    throw new Error(`${file} is missing getStreams()`);
  }
}

console.log(`Manifest ok: ${manifest.name}`);
console.log(`Providers: ${providerFiles.length}`);
console.log('All provider modules export getStreams().');
