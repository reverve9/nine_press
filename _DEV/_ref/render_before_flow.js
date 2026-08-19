// nine_press · 렌더러
//
// render(doc) → HTML 문자열.  프레임워크를 모른다.
// Next 라우트도, CLI 스크립트도, 챗 세션의 검증도 전부 이 함수를 부른다.
//
// 규칙
//   · 좌표와 높이를 데이터에 적지 않는다. 규칙(CSS)이 계산한다
//   · 블록 폭은 1 / 2 / 3 정수만. 소수 비율을 쓰지 않는다
//   · 열의 마지막 블록이 남는 높이를 채운다 (블록에 "채움":false 로 해제)
//   · 면의 마지막 행이 남는 높이를 채운다
//
// 도구가 쓰는 표식 두 가지 — 판면에는 아무 영향이 없다
//   data-b="행-열-블록"   블록 좌표
//   data-p='["행",0,…]'   글자 한 덩이가 JSON 어디에서 왔는지. 제자리 수정의 통로

import { inline, dk } from './inline.js';

const u = (n) => `calc(${n}*var(--u))`;
const mt = (n) => (n == null ? '' : ` style="margin-top:${u(n)}"`);
// 도구 표식은 미리보기에서만 붙인다 — 산출 HTML 에 내부 경로를 흘리지 않는다.
// render() 진입에서 켜고 끈다. 렌더는 동기 · 단일 호출이라 이 방식으로 충분하다.
let 도구 = false;
const dp = (p) => (도구 && p ? ` data-p='${JSON.stringify(p)}'` : '');
const db = (v) => (도구 && v ? ` data-b="${v}"` : '');

/* ───────────────────────── 표 ───────────────────────── */

function cellCls(col, { head = false } = {}) {
  const c = [];
  if (col?.정렬 === 'c') c.push('c');
  if (col?.정렬 === 'r') c.push('r');
  if (!head && col?.강조 === 'n') c.push('n');
  return c.length ? ` class="${c.join(' ')}"` : '';
}

function renderTable(t, name, 위여백, P) {
  const 열 = t.열 ?? [];
  const 밀도 = t.밀도 ? ` ${t.밀도}` : '';
  const o = [];
  const T = P ? [...P, '표'] : null;

  o.push(`<table class="tb${밀도}"${dk(name)}${mt(위여백)}>`);

  if (열.length) {
    o.push('<colgroup>' +
      열.map((c) => (c?.폭 ? `<col style="width:${c.폭}">` : '<col>')).join('') +
      '</colgroup>');
  }

  if (t.머리) {
    o.push('<tr>' +
      t.머리.map((h, i) =>
        `<th${cellCls(열[i], { head: true })}${dp(T && [...T, '머리', i])}>${inline(h)}</th>`).join('') +
      '</tr>');
  }

  for (const [ri, r] of (t.행 ?? []).entries()) {
    const 배열행 = Array.isArray(r);
    const 칸 = 배열행 ? r : r.칸;
    const cls = !배열행 && r.강조 === 'sum' ? ' class="sum"' : '';
    const rp = T ? (배열행 ? [...T, '행', ri] : [...T, '행', ri, '칸']) : null;
    o.push(`<tr${cls}>` +
      칸.map((v, i) => `<td${cellCls(열[i])}${dp(rp && [...rp, i])}>${inline(v)}</td>`).join('') +
      '</tr>');
  }

  for (const [gi, g] of (t.묶음 ?? []).entries()) {
    const 항목 = g.항목 ?? [];
    항목.forEach((row, i) => {
      const cells = Array.isArray(row) ? row : [row];
      const rp = T
        ? (Array.isArray(row) ? [...T, '묶음', gi, '항목', i] : [...T, '묶음', gi, '항목'])
        : null;
      const head = i === 0
        ? `<td rowspan="${항목.length}" class="n"${dp(T && [...T, '묶음', gi, '이름'])}>${inline(g.이름)}</td>`
        : '';
      o.push('<tr>' + head +
        cells.map((v, j) =>
          `<td${cellCls(열[j + 1])}${dp(rp && (Array.isArray(row) ? [...rp, j] : [...rp, i]))}>${inline(v)}</td>`,
        ).join('') +
        '</tr>');
    });
  }

  if (t.합계) {
    o.push('<tr class="sum">' +
      t.합계.map((v, i) => `<td${cellCls(열[i])}${dp(T && [...T, '합계', i])}>${inline(v)}</td>`).join('') +
      '</tr>');
  }

  o.push('</table>');
  return o.join('\n');
}

/* ─────────────────────── 블록 내용 ─────────────────────── */

function renderItem(it, P) {
  const 위여백 = it.위여백;
  const name = it.이름;

  for (const key of ['목록', '번호목록']) {
    if (!it[key]) continue;
    const cls = key === '목록' ? 'li' : 'li nb';
    return `<ul class="${cls}"${dk(name)}${mt(위여백)}>` +
      it[key].map((li, k) => `<li${dp(P && [...P, key, k])}>${inline(li)}</li>`).join('') +
      '</ul>';
  }
  if (it.문단 != null) {
    return `<p class="tx"${dk(name)}${mt(위여백)}${dp(P && [...P, '문단'])}>${inline(it.문단)}</p>`;
  }
  if (it.표) {
    return renderTable(it.표, name, 위여백, P);
  }
  throw new Error('알 수 없는 내용 유형: ' + JSON.stringify(Object.keys(it)));
}

