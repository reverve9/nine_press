// out/html/*.html → out/pdf/*.pdf   (벡터. html2canvas 를 쓰지 않는다)
//   node scripts/pdf.js out/html/실행계획서.html
//
// 사전 준비 1회:  npm i -D playwright  &&  npx playwright install chromium

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(root, process.argv[2] ?? 'out/html/실행계획서.html');
const outDir = path.join(root, 'out/pdf');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, path.basename(src, '.html') + '.pdf');

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1200);

// @page{size:297mm 210mm;margin:0} 와 .sheet 의 scale(.47991) 이
// 2340px → 297mm 를 맞춘다. page.css 의 @media print 가 그 값을 들고 있다.
await p.pdf({
  path: out,
  preferCSSPageSize: true,
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});

await b.close();
console.log(out);
