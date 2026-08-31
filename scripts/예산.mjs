/* 예산 — **이 빈 박스에 몇 줄이 들어가나**를 잰다. T0 · 보정 v1.
 *
 *   node scripts/예산.mjs              레이아웃 12 × 모드 2 × 박스 = 78행 전수
 *   node scripts/예산.mjs G3 연속       한 칸만
 *   node scripts/예산.mjs --json       T1 규격서가 부르는 꼴
 *   node scripts/예산.mjs --뺄셈        §5-4 · 실제로 채워서 −2 · −3 을 확인한다
 *   node scripts/예산.mjs --표본        content/_check/표본.txt 를 다시 만든다
 *   node scripts/예산.mjs --규격        _DEV/원고규격서.md §4 를 다시 쓴다
 *
 * `기준선.mjs` 는 「42 배수에 앉았나」 · `박스재기.mjs` 는 「넘쳤나」를 묻는다.
 * 여기는 **거꾸로** 묻는다 — 아직 아무것도 안 넣은 박스가 몇 줄을 받느냐.
 *
 * **브라우저는 한 자리에만 쓴다** · 보정 v1 ⑤.
 *   안폭 · 안높이 · 총 줄 수 · 박스 목록   `영역()` 순수 호출로 나온다
 *   한 줄 글자수                        이것 하나만 playwright 로 잰다
 * 줄 나눔은 폭에만 달렸으므로 **서로 다른 안폭 일곱**만 재서 78행에 되꽂는다.
 * (2113 · 1372 · 1002 · 632 · 631 · 447 · 446)
 *
 * 표본은 `content/_check/표본.txt` 하나다 · 코드에 문자열을 박지 않는다.
 * 만드는 법은 §표본 아래에 있고 · `--표본` 이 같은 규칙으로 다시 만든다 · 결정적이다.
 *
 * 사용자 Mac 터미널에서만 돈다 — 챗 쪽 VM 에는 playwright 브라우저가 없다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const 표본길 = path.join(root, 'content/_check/표본.txt');
const { 영역, _규격, render } = await import(pathToFileURL(path.join(root, 'render/index.js')).href);
const pad = _규격.안여백기본;          // 33 · 문서 기본값 하나로만 잰다 · §3-2
const 블록 = 42;
const 머리줄 = 2;                     // 제목 1 + 머리뒤 간격 1 · render/index.js:756 · :786
const 출처줄 = 1;                     // 출처는 간격 0 · 높이 42

const argv = process.argv.slice(2);
const 낼꼴 = argv.includes('--json') ? 'json' : '표';
const 고른것 = argv.filter((a) => !a.startsWith('--'));

/* ─────────────────── 표본 · 결정적으로 만든다 · 보정 v1 ① ───────────────────
   1  content/sokcho/실행계획서.json → content/gangneung/홍보전략브리프.json 차례로
      **문단 요소의 본문만** 등장 순서대로 모은다 (제목 · 표 · 목록 · 출처 제외)
   2  표기를 벗긴다 — `{…}` 토큰 통째 · `**` 굵게 쌍 · 줄바꿈과 이중 공백 → 공백 하나
      벗기지 않으면 굵은 글자와 `{→03}` 배지가 폭을 밀어 「한 줄 몇 자」가 흔들린다
   3  공백 하나로 이어 붙이고 앞에서 정확히 1056자 자른다 · 끝 줄바꿈 없이 쓴다
   실행계획서만으로는 556자뿐이라(문단 13개) 브리프를 잇는다 · 벗긴 뒤 합이 2246자다. */
const 표본차례 = ['content/sokcho/실행계획서.json', 'content/gangneung/홍보전략브리프.json'];
const 표본길이 = 1056;

