// 기준선 검사 — 렌더된 글 덩이가 42px 격자에 앉았는지 실측한다
//
//   node scripts/기준선.mjs                      기본 content/_check/판면기준.json
//   node scripts/기준선.mjs <문안.json>
//
// 자리(.bx) 안쪽 여백 위를 원점으로 잡는다. 자리마다 원점을 새로 센다.
// 여백은 자리마다 다를 수 있다(자리.여백). 문서 기본값이 아니라 실제 값을 읽는다.
// 통과 조건 둘 · 둘 다 만족해야 격자가 온전하다
//   ① 덩이의 top 이 42 의 배수      아니면 그 덩이부터 아래가 통째로 밀린다
//   ② 덩이의 높이가 42 의 배수       아니면 다음 덩이가 밀린다
//
// 설계 근거는 _DEV/00_설계_나인프레스_v2.md §4-3.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { render } from '../render/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = 42;
const src = process.argv[2] ?? 'content/_check/판면기준.json';
const doc = JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'));

const css =
  fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8')
    .replaceAll('../assets/fonts/', pathToFileURL(path.join(root, 'assets/fonts/')).href) +
  '\n' + fs.readFileSync(path.join(root, 'rules/page.css'), 'utf8');

const tmp = path.join(root, 'out/html/_기준선.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, render(doc, { css }), 'utf8');

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 2400, height: 1700 } });
await pg.goto(pathToFileURL(tmp).href);
await pg.waitForFunction(() => document.fonts.status === 'loaded');

const 결과 = await pg.evaluate(() => {
  const out = [];
  document.querySelectorAll('.page').forEach((page, pi) => {
    page.querySelectorAll('.bx').forEach((bx, bi) => {
      // 원점은 그 자리의 실제 안쪽 여백이다. 자리마다 다를 수 있다
      const 여백 = parseFloat(getComputedStyle(bx).paddingTop) || 0;
      bx.querySelectorAll(
        ':scope > .bt, :scope > .sm, :scope > .bd, :scope > .lb,' +
        ':scope > .ls, :scope > .ol, :scope > .tb, :scope > .sp, :scope > .nm,' +
        ':scope > .im, :scope > .sx, :scope > .sk'
      ).forEach((el) => {
        out.push({
          면: pi + 1, 자리: bi, 여백, 계층: el.className,
          top: el.offsetTop - 여백, 높이: el.offsetHeight,
        });
      });
    });
  });
  return out;
});
await b.close();

const 나머지 = (n) => ((n % B) + B) % B;
const 계층별 = {};
for (const r of 결과) (계층별[r.계층] ??= []).push(r);

console.log(`${src} · 잰 덩이 ${결과.length}개 · 기준선 ${B}px\n`);
console.log('계층    개수    top 42배수    높이 42배수    나온 높이');
for (const [k, v] of Object.entries(계층별)) {
  const t = v.filter((x) => 나머지(x.top) === 0).length;
  const h = v.filter((x) => 나머지(x.높이) === 0).length;
  const hs = [...new Set(v.map((x) => x.높이))].sort((a, c) => a - c).join(' · ');
  console.log(
    `${k.padEnd(6)} ${String(v.length).padStart(4)}    ${String(t).padStart(4)} / ${String(v.length).padEnd(4)}   ` +
    `${String(h).padStart(4)} / ${String(v.length).padEnd(4)}   ${hs}`);
}

const 어긋 = 결과.filter((x) => 나머지(x.top) !== 0);
console.log(`\n어긋난 덩이 ${어긋.length}개 / ${결과.length}개`);
if (어긋.length) {
  const 분포 = {};
  for (const r of 어긋) {
    const k = `${r.계층} · 원점에서 +${나머지(r.top)}`;
    분포[k] = (분포[k] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(분포).sort((a, c) => c[1] - a[1]))
    console.log(`  ${k.padEnd(28)} ${v}개`);
  console.log('\n첫 어긋남 다섯');
  for (const r of 어긋.slice(0, 5))
    console.log(`  ${r.면}면 자리${r.자리} ${r.계층.padEnd(3)} top ${String(r.top).padStart(5)} · 높이 ${r.높이} · 여백 ${r.여백}`);
}
process.exitCode = 어긋.length ? 1 : 0;
