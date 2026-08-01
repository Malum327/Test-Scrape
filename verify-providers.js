const providers = ['anidap', 'miruro', 'animepahe', 'cineby', 'nepu'];

(async () => {
  for (const name of providers) {
    const mod = require('./providers/' + name + '.js');
    console.log(name, 'exports', typeof mod.getStreams);
    if (typeof mod.getStreams === 'function') {
      try {
        const res = await mod.getStreams({ title: 'One Punch Man', name: 'One Punch Man' }, 'tv', 1, 1);
        const arr = Array.isArray(res) ? res : [];
        console.log(name, 'count=', arr.length);
        console.log(JSON.stringify(arr.slice(0, 2)));
      } catch (err) {
        console.log(name, 'ERR', err && err.message ? err.message : String(err));
      }
    }
  }
})();