function 표본만들기() {
  const 문단들 = (f) => {
    const d = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    const out = [];
    for (const p of d.면 ?? [])
      for (const 행 of p.행 ?? [])
        for (const 열 of 행.열 ?? [])
          for (const b of 열.블록 ?? [])
            for (const el of b.내용 ?? [])
              if (el?.문단 != null) (Array.isArray(el.문단) ? el.문단 : [el.문단])
                .forEach((s) => { if (typeof s === 'string') out.push(s); });
    return out;
  };
  const 벗기기 = (s) => s.replace(/\{[^}]*\}/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  const 전체 = 표본차례.flatMap(문단들).map(벗기기).filter(Boolean).join(' ');
  if (전체.length < 표본길이) console.error(
    `표본이 ${표본길이}자에 모자란다 · ${전체.length}자에서 끊는다. 글자를 지어 채우지 않는다`);
  const 표본 = 전체.slice(0, 표본길이);
  fs.writeFileSync(표본길, 표본, 'utf8');
  return 표본;
}

if (argv.includes('--표본')) {
  const s = 표본만들기();
  console.log(`content/_check/표본.txt · ${s.length}자 · 남은 표기 ${(s.match(/[{}]|\*\*/g) ?? []).length}개`);
  process.exit(0);
}

if (!fs.existsSync(표본길)) {
  console.error('content/_check/표본.txt 가 없다 · node scripts/예산.mjs --표본 으로 먼저 만든다');
  process.exit(2);
}
const 표본 = fs.readFileSync(표본길, 'utf8');

/* ─────────────────── ① 순수 계산 · 브라우저를 안 띄운다 ─────────────────── */

const 모드들 = ['카피', '연속'];
const 행들 = [];
for (const 모드 of 모드들)
  for (const G of Object.keys(_규격.레이아웃))
    영역({ 번호: '01', 모드, 레이아웃: G, 박스: [] }).forEach((r, i) => {
      const 안폭 = r.w - pad * 2;
      const 안높이 = r.h - pad * 2;
      행들.push({ 레이아웃: G, 모드, 박스: i, 안폭, 안높이, 총줄: Math.floor(안높이 / 블록) });
    });

/* ─────────────────── ② 한 줄 글자수 · 여기만 playwright ─────────────────── */

const 잴폭 = [...new Set(행들.map((r) => r.안폭))].sort((a, b) => b - a);

/* 서로 다른 안폭마다 그 폭을 내는 실제 (레이아웃 · 모드 · 박스) 를 하나 고른다.
   합성한 상자가 아니라 **진짜 박스**에 표본을 넣고 잰다 · §2 금지 ④. */
const 견본 = 잴폭.map((w) => ({ 폭: w, ...행들.find((r) => r.안폭 === w) }));
const 페이지목록 = [...new Set(견본.map((s) => `${s.레이아웃}|${s.모드}`))];

const 문안 = {
  문서명: 'T0 예산 · 한 줄 글자수 실측',
  페이지: 페이지목록.map((k, n) => {
    const [G, 모드] = k.split('|');
    const 칸수 = 행들.filter((r) => r.레이아웃 === G && r.모드 === 모드).length;
    return {
      번호: String(n + 1).padStart(2, '0'),
      제목: `${G} · ${모드}`,
      모드,
      ...(모드 === '카피' ? { 카피: { 메인: `${G} · ${모드}`, 서브: '한 줄 글자수 실측' } } : {}),
      요지: `${G} · ${모드}`,
      레이아웃: G,
      박스: Array.from({ length: 칸수 }, () => ({ 문단: [표본] })),
    };
  }),
};

