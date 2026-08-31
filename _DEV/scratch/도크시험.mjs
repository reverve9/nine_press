/* 편집기를 머리 없이 띄워 눌러 본다 — 사용자 크롬을 안 건드린다. 저장을 안 하니 문안도 안 바뀐다.
   N-도크재편 · 탭 둘([판][내용]) · 층 목록 · 「박스 / 페이지」 스위치를 본다. 커밋하지 않는다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:4400', { waitUntil: 'networkidle' });
await p.waitForSelector('.pg', { timeout: 30000 });

const 탭들 = () => p.evaluate(() => [...document.querySelectorAll('.tab')].map((t) => t.textContent));
const 탭누르기 = (이름) => p.evaluate((n) =>
  [...document.querySelectorAll('.tab')].find((t) => t.textContent === n).click(), 이름);
const 칩누르기 = (이름) => p.evaluate((n) =>
  [...document.querySelectorAll('.dkbd .chip')].find((c) => c.textContent === n).click(), 이름);
const 층목록 = () => p.evaluate(() => [...document.querySelectorAll('.lyrs > *')].map((el) => {
  const 줄 = (r) => `${r.querySelector('.eln').textContent} · ${r.querySelector('em').textContent}`;
  if (el.classList.contains('lyrbx')) return `═══ ${[...el.childNodes].map((n) => n.textContent).join(' ')} ═══`;
  if (el.classList.contains('lyrin')) return [...el.children].map((r) => `      ${줄(r)}`).join('\n');
  return `  ${줄(el)}`;
}));

console.log('탭 :', (await 탭들()).join(' · '));

await p.evaluate(() => document.querySelectorAll('.pg')[4].click());   // 05쪽 G6 연속
await p.waitForTimeout(1500);
const 틀 = await p.frameLocator('.frame iframe');
await 틀.locator('[data-박스="0"]').click({ position: { x: 40, y: 40 } });
await p.waitForTimeout(600);

await 탭누르기('내용');
await p.waitForTimeout(400);
console.log('\n── 박스만 고른 층 목록 ──');
console.log((await 층목록()).join('\n'));

// 페이지로 스위치를 넘기고 셋을 얹는다
await 칩누르기('페이지');
await p.waitForTimeout(300);
for (const 이름 of ['+ 글', '+ 도형', '+ 선']) { await 칩누르기(이름); await p.waitForTimeout(900); }

console.log('\n── 얹은 것 셋을 놓은 뒤 ──');
console.log((await 층목록()).join('\n'));

const 재기 = () => p.evaluate(() => {
  const d = document.querySelector('.frame iframe').contentDocument;
  const bx = d.querySelector('[data-박스="0"]');
  const cs = d.defaultView.getComputedStyle(bx);
  const r = bx.getBoundingClientRect();
  return { 박스안: [Math.round(r.left + parseFloat(cs.paddingLeft)),
    Math.round(r.top + parseFloat(cs.paddingTop))],
  것들: [...d.querySelectorAll('[data-얹기]')].map((ov) => {
    const o = ov.getBoundingClientRect();
    return { 번: ov.getAttribute('data-얹기'), 꼴: ov.className.replace('ov ', '').replace(' opick', ''),
      자리: [Math.round(o.left), Math.round(o.top)] };
  }) };
});
const 끝 = await 재기();
console.log(`\n박스 안쪽 원점  ${끝.박스안.join(', ')}`);
for (const c of 끝.것들) {
  const 맞나 = c.자리[0] === 끝.박스안[0] && c.자리[1] === 끝.박스안[1];
  console.log(`  ${c.꼴.padEnd(4)} ${c.자리.join(', ').padEnd(14)} ${맞나 ? '자리 맞다' : '✗ 어긋난다'}`);
}

/* 칸막이 넘기기 — 맨 아래 것(뒤 무리의 맨 아래)을 위로 계속 밀어 앞으로 넘긴다.
   층이 '앞' 으로 바뀌면 목록에서 칸막이 위로 올라선다 */