/* ───────────────────────── 블록 ───────────────────────── */

function renderBlock(b, { 채움, 폭 = 1, 좌표, P }) {
  const 배경 = b.배경 ? ` ${b.배경}` : '';
  // --w 는 3열 균등 고정 규칙(.row.g)이 폭을 읽는 통로다. flex 만으로는 폭이 지워진다.
  const flex = (b.채움 ?? 채움) ? ` style="flex:${폭};--w:${폭}"` : ` style="--w:${폭}"`;
  const o = [`<div class="b${배경}"${flex}${dk(b.이름)}${db(좌표)}>`];

  // 블록 머리는 라벨 하나다 (§7 판정 ⑤ — .bt 폐기).
  // 옛 문안의 `제목` 은 라벨로 받아 준다.
  const 머리 = b.라벨 ?? b.제목;
  if (머리) o.push(`<div class="bl"${dp(P && [...P, '라벨'])}>${inline(머리)}</div>`);

  (b.내용 ?? []).forEach((it, ii) => o.push(renderItem(it, P && [...P, '내용', ii])));
  o.push('</div>');
  return o.join('\n');
}

/* ───────────────────────── 면 ───────────────────────── */

function renderCol(col, ci = 0, ri = 0) {
  const blocks = col.블록 ?? [];
  const 폭 = col.폭 ?? 1;
  const P = (bi) => ['행', ri, '열', ci, '블록', bi];

  // 블록이 하나면 열 껍데기를 두지 않는다.
  // .col 로 감싸면 블록이 세로 플렉스 항목이 되어 min-height:auto 가 걸리고,
  // 내용이 열 높이를 넘을 때 원본(.row 직계)과 다르게 늘어난다.
  if (blocks.length === 1) {
    return renderBlock(blocks[0], { 채움: true, 폭, 좌표: `${ri}-${ci}-0`, P: P(0) });
  }

  const inner = blocks
    .map((b, i) => renderBlock(b, { 채움: i === blocks.length - 1, 좌표: `${ri}-${ci}-${i}`, P: P(i) }))
    .join('\n');
  return `<div class="col" style="flex:${폭};--w:${폭}">\n${inner}\n</div>`;
}

function renderRow(row, { 채움, ri = 0 }) {
  const g = 채움 ? ' g' : '';
  return `<div class="row${g}">\n` +
    (row.열 ?? []).map((c, ci) => renderCol(c, ci, ri)).join('\n') + '\n</div>';
}

function renderFoot(항목) {
  if (!항목?.length) return '';
  return `<div class="foot"${db('head')}>
  <div class="pt">
    <div class="pl">실무 확인</div>
    <ul>${항목.map((li, k) => `<li${dp(['실무확인', k])}>${inline(li)}</li>`).join('')}</ul>
  </div>
</div>`;
}

export function renderPage(page, doc = {}) {
  const 행 = page.행 ?? [];
  const 하단 = page.하단 ?? [doc.문서명, page.번호].filter(Boolean).join(' · ');

  return `<div class="sheet"><div class="page">
<div class="hd"${db('head')}>
  <div class="num">${inline(page.번호)}</div>
  <div class="hi">
    <div class="goal"${dp(['제목'])}>${inline(page.제목)}</div>
    ${page.메타 ? `<div class="meta"${dp(['메타'])}>${inline(page.메타)}</div>` : ''}
  </div>
</div>
<div class="bd">
${행.map((r, i) => renderRow(r, { 채움: i === 행.length - 1, ri: i })).join('\n')}
${renderFoot(page.실무확인)}
</div>
<div class="pgno">${inline(하단)}</div>
</div></div>`;
}

/* ───────────────────────── 문서 ───────────────────────── */

// css 를 주면 <style> 로 박는다 — 산출 HTML 이 자기완결이 되어
// 파일을 옮기든 메일로 보내든 판면이 깨지지 않는다. 이것이 기본이다.
// css 를 안 주면 <link> 로 건다 (규칙을 고치며 새로고침하는 개발용).
export function render(doc, { css, cssBase = '../../rules', 도구: 표식 = false } = {}) {
  도구 = 표식;
  const pages = (doc.면 ?? []).map((p) => renderPage(p, doc)).join('\n');
  도구 = false;
  const head = css
    ? `<style>\n${css}\n</style>`
    : `<link rel="stylesheet" href="${cssBase}/fonts.css">\n` +
      `<link rel="stylesheet" href="${cssBase}/page.css">`;
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${doc.문서명 ?? 'nine_press'}</title>
${head}
</head><body><div class="wrap">
${pages}
</div></body></html>`;
}

export default render;
