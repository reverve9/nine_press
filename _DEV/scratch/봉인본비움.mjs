/* 봉인본 1회 실측 — 「비움으로 넘길 것」의 기본 블록 수 · T0 보정 v1 ②③
   커밋하지 않는다. 숫자만 뽑아 핸드오프 §6 에 적는다.
   재는 것은 `.fl` · `.pmap` 이 아니라 **그것을 담은 `.b`** 다 — 원고가 비움으로
   넘기는 자리는 블록 하나이므로 껍데기까지가 기본값이다.
   v3 의 .page 도 2339 × 1654 라 판면 px 이 그대로 나온다 · 축척(--view)만 끈다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { render } = await import(pathToFileURL(path.join(root, 'render/_v3/index.js')).href);
const css =
  fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8')
    .replaceAll('../assets/fonts/', pathToFileURL(path.join(root, 'assets/fonts/')).href) +
  '\n' + fs.readFileSync(path.join(root, 'rules/_v3/page.css'), 'utf8');

const 봉인본 = [
  'content/sokcho/사업장운영시뮬레이션.json',
  'content/gangneung/홍보전략브리프.json',
  'content/sokcho/실행계획서.json',
];

const b = await chromium.launch();
const 잰것 = [];
for (const src of 봉인본) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'));
  const tmp = path.join(root, `out/html/_비움_${path.basename(src, '.json')}.html`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, render(doc, { css }), 'utf8');

  const p = await b.newPage();
  await p.goto(pathToFileURL(tmp).href);
  await p.addStyleTag({ content: '.sheet .page{transform:none!important}' });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const out = [];
    const sim = !!document.querySelector('.wrap.sim');
    document.querySelectorAll('.page').forEach((pg, 면) => {
      pg.querySelectorAll('.b').forEach((bx) => {
        const 갈래 = bx.querySelector(':scope > .fl') ? '단계띠'
          : bx.querySelector(':scope > .pmap') ? '지도' : null;
        if (!갈래) return;
        const h = bx.getBoundingClientRect().height;
        const cs = getComputedStyle(bx);
        out.push({ 면: 면 + 1, 갈래, 높이: +h.toFixed(1), sim,
          껍데기: `테 ${cs.borderTopWidth} · 안여백 ${cs.paddingTop}` });
      });
    });
    return out;
  });
  await p.close();
  r.forEach((x) => 잰것.push({ ...x, 문서: path.basename(src, '.json') }));
}
await b.close();

const 블록 = 42;
console.log('문서                  면  갈래     높이px   ÷42    반올림  판면   껍데기');
for (const x of 잰것) {
  const n = x.높이 / 블록;
  console.log(`${x.문서.padEnd(20)}${String(x.면).padStart(2)}  ${x.갈래.padEnd(6)}` +
    `${String(x.높이).padStart(8)}${n.toFixed(2).padStart(7)}${String(Math.round(n)).padStart(7)}  ` +
    `${(x.sim ? 'sim' : '아님').padEnd(5)}  ${x.껍데기}`);
}

const 중앙 = (a) => { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
for (const 갈래 of ['단계띠', '지도']) {
  const g = 잰것.filter((x) => x.갈래 === 갈래);
  const 블록수 = g.map((x) => Math.round(x.높이 / 블록));
  const 나머지 = g.filter((x) => Math.abs(x.높이 / 블록 - Math.round(x.높이 / 블록)) > 0.01);
  console.log(`\n${갈래} ${g.length}건 · 블록 수 [${블록수.sort((a, c) => a - c).join(', ')}]` +
    ` → 중앙값 ${중앙(블록수)}`);
  console.log(`  42 나머지가 0 이 아닌 건 ${나머지.length} / ${g.length}`);
  const s = g.filter((x) => x.sim), ns = g.filter((x) => !x.sim);
  if (s.length && ns.length) console.log(
    `  .sim ${s.length}건 [${s.map((x) => Math.round(x.높이 / 블록)).join(', ')}] · ` +
    `비-.sim ${ns.length}건 [${ns.map((x) => Math.round(x.높이 / 블록)).join(', ')}]`);
}
