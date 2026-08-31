/* 자 · 안내선을 머리 없이 눌러 본다 · N-자 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:4400', { waitUntil: 'networkidle' });
await p.waitForSelector('.pg', { timeout: 30000 });
await p.evaluate(() => document.querySelectorAll('.pg')[4].click());
await p.waitForTimeout(1500);

// 배지(41%)는 반올림 값이라 못 쓴다 · 판 폭으로 실제 축척을 낸다
const 축척 = await p.evaluate(() => document.querySelector('.frame iframe').getBoundingClientRect().width / 2339);
console.log('축척 :', 축척);
console.log('자 :', await p.evaluate(() => {
  const x = document.querySelector('.rlx'), y = document.querySelector('.rly');
  return `가로 눈금 ${[...x.querySelectorAll('i')].map((i)=>i.textContent).slice(0,4).join(' · ')} …`
    + ` · 세로 눈금 ${[...y.querySelectorAll('i')].map((i)=>i.textContent).slice(0,4).join(' · ')} …`;
}));

// 자에서 끌어 내려 가로 안내선을 만든다 (판 y = 600 자리)
const 칸 = await p.evaluate(() => {
  const r = document.querySelector('.frame iframe').getBoundingClientRect();
  return { x: r.left, y: r.top };
});
const 자y = await p.evaluate(() => document.querySelector('.rlx').getBoundingClientRect().top + 10);
await p.mouse.move(칸.x + 200, 자y);
await p.mouse.down();
await p.mouse.move(칸.x + 200, 칸.y + 600 * 축척, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(500);
console.log('가로 안내선 :', await p.evaluate(() => JSON.stringify(document.querySelectorAll('.gd.h').length)
  + ' 개 · title ' + (document.querySelector('.gd.h')?.title ?? '없다')));

/* 세로 안내선을 세울 자리 — **판면이 이미 아는 선에서 먼 데**로 고른다.
   박스 모서리와 그 사이 한가운데가 이미 자석 후보라 그 옆에 세우면
   무엇에 붙은 것인지 못 가른다 · 30px 넘게 떨어진 자리를 찾아 쓴다 */
const 판선 = await p.evaluate(() => {
  const d = document.querySelector('.frame iframe').contentDocument;
  const v = [];
  d.querySelectorAll('[data-박스]').forEach((b) => {
    const r = b.getBoundingClientRect(); v.push(Math.round(r.left), Math.round(r.right));
  });
  const 낱 = [...new Set(v)].sort((a, b) => a - b);
  return [...낱, ...낱.slice(1).map((x, k) => Math.round((x + 낱[k]) / 2))];
});
let 세울곳 = 1000;
for (let x = 300; x < 2000; x += 1) if (판선.every((c) => Math.abs(c - x) > 34)) { 세울곳 = x; break; }
console.log('판이 아는 선 :', 판선.sort((a,b)=>a-b).join(' · '), '→ 안내선을', 세울곳, '에 세운다');

const 자x = await p.evaluate(() => document.querySelector('.rly').getBoundingClientRect().left + 10);
await p.mouse.move(자x, 칸.y + 300);
await p.mouse.down();
await p.mouse.move(Math.round(칸.x + 세울곳 * 축척), 칸.y + 300, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(500);
세울곳 = await p.evaluate(() => Number(document.querySelector('.gd.v').title.replace('x ', '')));
console.log('세로 안내선 :', await p.evaluate(() => document.querySelectorAll('.gd.v').length
  + ' 개 · title ' + (document.querySelector('.gd.v')?.title ?? '없다')));
console.log('상단바 :', await p.evaluate(() =>
  [...document.querySelectorAll('.top .chip')].map((c)=>c.textContent).join(' · ')));

// 자석 · 얹은 도형을 안내선 x=1180 근처로 Shift 끌기
const 칩 = (n) => p.evaluate((x) => [...document.querySelectorAll('.dkbd .chip')].find((c) => c.textContent === x).click(), n);
const 틀 = await p.frameLocator('.frame iframe');
await 틀.locator('[data-박스="0"]').click({ position: { x: 40, y: 40 } });
await p.waitForTimeout(600);
await p.evaluate(() => [...document.querySelectorAll('.tab')].find((t)=>t.textContent==='내용').click());
await p.waitForTimeout(300);
await 칩('페이지'); await p.waitForTimeout(300);
await 칩('+ 도형'); await p.waitForTimeout(900);
console.log('안내선 자석 :', await p.evaluate((세울곳) => {
  const d = document.querySelector('.frame iframe').contentDocument;
  const ov = d.querySelector('[data-얹기="0"]');
  const 시작 = parseFloat(ov.style.left), 목표 = 세울곳 + 9;   // 안내선에서 9px 어긋나게 놓는다
  const ev = (t, x, sh) => ov.dispatchEvent(new PointerEvent(t, {
    bubbles: true, cancelable: true, clientX: x, clientY: 500, shiftKey: sh, pointerId: 1 }));
  ev('pointerdown', 500, false); ev('pointermove', 500 + (목표 - 시작), true); ev('pointerup', 500 + (목표 - 시작), true);
  return `목표 ${목표} → 놓인 곳 ${parseFloat(ov.style.left)} · 안내선 ${세울곳} 에 ${parseFloat(ov.style.left) === 세울곳 ? '붙었다' : '✗ 안 붙었다'}`;
}, 세울곳));
await p.waitForTimeout(600);

// 판 밖으로 끌면 지운다
await p.mouse.move(Math.round(칸.x + 세울곳 * 축척), 칸.y + 300);
await p.mouse.down();
await p.mouse.move(칸.x - 40, 칸.y + 300, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(500);
console.log('판 밖으로 끈 뒤 :', await p.evaluate(() =>
  `세로 ${document.querySelectorAll('.gd.v').length} · 가로 ${document.querySelectorAll('.gd.h').length}`));
console.log('얹은 것 테 색 :', await p.evaluate(() => {
  const d = document.querySelector('.frame iframe').contentDocument;
  const ov = d.querySelector('[data-얹기="0"]');
  return d.defaultView.getComputedStyle(ov).outlineColor;
}));

/* 끄면 자석도 같이 꺼진다 — 안 보이는 선이 잡아채면 이유를 못 댄다 */
await p.evaluate(() => [...document.querySelectorAll('.top .chip')].find((c) => c.textContent.startsWith('안내선')).click());
await p.waitForTimeout(400);
console.log('안내선 끈 뒤 :', await p.evaluate((세울곳) => {
  const d = document.querySelector('.frame iframe').contentDocument;
  const ov = d.querySelector('[data-얹기="0"]');
  const 시작 = parseFloat(ov.style.left), 목표 = 세울곳 + 9;
  const ev = (t, x, sh) => ov.dispatchEvent(new PointerEvent(t, {
    bubbles: true, cancelable: true, clientX: x, clientY: 500, shiftKey: sh, pointerId: 1 }));
  ev('pointerdown', 500, false); ev('pointermove', 500 + (목표 - 시작), true); ev('pointerup', 500 + (목표 - 시작), true);
  const v = parseFloat(ov.style.left);
  return `자 ${document.querySelector('.rlx') ? '보인다' : '숨었다'} · 목표 ${목표} → ${v} · `
    + (v === 세울곳 ? '✗ 아직 붙는다' : '안 붙는다');
}, 세울곳));
await b.close();