async function 재기(doc, 이름) {
  const { chromium } = await import('playwright');
  const css =
    fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8')
      .replaceAll('../assets/fonts/', pathToFileURL(path.join(root, 'assets/fonts/')).href) +
    '\n' + fs.readFileSync(path.join(root, 'rules/page.css'), 'utf8');
  const tmp = path.join(root, `out/html/_예산_${이름}.html`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, render(doc, { css }), 'utf8');

  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(pathToFileURL(tmp).href);
  // 화면용 축척(--view)을 끈다 · 켠 채로 재면 판면 px 이 아니라 화면 px 이 잡힌다
  await p.addStyleTag({ content: '.sheet .page{transform:none!important}' });
  await p.waitForTimeout(500);

  const 잰것 = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.sheet').forEach((sh, 페이지) => {
      sh.querySelectorAll('.bx').forEach((bx, 박스) => {
        const cs = getComputedStyle(bx);
        const 안아래 = bx.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom);
        [...bx.querySelectorAll('.bd, .bt, .lb')].forEach((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          // 한 줄이 여러 rect 로 쪼개질 수 있다 — top 으로 묶어야 줄이 된다
          const tops = new Set([...r.getClientRects()]
            .filter((x) => x.width > 0 && x.height > 0).map((x) => Math.round(x.top)));
          const box = el.getBoundingClientRect();
          out.push({
            페이지: 페이지 + 1, 박스, 갈래: el.className.split(' ')[0],
            줄: tops.size, 높이: Math.round(box.height),
            아래남음: Math.round(안아래 - box.bottom),
          });
        });
      });
    });
    return out;
  });
  await b.close();
  return 잰것;
}

const 잰것 = await 재기(문안, '한줄');

/* 견본을 잰 값에 되꽂는다 */
const 폭별 = new Map();
견본.forEach((s) => {
  const n = 페이지목록.indexOf(`${s.레이아웃}|${s.모드}`) + 1;
  const m = 잰것.find((x) => x.페이지 === n && x.박스 === s.박스 && x.갈래 === 'bd');
  if (!m) return;
  폭별.set(s.폭, { 줄: m.줄, 높이줄: Math.round(m.높이 / 블록), 한줄: 표본.length / m.줄 });
});

for (const r of 행들) {
  const v = 폭별.get(r.안폭);
  r.한줄 = v ? Math.floor(v.한줄) : null;
  r.한줄정밀 = v ? +v.한줄.toFixed(1) : null;
}

/* 안폭마다 잰 속 — 줄 수를 두 방법으로 재서 맞대 본다 · §3-5
     ① 덩이 높이 ÷ 42      ② Range.getClientRects() 를 top 으로 묶은 수
   어긋나도 고치지 않는다 · 어긋난 칸을 적는다. */
if (argv.includes('--폭')) {
  console.log(`\n표본 ${표본.length}자 · 안폭마다 한 번씩 잰다 · ${잴폭.length}가지\n`);
  console.log('안폭   Range 줄  높이÷42  한 줄 글자수  내림   견본');
  let 갈린것 = 0;
  for (const s of 견본) {
    const v = 폭별.get(s.폭);
    if (!v) { console.log(`${String(s.폭).padStart(4)}   못 쟀다`); continue; }
    if (v.줄 !== v.높이줄) 갈린것++;
    console.log(
      `${String(s.폭).padStart(4)}${String(v.줄).padStart(9)}${String(v.높이줄).padStart(9)}` +
      `${v.한줄.toFixed(1).padStart(13)}${String(Math.floor(v.한줄)).padStart(7)}   ` +
      `${s.레이아웃} ${s.모드} 박스 ${s.박스}${v.줄 !== v.높이줄 ? '   ← 두 방법이 갈린다' : ''}`);
  }
  console.log(`\n두 방법이 갈린 안폭 ${갈린것}가지 / ${견본.length}가지`);
  process.exit(0);
}

/* ─────────────────── ③ 규격서 §4 를 다시 쓴다 ───────────────────
   `_DEV/원고규격서.md` 는 **챗이 원고를 쓰기 전에 매번 읽는 고정 문서**다.
   예산 숫자를 그 문서에 손으로 옮겨 적으면 렌더러가 바뀔 때 조용히 낡는다.
   그래서 표식 두 줄 사이를 이 갈래가 통째로 갈아 끼운다. */
const 규격길 = path.join(root, '_DEV/원고규격서.md');
const 표식앞 = '<!-- 예산표 시작 -->';
const 표식뒤 = '<!-- 예산표 끝 -->';

