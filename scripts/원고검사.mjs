/* 원고검사 — **원고 .md 가 판면에 앉을 수 있는 글인가**를 넷으로 묻는다.
 *
 *   node scripts/원고검사.mjs _DEV/원고_국수축제_시험판.md
 *   node scripts/원고검사.mjs <원고.md> --json      기계가 읽는 꼴
 *   node scripts/원고검사.mjs --봉인본              관문을 봉인본으로 교정한다
 *
 *   ① 문법     규격서 §2 에 적힌 것만 읽는다 · 밖이면 그 줄을 대고 멈춘다
 *   ② 계약     render() 를 부르고 catch 한다 · 계약을 여기서 다시 적지 않는다
 *   ③ 예산     칸마다 몇 줄 드는지 센다 · 브라우저 없이 · 실측 대비 13칸 중 11칸 정확
 *   ④ 형태     봉인본 39쪽과 같은 모양인가            ← 이것이 T1 시험의 과녁이다
 *
 * **④ 의 기준은 봉인본이 한 건도 안 어기는 값이다.** 봉인본이 통과 못 하는 관문은 틀린 관문이라
 * `--봉인본` 이 그것을 매번 다시 확인한다. 값을 고치려면 그 실측을 먼저 바꿔라.
 *
 * 한 줄 글자수는 `scripts/예산.mjs --json` 을 불러 온다 · 여기서 다시 재지 않는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { render, 영역, _규격 } = await import(pathToFileURL(path.join(root, 'render/index.js')).href);
const pad = _규격.안여백기본, 블록 = 42;
const 자리크기 = { 그림: 6, 단계띠: 3, 지도: 8 };

/* ─────────────────── 관문 값 · 봉인본 39쪽 실측에서 나왔다 ───────────────────
   왼쪽이 관문 · 오른쪽이 봉인본 실측이다. 봉인본은 넷 다 통과한다. */
const 관문 = {
  문단최장:   { 값: 135, 봉인본: '최장 135자 · 중앙 47자' },
  박스몸최대: { 값: 5,   봉인본: '최대 5개 · 79%가 1개' },
  박스문단최대:{ 값: 3,   봉인본: '최대 3개 · 78%가 0개' },
  문단비중:   { 값: 0.35, 봉인본: '22% (45/201)' },
  박스몸평균: { 값: 2.0, 봉인본: '1.3개' },
  문단중앙:   { 값: 70,  봉인본: '47자' },
};

/* ─────────────────── ① 문법 · 규격서 §2 만 읽는다 ─────────────────── */

