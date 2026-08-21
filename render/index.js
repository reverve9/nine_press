// nine_press · 렌더러 · N1 (키노트 세팅 기준)
//
// render(doc) → HTML 문자열. 프레임워크를 모른다.
// Next 라우트도 · CLI 스크립트도 · 챗 세션의 검증도 전부 이 함수를 부른다.
//
// 규칙
//   · 좌표는 전부 이 파일이 정수로 계산해 인라인 style 로 박는다
//   · CSS 는 모양만 맡는다. calc() 로 트랙을 만들지 않는다
//   · 가로 분할은 split() 하나 · 세로 분할은 rows() 하나. 그 밖의 계산식을 만들지 않는다
//   · 자리 개수가 골격이 만든 영역 수와 다르면 오류를 던지고 멈춘다
//
// 도구 표식 — 판면에는 아무 영향이 없다
//   data-p='["자리",0,"문단",1]'   글자 한 덩이가 JSON 어디에서 왔는지

import { inline, dk } from './inline.js';

/* ─────────────────── §3-1 판 · 밴드 · 전부 정수 px ─────────────────── */

const 판 = { w: 2339, h: 1654 };
const 프레임 = { x: 80, w: 2179, 하단: 1542 };
const 헤더 = { x: 80, y: 120, w: 2179, h: 65 };
const 푸터 = { x: 80, y: 1585, w: 2179, h: 33 };
const G = 43;            // 거터
const 여백기본 = 33;      // 블록 안쪽 여백 · 문서 기본값

const 카피높이 = 156;
const 논지높이 = 54;

// 헤더 높이가 프레임 상단을 끈다 : 본문 프레임 높이 = 1336 − 헤더 높이
const 프레임상단 = 프레임.하단 - (1336 - 헤더.h);           // 271

// 두 모드의 논지 · 블록 존
const 논지Y = {
  카피: 프레임상단 + 카피높이 + G,                          // 470
  연속: 프레임상단,                                        // 271
};
const 존 = {
  카피: 논지Y.카피 + 논지높이 + G,                          // 567
  연속: 논지Y.연속 + 논지높이 + G,                          // 368
};
const 존높이 = (모드) => 프레임.하단 - 존[모드];             // 975 · 1174

/* ─────────────────── 반올림 ───────────────────
   짝수 쪽 반올림 (half to even). 키노트 · Numbers 가 쓰는 방식이다.
   Math.round 는 .5 를 올림 방향으로 고정해 4열 경계 1746.5 를 1747 로 밀었다. */

function 반올림(v) {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return (f % 2 === 0) ? f : f + 1;
}

/* ─────────────────── §3-4 가로 정수 분할 ───────────────────
   경계를 반올림하고 폭을 경계에서 역산한다. 합이 언제나 정확히 2179 다.
   키노트 세팅 그대로다. 고치지 않는다. */

function split(start, total, n, g) {
  const w = (total - g * (n - 1)) / n, end = start + total, p = [], out = [];
  for (let i = 0; i < n; i++) p.push(반올림(start + i * (w + g)));
  for (let i = 0; i < n; i++) out.push({ x: p[i], w: (i < n - 1 ? p[i + 1] - g - p[i] : end - p[i]) });
  return out;
}

/* ─────────────────── §3-5 세로 정수 분할 ─────────────────── */

function rows(t, h, ratio, g = 43) {          // ratio : '1:1' | '1:2' | '2:1'
  const [a, b] = ratio.split(':').map(Number);
  const first = 반올림((h - g) * a / (a + b));
  return [{ y: t, h: first }, { y: t + first + g, h: h - g - first }];
}

/* ─────────────────── 열 폭 ───────────────────
   2:1 · 1:2 는 3열에서 병합한다. 별도 계산식을 만들지 않는다. */

function 열자리(n, 폭) {
  if (폭 == null || 폭 === '1:1') return split(프레임.x, 프레임.w, n, G);
  if (n !== 2) throw new Error(`열 폭 "${폭}" 은 2열에서만 쓴다 (받은 열 수 ${n})`);
  const s = split(프레임.x, 프레임.w, 3, G);
  const 짝 = 폭 === '2:1' ? [[0, 1], [2, 2]] : 폭 === '1:2' ? [[0, 0], [1, 2]] : null;
  if (!짝) throw new Error(`열 폭은 "1:1" · "2:1" · "1:2" 셋만 된다 (받은 값 "${폭}")`);
  return 짝.map(([a, b]) => ({ x: s[a].x, w: s[b].x + s[b].w - s[a].x }));
}