if (argv.includes('--규격')) {
  const 번호 = (G) => Number(G.slice(1));
  const 줄 = [...행들].sort((a, b) =>
    (번호(a.레이아웃) - 번호(b.레이아웃)) ||
    (모드들.indexOf(a.모드) - 모드들.indexOf(b.모드)) ||
    (a.박스 - b.박스));

  const 묶음 = [];
  for (const r of 줄) {
    const k = `${r.레이아웃}|${r.모드}`;
    if (묶음.at(-1)?.[0] !== k) 묶음.push([k, []]);
    묶음.at(-1)[1].push(r);
  }

  const 본문 = [
    표식앞,
    '',
    '```',
    `안여백 ${pad} · 한 블록 ${블록}px · 표본 content/_check/표본.txt ${표본.length}자 실측`,
    '',
    '읽는 법',
    '  「632 / 37 / 26」 은   안폭 632px · 한 줄에 37자 · 문단만 채우면 26줄',
    `  제목을 달면 ${머리줄}줄이 준다 · 출처까지 달면 다시 ${출처줄}줄이 준다`,
    '',
    '레이아웃 모드   칸마다  안폭 / 한 줄 글자수 / 총 줄 수',
    ...묶음.map(([k, 칸]) => {
      const [G, 모드] = k.split('|');
      return `${G.padEnd(8)}${모드.padEnd(6)}` +
        칸.map((c) => `${c.박스 + 1}: ${c.안폭} / ${c.한줄} / ${c.총줄}`).join('   ');
    }),
    '```',
    '',
    표식뒤,
  ].join('\n');

  const 옛것 = fs.readFileSync(규격길, 'utf8');
  const a = 옛것.indexOf(표식앞), b = 옛것.indexOf(표식뒤);
  if (a < 0 || b < 0) {
    console.error(`${규격길} 에서 표식을 못 찾았다 · "${표식앞}" 과 "${표식뒤}" 가 있어야 한다`);
    process.exit(2);
  }
  const 새것 = 옛것.slice(0, a) + 본문 + 옛것.slice(b + 표식뒤.length);
  fs.writeFileSync(규격길, 새것, 'utf8');
  console.log(`_DEV/원고규격서.md §4 를 다시 썼다 · ${묶음.length}줄 · 칸 ${행들.length}개` +
    (새것 === 옛것 ? ' · 바뀐 것 없음' : ''));
  process.exit(0);
}

/* ─────────────────── ④ 뺄셈 확인 · §5-4 ─────────────────── */

