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

import { inline, dk } from './inline.js';

const u = (n) => `calc(${n}*var(--u))`;
const mt = (n) => (n == null ? '' : ` style="margin-top:${u(n)}"`);

/* ───────────────────────── 표 ───────────────────────── */

// 열 속성 → td/th 클래스
function cellCls(col, { head = false } = {}) {
  const c = [];
  if (col?.정렬 === 'c') c.push('c');
  if (col?.정렬 === 'r') c.push('r');
  if (!head && col?.강조 === 'n') c.push('n');
  return c.length ? ` class="${c.join(' ')}"` : '';
}

function renderTable(t, name, 위여백) {
  const 열 = t.열 ?? [];
  const 밀도 = t.밀도 ? ` ${t.밀도}` : '';
  const o = [];

  o.push(`<table class="tb${밀도}"${dk(name)}${mt(위여백)}>`);

  if (열.length) {
    o.push('<colgroup>' +
      열.map((c) => (c?.폭 ? `<col style="width:${c.폭}">` : '<col>')).join('') +
      '</colgroup>');
  }

  if (t.머리) {
    o.push('<tr>' +
      t.머리.map((h, i) => `<th${cellCls(열[i], { head: true })}>${inline(h)}</th>`).join('') +
      '</tr>');
  }

  // 평면 행 — 배열이면 보통 행, {칸,강조:'sum'} 이면 남색 강조행
  for (const r of t.행 ?? []) {
    const 칸 = Array.isArray(r) ? r : r.칸;
    const cls = !Array.isArray(r) && r.강조 === 'sum' ? ' class="sum"' : '';
    o.push(`<tr${cls}>` +
      칸.map((v, i) => `<td${cellCls(열[i])}>${inline(v)}</td>`).join('') +
      '</tr>');
  }

  // 묶음 행 — 첫 열이 rowspan 으로 묶인다
  for (const g of t.묶음 ?? []) {
    const 항목 = g.항목 ?? [];
    항목.forEach((row, i) => {
      const cells = Array.isArray(row) ? row : [row];
      const head = i === 0
        ? `<td rowspan="${항목.length}" class="n">${inline(g.이름)}</td>`
        : '';
      o.push('<tr>' + head +
        cells.map((v, j) => `<td${cellCls(열[j + 1])}>${inline(v)}</td>`).join('') +
        '</tr>');
    });
  }

  if (t.합계) {
    o.push('<tr class="sum">' +
      t.합계.map((v, i) => `<td${cellCls(열[i])}>${inline(v)}</td>`).join('') +
      '</tr>');
  }

  o.push('</table>');
  return o.join('\n');
}

/* ─────────────────────── 블록 내용 ─────────────────────── */

function renderItem(it) {
  const 위여백 = it.위여백;
  const name = it.이름;

  if (it.목록) {
    return `<ul class="li"${dk(name)}${mt(위여백)}>` +
      it.목록.map((li) => `<li>${inline(li)}</li>`).join('') + '</ul>';
  }
  if (it.번호목록) {
    return `<ul class="li nb"${dk(name)}${mt(위여백)}>` +
      it.번호목록.map((li) => `<li>${inline(li)}</li>`).join('') + '</ul>';
  }
  if (it.문단 != null) {
    return `<p class="tx"${dk(name)}${mt(위여백)}>${inline(it.문단)}</p>`;
  }
  if (it.표) {
    return renderTable(it.표, name, 위여백);
  }
  throw new Error('알 수 없는 내용 유형: ' + JSON.stringify(Object.keys(it)));
}

/* ───────────────────────── 블록 ───────────────────────── */

function renderBlock(b, { 채움, 폭 = 1 }) {
  const 배경 = b.배경 ? ` ${b.배경}` : '';
  const flex = (b.채움 ?? 채움) ? ` style="flex:${폭}"` : '';
  const o = [`<div class="b${배경}"${flex}${dk(b.이름)}>`];
  if (b.라벨) o.push(`<div class="bl">${inline(b.라벨)}</div>`);
  if (b.제목) o.push(`<div class="bt">${inline(b.제목)}</div>`);
  for (const it of b.내용 ?? []) o.push(renderItem(it));
  o.push('</div>');
  return o.join('\n');
}

/* ───────────────────────── 면 ───────────────────────── */

function renderCol(col) {
  const blocks = col.블록 ?? [];
  const 폭 = col.폭 ?? 1;

  // 블록이 하나면 열 껍데기를 두지 않는다.
  // .col 로 감싸면 블록이 세로 플렉스 항목이 되어 min-height:auto 가 걸리고,
  // 내용이 열 높이를 넘을 때 원본(.row 직계)과 다르게 늘어난다.
  if (blocks.length === 1) {
    return renderBlock(blocks[0], { 채움: true, 폭 });
  }

  const inner = blocks
    .map((b, i) => renderBlock(b, { 채움: i === blocks.length - 1 }))
    .join('\n');
  return `<div class="col" style="flex:${폭}">\n${inner}\n</div>`;
}

function renderRow(row, { 채움 }) {
  const g = 채움 ? ' g' : '';
  return `<div class="row${g}">\n` +
    (row.열 ?? []).map(renderCol).join('\n') + '\n</div>';
}

function renderFoot(항목) {
  if (!항목?.length) return '';
  return `<div class="foot">
  <div class="pt">
    <div class="pl">실무 확인</div>
    <ul>${항목.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>
  </div>
</div>`;
}

export function renderPage(page, doc = {}) {
  const 행 = page.행 ?? [];
  const 하단 = page.하단 ?? [doc.문서명, page.번호].filter(Boolean).join(' · ');

  const stp = page.우측
    ? `<div class="stp"><span class="sn">${inline(page.우측.수치)}</span>` +
      `<span class="sl">${inline(page.우측.단위)}</span></div>`
    : '';

  return `<div class="sheet"><div class="page">
<div class="hd">
  <div class="num">${inline(page.번호)}</div>
  <div class="hi">
    <div class="goal">${inline(page.제목)}</div>
    ${page.메타 ? `<div class="meta">${inline(page.메타)}</div>` : ''}
  </div>
  ${stp}
</div>
<div class="bd">
${행.map((r, i) => renderRow(r, { 채움: i === 행.length - 1 })).join('\n')}
${renderFoot(page.실무확인)}
</div>
<div class="pgno">${inline(하단)}</div>
</div></div>`;
}

/* ───────────────────────── 문서 ───────────────────────── */

// css 를 주면 <style> 로 박는다 — 산출 HTML 이 자기완결이 되어
// 파일을 옮기든 메일로 보내든 판면이 깨지지 않는다. 이것이 기본이다.
// css 를 안 주면 <link> 로 건다 (규칙을 고치며 새로고침하는 개발용).
export function render(doc, { css, cssBase = '../../rules' } = {}) {
  const pages = (doc.면 ?? []).map((p) => renderPage(p, doc)).join('\n');
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