/* ─────────────────── §3-6 골격 열둘 ───────────────────
   띠 → 열 → 박스 3단. 박스가 둘인 열의 세로 비율 기본값은 1:1 이다. */

const 골격 = {
  G1:  { 이름: '전면',            띠: [{ 비율: 1, 열: [{ 박스: 1 }] }] },
  G2:  { 이름: '좌우 둘',          띠: [{ 비율: 1, 열: [{ 박스: 1 }, { 박스: 1 }] }] },
  G3:  { 이름: '3열',             띠: [{ 비율: 1, 열: [{ 박스: 1 }, { 박스: 1 }, { 박스: 1 }] }] },
  G4:  { 이름: '좌1 : 우2',        띠: [{ 비율: 1, 열: [{ 박스: 1 }, { 박스: 2 }] }] },
  G5:  { 이름: '상1 : 하2',        띠: [{ 비율: 1, 열: [{ 박스: 1 }] },
                                      { 비율: 2, 열: [{ 박스: 1 }, { 박스: 1 }] }] },
  G6:  { 이름: '4열',             띠: [{ 비율: 1, 열: [{ 박스: 1 }, { 박스: 1 }, { 박스: 1 }, { 박스: 1 }] }] },
  G7:  { 이름: '2 × 2',           띠: [{ 비율: 1, 열: [{ 박스: 2 }, { 박스: 2 }] }] },
  G8:  { 이름: '상3열 : 하전면',    띠: [{ 비율: 1, 열: [{ 박스: 1 }, { 박스: 1 }, { 박스: 1 }] },
                                      { 비율: 2, 열: [{ 박스: 1 }] }] },
  G9:  { 이름: '3열 · 박스 둘',     띠: [{ 비율: 1, 열: [{ 박스: 2 }, { 박스: 2 }, { 박스: 2 }] }] },
  G10: { 이름: '3열 · 2 · 1 · 2',  띠: [{ 비율: 1, 열: [{ 박스: 2 }, { 박스: 1 }, { 박스: 2 }] }] },
  G11: { 이름: '2열 폭 2:1',       띠: [{ 비율: 1, 폭: '2:1', 열: [{ 박스: 1 }, { 박스: 1 }] }] },
  G12: { 이름: '2열 폭 1:2',       띠: [{ 비율: 1, 폭: '1:2', 열: [{ 박스: 1 }, { 박스: 1 }] }] },
};

/* ─────────────────── 영역 생성 ───────────────────
   순서는 띠 → 열 → 박스. 자리 배열이 이 순서로 들어간다.

   면에 "비율" 을 주면 골격 기본값을 덮어쓴다
     { "띠": "1:2", "열": [null, "2:1"] }
   "열" 은 띠를 가로지르는 통짜 번호다 (띠 → 열 순서로 0 부터). */

function 영역(page) {
  const 모드 = page.모드 === '연속' ? '연속' : '카피';
  const 구성 = page.구성 ?? 골격[page.골격];
  if (!구성) throw new Error(`골격 "${page.골격}" 을 모른다. G1 ~ G12 또는 "구성" 을 준다`);

  const 띠 = 구성.띠 ?? [];
  if (!띠.length) throw new Error('구성에 띠가 없다');
  const 비율 = page.비율 ?? {};

  const zY = 존[모드], zH = 존높이(모드);
  let 띠자리;
  if (띠.length === 1) {
    띠자리 = [{ y: zY, h: zH }];
  } else if (띠.length === 2) {
    const r = 비율.띠 ?? `${띠[0].비율 ?? 1}:${띠[1].비율 ?? 1}`;
    띠자리 = rows(zY, zH, r, G);
  } else {
    throw new Error(`띠는 하나 또는 둘만 된다 (받은 수 ${띠.length})`);
  }

  const out = [];
  let ci = 0;                                    // 통짜 열 번호
  띠.forEach((band, bi) => {
    const b = 띠자리[bi];
    const 열 = band.열 ?? [];
    const cs = 열자리(열.length, band.폭);
    열.forEach((col, k) => {
      const n = col.박스 ?? 1;
      const r = 비율.열?.[ci] ?? col.비율 ?? '1:1';
      ci++;
      if (n === 1) {
        out.push({ x: cs[k].x, w: cs[k].w, y: b.y, h: b.h });
      } else if (n === 2) {
        for (const v of rows(b.y, b.h, r, G)) out.push({ x: cs[k].x, w: cs[k].w, y: v.y, h: v.h });
      } else {
        throw new Error(`한 열의 박스는 하나 또는 둘만 된다 (띠 ${bi} · 열 ${k} · 받은 수 ${n})`);
      }
    });
  });
  return out;
}

