/* 박스재기 — **덩이가 박스 안에 앉는가**를 진짜 브라우저로 잰다.
 *
 *   node scripts/박스재기.mjs content/_check/표.json
 *
 * `기준선.mjs` 는 덩이의 top 과 높이가 42 배수인지 본다. 그것만으로는
 * **덩이가 박스 밖으로 넘치는지 · 계산한 박스에 실제로 앉았는지**를 못 잡는다 —
 * 84 도 126 도 다 42 배수라서 42px 어긋난 표가 그대로 통과했다(실측 · N-배경 b6).
 *
 * 그래서 여기서는 박스(.bx)의 **안쪽 원점**을 기준으로 잰다.
 *   ① 덩이 top 이 42 배수인가
 *   ② 마지막 덩이 아래가 박스 안쪽을 넘지 않는가
 *
 * 사용자 Mac 터미널에서만 돈다 — 챗 쪽 VM 에는 playwright 브라우저가 없다.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('쓰기 : node scripts/박스재기.mjs <문안.json>');
  process.exit(1);
}

const { render } = await import(pathToFileURL(path.join(root, 'render/index.js')).href);
const doc = JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'));
const css =
  fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8')
    .replaceAll('../assets/fonts/', pathToFileURL(path.join(root, 'assets/fonts/')).href) +
  '\n' + fs.readFileSync(path.join(root, 'rules/page.css'), 'utf8');

const tmp = path.join(root, 'out/html/_박스재기.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, render(doc, { css, 도구: true }), 'utf8');

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(tmp).href);
// 화면용 축척(--view)을 끈다. 켠 채로 재면 판면 px 이 아니라 화면 px 이 잡힌다
await p.addStyleTag({ content: '.sheet .page{transform:none!important}' });
await p.waitForTimeout(500);

const 잰것 = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('.sheet').forEach((sh, 페이지) => {
    sh.querySelectorAll('.bx').forEach((bx, 박스) => {
      const cs = getComputedStyle(bx);
      const r = bx.getBoundingClientRect();
      const 안top = r.top + parseFloat(cs.paddingTop);
      const 안아래 = r.bottom - parseFloat(cs.paddingBottom);
      [...bx.children].forEach((el) => {
        // 도구 표식은 흐름 밖이다 — 비움 표식은 박스를 통째로 덮고 · 「+」는 구석에 절대 배치다
        if (el.classList.contains('emp') || el.classList.contains('plus')) return;
        const e = el.getBoundingClientRect();
        out.push({
          페이지: 페이지 + 1, 박스, 덩이: el.className,
          top: Math.round(e.top - 안top),
          아래: Math.round(안아래 - e.bottom),
        });
      });
    });
  });
  return out;
});
await b.close();

const 어긋 = 잰것.filter((r) => r.top % 42 !== 0 || r.아래 < 0);
console.log(`\n${src} · 잰 덩이 ${잰것.length}개 · 박스 안쪽 원점 기준\n`);
if (어긋.length) {
  console.log('페이지 박스 덩이            top   아래남음   왜');
  for (const r of 어긋) {
    const 왜 = [r.top % 42 !== 0 ? 'top 이 42 배수가 아니다' : '', r.아래 < 0 ? '박스를 넘쳤다' : '']
      .filter(Boolean).join(' · ');
    console.log(`${String(r.페이지).padStart(2)}  ${r.박스}  ${r.덩이.padEnd(14)}${String(r.top).padStart(5)}${String(r.아래).padStart(9)}   ${왜}`);
  }
}
console.log(`어긋난 덩이 ${어긋.length}개 / ${잰것.length}개`);
process.exit(어긋.length ? 1 : 0);
