// 제자리 편집 왕복 검사 — 문안 → 렌더 → DOM → 원문 복원 → 문안 대조
//
//   node scripts/roundtrip.mjs
//
// 판면 규칙이나 inline 표기를 고칠 때마다 돌린다.
// 하나라도 어긋나면 판면에서 그 자리에 고쳤을 때 문안이 깨진다는 뜻이다.
// (playwright 브라우저가 깔려 있어야 한다: npx playwright install chromium)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { render } from '../render/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? 'content/sokcho/실행계획서.json';
const doc = JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'));

const css =
  fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8')
    .replaceAll('../assets/fonts/', pathToFileURL(path.join(root, 'assets/fonts/')).href) +
  '\n' + fs.readFileSync(path.join(root, 'rules/page.css'), 'utf8');

const tmp = path.join(root, 'out/html/_roundtrip.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, render(doc, { css, 도구: true }), 'utf8');

const 읽기 = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });

const 결과 = await p.evaluate(() => {
  // Shell.jsx 의 원문() 과 같은 규칙이어야 한다
  function 원문(node) {
    let s = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { s += n.nodeValue; continue; }
      const 이름 = n.nodeName;
      if (이름 === 'BR') { s += '\n'; continue; }
      const cl = n.classList;
      if (cl?.contains('tbd')) { s += cl.contains('co') ? '{TBD협의}' : '{TBD}'; continue; }
      if (cl?.contains('ar')) {
        s += '{→' + n.textContent.replace(/^\s*→\s*/, '').replace(/^p\./, '').trim() + '}';
        continue;
      }
      if (이름 === 'B' || 이름 === 'STRONG') { s += '**' + 원문(n) + '**'; continue; }
      s += 원문(n);
    }
    return s;
  }
  const out = [];
  document.querySelectorAll('.sheet').forEach((sh, pi) => {
    sh.querySelectorAll('[data-p]').forEach((el) =>
      out.push({ pi, path: JSON.parse(el.getAttribute('data-p')), got: 원문(el) }));
  });
  return out;
});
await b.close();
fs.rmSync(tmp, { force: true });

let 틀림 = 0;
for (const r of 결과) {
  const want = 읽기(doc.면[r.pi], r.path);
  if (want === r.got) continue;
  틀림++;
  if (틀림 <= 12) {
    console.log(`✗ 면${doc.면[r.pi].번호} ${JSON.stringify(r.path)}`);
    console.log(`   원본: ${JSON.stringify(want)}`);
    console.log(`   복원: ${JSON.stringify(r.got)}`);
  }
}
console.log(`\n검사 ${결과.length}개 · 불일치 ${틀림}개`);
process.exit(틀림 ? 1 : 0);