function 읽기(글) {
  const 오류 = [];
  const 페이지 = [];
  let P = null, B = null, 문단줄 = [], 표줄 = [];
  const 탈 = (m) => 오류.push(`${P?.번호 ?? '?'}쪽 · ${m}`);

  const 문단닫기 = () => {
    const t = 문단줄.join('\n').trim(); 문단줄 = [];
    if (!t) return;
    if (!B) return 탈(`박스 밖에 글이 있다 · "${t.slice(0, 24)}…"`);
    B.내용.push({ 문단: t });
  };
  const 표닫기 = () => {
    const 줄 = 표줄; 표줄 = [];
    if (!줄.length) return;
    const 칸 = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const 구분 = 줄.findIndex((l) => /^\|[\s|:-]+\|$/.test(l));
    if (구분 < 0) return 탈('표에 헤더 가름 줄(| --- |)이 없다');
    const 행 = 줄.slice(구분 + 1).map(칸);
    if (!행.length) return 탈('표에 행이 없다');
    B.내용.push({ 표: { 헤더: 칸(줄[0]), 행 } });
  };
  const 닫기 = () => { 문단닫기(); 표닫기(); };

  글.replace(/<!--[\s\S]*?-->/g, '').split('\n').forEach((raw, n) => {
    const l = raw.trimEnd(), 줄번 = n + 1;

    if (/^#\s/.test(l)) {
      닫기();
      const [번호, ...제] = l.replace(/^#\s+/, '').split('·').map((x) => x.trim());
      P = { 번호, 제목: 제.join(' · '), 박스: [] }; 페이지.push(P); B = null; return;
    }
    if (/^##\s+박스\s*$/.test(l)) { 닫기(); B = { 내용: [] }; P?.박스.push(B); return; }
    if (/^###\s/.test(l)) {
      닫기();
      if (!B) return 탈(`${줄번}줄 · 박스 밖에 제목이 있다`);
      B.내용.push({ 제목: l.replace(/^###\s+/, '').trim() }); return;
    }
    if (/^##\s/.test(l)) return 탈(`${줄번}줄 · 「## 박스」 말고 다른 ## 을 썼다 · "${l}"`);

    const 열쇠 = l.match(/^(모드|레이아웃|요지|카피 메인|카피 서브)\s*:\s*(.*)$/);
    if (열쇠 && !B) {
      닫기();
      if (!P) return 탈(`${줄번}줄 · 페이지 밖에 열쇠 줄이 있다`);
      const [, k, v] = 열쇠;
      if (k.startsWith('카피')) { P.카피 = P.카피 ?? {}; P.카피[k.split(' ')[1]] = v; }
      else P[k] = v;
      return;
    }
    if (!l.trim()) { 닫기(); return; }
    if (/^\|/.test(l)) { 문단닫기(); 표줄.push(l); return; }
    표닫기();

    const 자리 = l.match(/^\[(그림|비움)\s*:\s*(.+)\]\s*$/);
    if (자리) {
      문단닫기();
      if (!B) return 탈(`${줄번}줄 · 박스 밖에 자리 표기가 있다`);
      const [, 갈래, 속] = 자리, 것 = 속.trim();
      const n2 = 갈래 === '그림' ? 자리크기.그림 : 자리크기[것];
      if (n2 == null) return 탈(`[비움: ${것}] 의 기본 블록 수를 모른다 · 규격서 §2-4 에 없다`);
      B.내용.push({ 비움: [n2, 갈래 === '그림' ? `그림 · ${것}` : 것] }); return;
    }
    if (/^>\s/.test(l)) {
      문단닫기();
      if (!B) return 탈(`${줄번}줄 · 박스 밖에 출처가 있다`);
      B.내용.push({ 출처: l.replace(/^>\s+/, '').trim() }); return;
    }
    if (/^[-*]\s/.test(l) || /^\d+\.\s/.test(l)) {
      문단닫기();
      if (!B) return 탈(`${줄번}줄 · 박스 밖에 목록이 있다`);
      const 열 = /^\d+\.\s/.test(l) ? '번호목록' : '목록';
      const 항 = l.replace(/^([-*]|\d+\.)\s+/, '').trim();
      const 끝 = B.내용.at(-1);
      if (끝?.[열]) 끝[열].push(항); else B.내용.push({ [열]: [항] });
      return;
    }
    문단줄.push(l);
  });
  닫기();
  return { 페이지, 오류 };
}

/* ─────────────────── ③ 예산 · 브라우저 없이 센다 ───────────────────
   렌더러의 확정높이() · 간격정하기() 를 원고 어휘로 옮긴 것이다. */
const 글자 = (s) => String(s).replace(/\*\*/g, '').length;
const 요소줄 = (e, 한줄) => {
  if (e.제목 != null || e.출처 != null) return 1;
  if (e.목록) return e.목록.length;
  if (e.번호목록) return e.번호목록.length;
  if (e.표) return e.표.행.length + (e.표.헤더 ? 1 : 0);
  if (e.비움) return e.비움[0];
  if (e.문단 != null) return Math.ceil(글자(e.문단) / 한줄);
  return 0;
};
const 박스줄 = (b, 한줄) =>
  b.내용.reduce((a, e) => a + 요소줄(e, 한줄), 0) +
  Math.max(0, b.내용.length - 1 - b.내용.filter((e) => e.출처 != null).length);

/* ─────────────────── ④ 형태 · 봉인본과 같은 모양인가 ─────────────────── */
const 몸인가 = (e) => e.제목 == null && e.출처 == null;
function 형태재기(페이지) {
  const 박스 = 페이지.flatMap((p) => p.박스);
  const 몸 = 박스.map((b) => b.내용.filter(몸인가).length);
  const 문단수 = 박스.map((b) => b.내용.filter((e) => e.문단 != null).length);
  const 길이 = 박스.flatMap((b) => b.내용.filter((e) => e.문단 != null).map((e) => 글자(e.문단)));
  const 몸전체 = 몸.reduce((a, b) => a + b, 0);
  const 중앙 = 길이.length ? [...길이].sort((a, b) => a - b)[길이.length >> 1] : 0;
  return {
    쪽: 페이지.length, 박스: 박스.length,
    쪽당박스: 박스.length / 페이지.length,
    박스몸최대: Math.max(0, ...몸), 박스몸평균: 몸전체 ? 몸전체 / 박스.length : 0,
    박스문단최대: Math.max(0, ...문단수),
    문단수: 길이.length, 문단비중: 몸전체 ? 길이.length / 몸전체 : 0,
    문단중앙: 중앙, 문단최장: Math.max(0, ...길이),
  };
}

/* ─────────────────── 봉인본 교정 ─────────────────── */
if (process.argv.includes('--봉인본')) {
  const 봉 = ['content/sokcho/실행계획서.json', 'content/gangneung/홍보전략브리프.json',
    'content/sokcho/사업장운영시뮬레이션.json'];
  const 몸열쇠 = ['문단', '목록', '번호목록', '표', '수치', '단계띠', '막대', '격자', '지도', '띠', '자리'];
  const 페이지 = [];
  for (const f of 봉) {
    const d = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    for (const p of d.면 ?? []) {
      const 박스 = [];
      for (const 행 of p.행 ?? []) for (const 열 of 행.열 ?? []) for (const b of 열.블록 ?? []) {
        const 내용 = [];
        if (b.라벨 != null) 내용.push({ 제목: b.라벨 });
        for (const el of b.내용 ?? []) for (const k of Object.keys(el)) {
          if (!몸열쇠.includes(k)) continue;
          if (k === '문단') (Array.isArray(el.문단) ? el.문단 : [el.문단])
            .forEach((t) => { if (typeof t === 'string') 내용.push({ 문단: t.replace(/\{[^}]*\}/g, '').trim() }); });
          else 내용.push({ [k]: el[k] });
        }
        박스.push({ 내용 });
      }
      페이지.push({ 번호: p.번호, 박스 });
    }
  }
  const m = 형태재기(페이지);
  console.log('\n봉인본 39쪽 · 관문 교정\n');
  const 줄 = [
    ['문단 하나 최장',   m.문단최장,   관문.문단최장.값,   (a, b) => a <= b, '자'],
    ['박스당 몸 요소 최대', m.박스몸최대, 관문.박스몸최대.값, (a, b) => a <= b, '개'],
    ['박스당 문단 최대',  m.박스문단최대, 관문.박스문단최대.값, (a, b) => a <= b, '개'],
    ['문단 비중',        m.문단비중,   관문.문단비중.값,   (a, b) => a <= b, '%'],
    ['박스당 몸 평균',    m.박스몸평균, 관문.박스몸평균.값, (a, b) => a <= b, '개'],
    ['문단 길이 중앙값',  m.문단중앙,   관문.문단중앙.값,   (a, b) => a <= b, '자'],
  ];
  let 샌것 = 0;
  console.log('기준                  봉인본     관문   판정');
  for (const [이름, 값, 선, 되나, 단위] of 줄) {
    const v = 단위 === '%' ? `${Math.round(값 * 100)}%` : `${(+값).toFixed(값 % 1 ? 1 : 0)}${단위}`;
    const s = 단위 === '%' ? `${Math.round(선 * 100)}%` : `${선}${단위}`;
    const ok = 되나(값, 선); if (!ok) 샌것++;
    console.log(`${이름.padEnd(20)}${v.padStart(7)}${s.padStart(9)}   ${ok ? '통과' : '✗ 관문이 틀렸다'}`);
  }
  console.log(`\n${샌것 ? '관문이 봉인본을 막는다 · 관문 값을 고쳐라' : '봉인본이 관문 여섯을 다 통과한다 · 관문이 옳다'}`);
  process.exit(샌것 ? 1 : 0);
}

/* ─────────────────── 본 검사 ─────────────────── */
const src = process.argv[2];
if (!src || src.startsWith('--')) {
  console.error('쓰기 : node scripts/원고검사.mjs <원고.md> [--json]   ·   --봉인본');
  process.exit(2);
}
const { 페이지, 오류 } = 읽기(fs.readFileSync(path.join(root, src), 'utf8'));
const doc = { 문서명: path.basename(src, '.md'), 페이지 };

/* ② 계약 · ③ 예산 */
const 예산 = JSON.parse(execFileSync('node', [path.join(root, 'scripts/예산.mjs'), '--json'],
  { encoding: 'utf8', maxBuffer: 1 << 24 }));
const 한줄표 = new Map(예산.칸.map((c) => [c.안폭, c.한줄]));

const 칸들 = [];
for (const p of 페이지) {
  let r;
  try { r = 영역({ ...p, 박스: [] }); }
  catch { 오류.push(`${p.번호}쪽 · 레이아웃 "${p.레이아웃}" 을 모른다 · G1 ~ G12 에서 고른다`); continue; }
  if (r.length !== p.박스.length) {
    오류.push(`${p.번호}쪽 · 레이아웃 ${p.레이아웃} 은 칸이 ${r.length}개인데 박스가 ${p.박스.length}개다`);
    continue;
  }
  p.박스.forEach((b, i) => {
    const w = r[i].w - pad * 2;
    칸들.push({ 쪽: p.번호, 박스: i + 1, 레이아웃: p.레이아웃, 안폭: w,
      예산: Math.floor((r[i].h - pad * 2) / 블록), 쓴줄: 박스줄(b, 한줄표.get(w) ?? 37) });
  });
}
try { render(doc, { css: '' }); }
catch (e) { 오류.push(`렌더러 · ${e.message}`); }

const 넘침 = 칸들.filter((c) => c.쓴줄 > c.예산);
const 헐렁 = 칸들.filter((c) => c.예산 - c.쓴줄 >= 3);
const m = 형태재기(페이지);
const 형태샌것 = [
  ['문단 하나가 너무 길다',   m.문단최장,   관문.문단최장,   '자'],
  ['한 박스에 몸 요소가 많다', m.박스몸최대, 관문.박스몸최대, '개'],
  ['한 박스에 문단이 많다',   m.박스문단최대, 관문.박스문단최대, '개'],
  ['문단 비중이 높다',       m.문단비중,   관문.문단비중,   '%'],
  ['박스당 몸 요소 평균이 높다', m.박스몸평균, 관문.박스몸평균, '개'],
  ['문단이 길다 · 중앙값',    m.문단중앙,   관문.문단중앙,   '자'],
].filter(([, 값, 기])  => 값 > 기.값);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ 문법오류: 오류, 칸: 칸들, 형태: m,
    형태샌것: 형태샌것.map(([이름, 값, 기]) => ({ 이름, 값, 관문: 기.값, 봉인본: 기.봉인본 })) }, null, 2));
  process.exit(오류.length || 넘침.length || 형태샌것.length ? 1 : 0);
}

console.log(`\n${src}\n페이지 ${페이지.length} · 박스 ${m.박스} · 요소 ${페이지.flatMap((p) => p.박스.flatMap((b) => b.내용)).length}\n`);
console.log(`① 문법 · ② 계약   ${오류.length ? `걸린 것 ${오류.length}건` : '통과'}`);
오류.forEach((e) => console.log(`     ${e}`));

console.log(`\n③ 예산   넘침 ${넘침.length} · 3줄 넘게 남은 칸 ${헐렁.length} / ${칸들.length}`);
if (넘침.length || 헐렁.length) {
  console.log('     쪽  박스  예산  쓴 줄  남은 줄');
  for (const c of [...넘침, ...헐렁])
    console.log(`     ${String(c.쪽).padEnd(4)}${String(c.박스).padStart(3)}${String(c.예산).padStart(7)}` +
      `${String(c.쓴줄).padStart(6)}${String(c.예산 - c.쓴줄).padStart(8)}   ` +
      (c.쓴줄 > c.예산 ? '넘쳤다' : '덜 채웠다'));
}

console.log(`\n④ 형태   봉인본 39쪽과 견준다`);
console.log('     기준                    이 원고      관문     봉인본');
const 낼것 = [
  ['문단 하나 최장',     m.문단최장,   관문.문단최장,   '자'],
  ['박스당 몸 요소 최대', m.박스몸최대, 관문.박스몸최대, '개'],
  ['박스당 문단 최대',   m.박스문단최대, 관문.박스문단최대, '개'],
  ['문단 비중',         m.문단비중,   관문.문단비중,   '%'],
  ['박스당 몸 평균',     m.박스몸평균, 관문.박스몸평균, '개'],
  ['문단 길이 중앙값',   m.문단중앙,   관문.문단중앙,   '자'],
];
for (const [이름, 값, 기, 단위] of 낼것) {
  const 꼴 = (v) => 단위 === '%' ? `${Math.round(v * 100)}%` : `${Number.isInteger(v) ? v : v.toFixed(1)}${단위}`;
  console.log(`     ${이름.padEnd(22)}${꼴(값).padStart(7)}${꼴(기.값).padStart(9)}     ${기.봉인본}` +
    (값 > 기.값 ? '   ✗' : ''));
}
console.log(`     쪽당 박스              ${m.쪽당박스.toFixed(1)}개                 4.0개`);

const 됐나 = !오류.length && !넘침.length && !형태샌것.length;
console.log(`\n${됐나 ? '통과 · 판면에 앉을 수 있는 원고다' :
  `불통과 · 문법 ${오류.length} · 넘침 ${넘침.length} · 형태 ${형태샌것.length}`}`);
process.exit(됐나 ? 0 : 1);
