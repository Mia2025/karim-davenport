// Build: lê data.json, baixa as fotos do Stellar MLS (Matrix media server) em 1600px,
// redimensiona com sharp e grava public/img + public/data.js. Roda no build da Vercel.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
const BASE = 'https://media.stellar.mlsmatrix.com/mediaserver/GetMedia.ashx';
const IMG = path.join(__dirname, 'public', 'img');
fs.mkdirSync(IMG, { recursive: true });

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(s => setTimeout(s, 800 * (i + 1)));
    }
  }
}

async function one(L, n) {
  const url = `${BASE}?Key=${L.key}&TableID=9&Type=1&Number=${n}&Size=7&exk=${L.exk.slice(n*32,n*32+32)}`;
  const buf = await get(url);
  const nn = String(n).padStart(2, '0');
  await sharp(buf).rotate().resize({ width: n === 0 ? 1600 : 1200, withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(IMG, `${L.ml}-p${nn}.jpg`));
  await sharp(buf).rotate().resize({ width: 480, height: 320, fit: 'cover' })
    .jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(IMG, `${L.ml}-t${nn}.jpg`));
}

(async () => {
  const jobs = [];
  for (const L of DATA) for (let n = 0; n < L.n; n++) jobs.push([L, n]);
  let ok = 0; const fail = [];
  const workers = Array.from({ length: 6 }, async () => {
    while (jobs.length) {
      const [L, n] = jobs.shift();
      try { await one(L, n); ok++; } catch (e) { fail.push(`${L.ml}:${n}:${e.message}`); }
    }
  });
  await Promise.all(workers);
  const total = DATA.reduce((a, L) => a + L.n, 0);
  console.log(`fotos ok ${ok}/${total}`, fail.length ? 'FALHAS ' + fail.join(' ') : '');
  if (ok < total) process.exit(1);

  const pub = DATA.map(({ exk, key, ...rest }) => rest);
  fs.writeFileSync(path.join(__dirname, 'public', 'data.js'), 'window.DATA=' + JSON.stringify(pub) + ';');
  console.log('data.js ok');
})();