/* ─────────────────── 도구 표식 ─────────────────── */

let 도구 = false;
const dp = (p) => (도구 && p ? ` data-p='${JSON.stringify(p)}'` : '');

/* ─────────────────── 블록 ───────────────────
   라벨 · 제목 · 문단 셋만. 표 · 목록 · 수치 · 지도는 N3 이후다. */

function 블록(자리, r, i, 여백문서) {
  const pad = 자리.여백 ?? 여백문서;
  const st = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px` +
    (pad !== 여백기본 || 자리.여백 != null ? `;padding:${pad}px` : '');
  const P = ['자리', i];
  const o = [`<div class="bx" style="${st}"${dk(자리.이름)}>`];
  if (자리.라벨) o.push(`<div class="lb"${dp([...P, '라벨'])}>${inline(자리.라벨)}</div>`);
  if (자리.제목) o.push(`<div class="bt"${dp([...P, '제목'])}>${inline(자리.제목)}</div>`);
  const 문단 = 자리.문단 == null ? [] : Array.isArray(자리.문단) ? 자리.문단 : [자리.문단];
  문단.forEach((t, j) => o.push(`<div class="bd"${dp([...P, '문단', j])}>${inline(t)}</div>`));
  o.push('</div>');
  return o.join('');
}

/* ─────────────────── 면 ─────────────────── */

export function renderPage(page, doc = {}) {
  const 모드 = page.모드 === '연속' ? '연속' : '카피';
  const 여백문서 = doc.여백 ?? 여백기본;
  const rects = 영역(page);
  const 자리 = page.자리 ?? [];

  if (자리.length !== rects.length) {
    throw new Error(
      `면 ${page.번호 ?? '?'} · 골격 ${page.골격 ?? '구성'} 은 영역 ${rects.length} 개를 만드는데 ` +
      `자리는 ${자리.length} 개다. 개수를 맞춘다`);
  }

  const 카피 = 모드 === '카피' && page.카피
    ? `<div class="cp">` +
      (page.카피.메인 ? `<b class="cpm"${dp(['카피', '메인'])}>${inline(page.카피.메인)}</b>` : '') +
      (page.카피.서브 ? `<span class="cps"${dp(['카피', '서브'])}>${inline(page.카피.서브)}</span>` : '') +
      `</div>`
    : '';

  return `<div class="sheet"><div class="page" data-mode="${모드}">
<div class="hd"${dp(['제목'])}>${inline(page.제목)}</div>
${카피}
<div class="tt"${dp(['논지'])}>${inline(page.논지)}</div>
${rects.map((r, i) => 블록(자리[i], r, i, 여백문서)).join('\n')}
<div class="ft"><span class="fn">${inline(page.번호)}</span><span class="fd">${inline(doc.문서명 ?? '')}</span></div>
</div></div>`;
}

/* ─────────────────── 문서 ───────────────────
   css 를 주면 <style> 로 박는다 — 산출 HTML 이 자기완결이 되어
   파일을 옮기든 메일로 보내든 판면이 깨지지 않는다. 이것이 기본이다.
   css 를 안 주면 <link> 로 건다 (규칙을 고치며 새로고침하는 개발용).

   doc.판면 은 .wrap 에 그대로 붙는다. "판면":"dbg" 로 검사용 외곽선을 켠다. */

export function render(doc, { css, cssBase = '../../rules', 도구: 표식 = false } = {}) {
  도구 = 표식;
  let pages;
  try {
    pages = (doc.면 ?? []).map((p) => renderPage(p, doc)).join('\n');
  } finally {
    도구 = false;
  }
  const head = css
    ? `<style>\n${css}\n</style>`
    : `<link rel="stylesheet" href="${cssBase}/fonts.css">\n` +
      `<link rel="stylesheet" href="${cssBase}/page.css">`;
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${doc.문서명 ?? 'nine_press'}</title>
${head}
</head><body><div class="wrap${doc.판면 ? ' ' + doc.판면 : ''}">
${pages}
</div></body></html>`;
}

export default render;

// 검사용 — 관문에서 좌표표를 뽑을 때 쓴다
export const _규격 = { 판, 프레임, 헤더, 푸터, G, 여백기본, 프레임상단, 논지Y, 존, 존높이, 골격 };
export { split, rows, 열자리, 영역 };