const 위로 = () => p.evaluate(() => {
  const 줄들 = [...document.querySelectorAll('.lyrs .elrow')];
  const 골 = document.querySelector('.lyrs .elrow.on') ?? 줄들[줄들.length - 1];
  골.querySelectorAll('.chip.mini')[0].click();   // ↑
});
await p.evaluate(() => [...document.querySelectorAll('.lyrs .elrow')].pop().click());
await p.waitForTimeout(500);
for (let n = 0; n < 3; n += 1) { await 위로(); await p.waitForTimeout(700); }
console.log('\n── 맨 아래 것을 세 번 「앞으로」 민 뒤 ──');
console.log((await 층목록()).join('\n'));
console.log('\n층 값 :', await p.evaluate(() => [...document.querySelectorAll('.lyrs .elrow')]
  .map((r) => r.querySelector('.eln').textContent).join(' · ')));

/* 「박스」로 돌아온다 — 판이 다시 박스를 받고 · 삽입 칩이 요소 갈래로 갈린다 */
await 칩누르기('박스');
await p.waitForTimeout(400);
console.log('\n판이 박스를 받나 :', await p.evaluate(() =>
  document.querySelector('.frame iframe').contentDocument
    .querySelector('.wrap').classList.contains('ovp') ? '아니다 · ovp 켜져 있다' : '받는다'));
console.log('삽입 :', await p.evaluate(() => {
  const f = [...document.querySelectorAll('.dkbd .fld')].find((x) => x.textContent.startsWith('삽입'));
  return `칩 ${f.querySelectorAll('.chip').length}개 · 메뉴 ${f.querySelectorAll('.pop select option').length}갈래`;
}));
// 갈래는 팝업 메뉴다 · 고르면 곧 넣는 것이다
await p.selectOption('.dkbd .fld:has(.pop) select', '요약').catch(async () => {
  await p.evaluate(() => {
    const sel = [...document.querySelectorAll('.dkbd .pop select')][0];
    sel.value = '요약'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
});
await p.waitForTimeout(900);
console.log('요약을 놓은 뒤 :', (await 층목록()).find((t) => t.includes('요약')) ?? '✗ 안 들어갔다');

// 판 탭 · 판면 + 박스가 한 탭에 잇달아 선다
await 탭누르기('판');
await p.waitForTimeout(400);
console.log('\n판 탭 :', await p.evaluate(() => {
  const d = document.querySelector('.dkbd');
  return `판면 ${d.querySelectorAll('.lay').length}개 · 칸 ${[...d.querySelectorAll('.fldnm')]
    .map((f) => f.firstChild.textContent).join(' · ')}`;
}));
console.log('판 탭 도크 :', await p.evaluate(() => {
  const d = document.querySelector('.dkbd');
  return `본문 ${d.clientHeight}px · 내용 ${d.scrollHeight}px`;
}));
await 탭누르기('내용');
await p.waitForTimeout(400);

// 도크 세로 · 스크롤이 늘었나 · §6
console.log('\n도크 :', await p.evaluate(() => {
  const d = document.querySelector('.dkbd');
  const 층 = document.querySelector('.lyrs');
  const 놓 = [...d.querySelectorAll('.fld')].find((f) => f.textContent.startsWith('삽입'));
  return `본문 ${d.clientHeight}px · 내용 ${d.scrollHeight}px · `
    + `${d.scrollHeight > d.clientHeight ? '스크롤 있다' : '스크롤 없다'}\n`
    + `       옛 .dkln 자리가 스크롤 안으로 들어왔다 · 층 목록 ${Math.round(층.getBoundingClientRect().height)}px`
    + ` + 삽입 ${Math.round(놓.getBoundingClientRect().height)}px`
    + ` · 머리(.dkhd + .dkln) ${[...document.querySelectorAll('.dock > .dkhd, .dock > .dkln')]
      .reduce((n, e) => n + e.getBoundingClientRect().height, 0)}px`;
}));
await b.close();