if (argv.includes('--뺄셈')) {
  const 칸 = 행들.find((r) => r.레이아웃 === 'G3' && r.모드 === '연속' && r.박스 === 0);
  /* 채움용 — 재기용 1056자는 G3(26줄 ≈ 936자)를 넘겨서 채움 검사에 못 쓴다 · 보정 v1 ⑥
     같은 파일 앞에서 (기대 줄 수 × 한 줄 글자수 − 20자) 만큼 자른다 · 규칙만 코드에 둔다 */
  const 자르기 = (줄) => 표본.slice(0, Math.max(0, 줄 * 칸.한줄 - 20));
  const 짜기 = [
    { 이름: '문단만', 기대: 칸.총줄, 박스: (t) => ({ 문단: [t] }) },
    { 이름: '제목 + 문단', 기대: 칸.총줄 - 머리줄, 박스: (t) => ({ 제목: '머리', 문단: [t] }) },
    { 이름: '제목 + 문단 + 출처', 기대: 칸.총줄 - 머리줄 - 출처줄,
      박스: (t) => ({ 제목: '머리', 문단: [t], 출처: '출처' }) },
  ];
  const doc = {
    문서명: 'T0 예산 · 뺄셈 확인 · G3 연속',
    페이지: 짜기.map((c, n) => ({
      번호: String(n + 1).padStart(2, '0'), 제목: c.이름, 모드: '연속', 요지: c.이름, 레이아웃: 'G3',
      박스: [c.박스(자르기(c.기대)), { 문단: ['곁'] }, { 문단: ['곁'] }],
    })),
  };
  const 뺀것 = await 재기(doc, '뺄셈');
  console.log(`\n뺄셈 확인 · G3 연속 · 박스 0 · 안폭 ${칸.안폭} · 한 줄 ${칸.한줄}자 · 총 ${칸.총줄}줄\n`);
  console.log('짜기                   기대   문단 줄  아래남음  판정');
  const 잰줄 = [];
  let 다맞나 = true;
  짜기.forEach((c, n) => {
    const m = 뺀것.find((x) => x.페이지 === n + 1 && x.박스 === 0 && x.갈래 === 'bd');
    잰줄.push(m?.줄 ?? null);
    const 됐나 = m && m.줄 === c.기대 && m.아래남음 >= 0;
    if (!됐나) 다맞나 = false;
    console.log(`${c.이름.padEnd(20)}${String(c.기대).padStart(5)}${String(m?.줄 ?? '?').padStart(9)}` +
      `${String(m?.아래남음 ?? '?').padStart(10)}   ${됐나 ? '통과' : '불통과'}`);
  });
  /* 절대값이 어긋나도 **차는 따로 본다** — 채움용 자르기가 −20자 여유를 두므로
     셋이 나란히 한 줄씩 짧게 나올 수 있다. 뺄셈 규칙이 맞는지는 차가 답한다. */
  const 머리차 = 잰줄[0] != null && 잰줄[1] != null ? 잰줄[0] - 잰줄[1] : null;
  const 출처차 = 잰줄[1] != null && 잰줄[2] != null ? 잰줄[1] - 잰줄[2] : null;
  console.log(`\n절대값  ${다맞나 ? '셋 다 기대와 같다' : '기대와 어긋난 칸이 있다 · 고치지 말고 적는다'}`);
  console.log(`차      머리 ${머리차} (기대 ${머리줄}) ${머리차 === 머리줄 ? '통과' : '불통과'}  ·  ` +
    `출처 ${출처차} (기대 ${출처줄}) ${출처차 === 출처줄 ? '통과' : '불통과'}`);
  process.exit(0);
}

/* ─────────────────── ⑤ 내기 ─────────────────── */

const 낼것 = 고른것.length
  ? 행들.filter((r) => r.레이아웃 === 고른것[0] && (고른것[1] ? r.모드 === 고른것[1] : true))
  : 행들;

if (낼꼴 === 'json') {
  console.log(JSON.stringify({
    표본: { 파일: 'content/_check/표본.txt', 길이: 표본.length },
    안여백: pad, 블록, 머리줄, 출처줄,
    칸: 낼것.map(({ 레이아웃, 모드, 박스, 안폭, 안높이, 한줄, 총줄 }) => ({
      레이아웃, 모드, 박스, 안폭, 안높이, 한줄, 총줄,
      제목문단: 총줄 - 머리줄, 제목문단출처: 총줄 - 머리줄 - 출처줄,
    })),
  }, null, 2));
} else {
  console.log(`\n표본 ${표본.length}자 · 안여백 ${pad} · 블록 ${블록}px · 잰 안폭 ${잴폭.length}가지\n`);
  console.log('레이아웃  모드   박스  안폭×안높이     한 줄  총 줄  머리 −  출처 −');
  for (const r of 낼것)
    console.log(
      `${r.레이아웃.padEnd(8)}${r.모드.padEnd(6)}${String(r.박스).padStart(3)}   ` +
      `${String(`${r.안폭}×${r.안높이}`).padEnd(12)}${String(r.한줄).padStart(5)}` +
      `${String(r.총줄).padStart(7)}${String(r.총줄 - 머리줄).padStart(8)}` +
      `${String(r.총줄 - 머리줄 - 출처줄).padStart(8)}`);
  console.log(`\n${낼것.length}행`);
}
