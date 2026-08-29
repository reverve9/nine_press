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

/* ─────────────────── §3-5 세로 정수 분할 ───────────────────
   둘째 영역의 시작을 기준선 42 의 배수로 민다. 그래야 위 영역과 아래 영역의
   글줄이 같은 선에 앉는다. 안 그러면 박스 둘인 열이 5px · 띠 둘이 18px 어긋난다.

   비율은 「걸음(영역 높이 + 거터)」에 적용하고 가장 가까운 42 배수로 반올림한다.
   실측으로 줄 예산은 안 바뀐다 — 밀리는 양이 42 미만이라 ⌊…/42⌋ 가 그대로다.

   가로 split() 과 달리 여기엔 「키노트 세팅 그대로」가 걸려 있지 않다. */

function rows(t, h, ratio, g = 43, 기준선 = 42) {   // ratio : '1:1' | '1:2' | '2:1'
  const [a, b] = ratio.split(':').map(Number);
  const 이상 = (h - g) * a / (a + b);              // 비율이 원하는 첫 영역 높이
  let 걸음 = Math.round((이상 + g) / 기준선) * 기준선;
  걸음 = Math.min(Math.max(걸음, 기준선 + g), h - 기준선);   // 두 영역 다 한 줄은 남긴다
  return [{ y: t, h: 걸음 - g }, { y: t + 걸음, h: h - 걸음 }];
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

/* ─────────────────── 빈 값 ───────────────────
   NBSP 를 공백으로 친다 — contenteditable 이 지우고 남기는 것이 이것이다. */

const 빔 = (t) => t == null || String(t).replace(/ /g, ' ').trim() === '';

/* ─────────────────── 도구 표식 ─────────────────── */

let 도구 = false;
const dp = (p) => (도구 && p ? ` data-p='${JSON.stringify(p)}'` : '');

/* ─────────────────── §N-배경 a1 · 도형 ───────────────────
   설계 §4-2 · **도형은 배경이다.** 텍스트가 먼저 있고 그 밑에 깔린다.
   그래서 도형은 글줄 자리에 개입하면 안 된다 — 테두리를 `border` 로 안 그리는 이유다 · 아래.

   색 이름은 키노트 세팅 §5 에 있는 것만 쓴다(N2 §2⑤). 그 밖의 색은 #RRGGBB 로 직접 준다.
   자유 hex 는 정규식으로 막는다 — 이 값이 style 속성 안으로 그대로 들어가기 때문이다. */

const 배경이름 = { 없음: null, 블록배경: '#F4F6F8' };
const 테두리이름 = { 없음: null, 선: '#E4E8EC', 강조: '#2D4D6E' };
// 그림자 · 투명도는 키노트 세팅 §5 도형표에 근거가 없다. 잠정값이다 · N2 §3-3
const 그림자이름 = {
  없음: null,
  약: '0 1px 3px rgba(19,27,43,.10)',
  중: '0 4px 16px rgba(19,27,43,.14)',
};
const HEX6 = /^#[0-9a-fA-F]{6}$/;

function 색(값, 표, 열쇠, i) {
  if (값 == null || 값 === '없음') return null;
  if (Object.prototype.hasOwnProperty.call(표, 값)) return 표[값];
  if (typeof 값 === 'string' && HEX6.test(값)) return 값;
  throw new Error(
    `자리 ${i} 의 도형 "${열쇠}" 값 ${JSON.stringify(값)} 을 모른다. ` +
    `쓸 수 있는 이름은 ${Object.keys(표).join(' · ')} 이고 · ` +
    `그 밖의 색은 #RRGGBB 여섯 자리로 준다 (#abc · rgb() · 색 이름은 안 된다)`);
}

// 그림자는 이름만 받는다 — 값이 색이 아니라 style 조각이라 hex 를 열어 줄 자리가 없다
function 이름만(값, 표, 열쇠, i) {
  if (값 == null || 값 === '없음') return null;
  if (Object.prototype.hasOwnProperty.call(표, 값)) return 표[값];
  throw new Error(
    `자리 ${i} 의 도형 "${열쇠}" 값 ${JSON.stringify(값)} 을 모른다. ` +
    `쓸 수 있는 이름은 ${Object.keys(표).join(' · ')} 뿐이다`);
}

function 정수(값, 기본, 아래, 위, 열쇠, i) {
  if (값 == null) return 기본;
  if (!Number.isInteger(값) || 값 < 아래 || 값 > 위) throw new Error(
    `자리 ${i} 의 도형 "${열쇠}" 값 ${JSON.stringify(값)} 은 ${아래} ~ ${위} 사이 정수여야 한다`);
  return 값;
}

/* 도형 style 조각. 아무것도 안 보이면 빈 문자열이다 — 안 보이는 반경을 적을 이유가 없다.

   **테두리를 `border` 로 안 그린다.** N2 §1-2 는 `border:1px solid` 로 지시했지만
   `.bx` 는 box-sizing:border-box 에 높이가 못박혀 있어 border 를 주면
   **안쪽 글줄이 통째로 1px 내려앉는다** · 실측 : 02면 세 자리의 제목 top 이 252 → 253.
   테두리를 준 자리만 이웃 자리와 첫 줄이 어긋나 · 설계 §4-3 이 담보하는
   「표 안 글줄과 표 밖 글줄이 가로로 맞는다」가 깨진다. 도형은 배경이지 상자가 아니다.
   `기준선.mjs` 는 자리 안쪽 여백을 원점으로 재므로 이 어긋남을 못 잡는다 · 눈과 자로 잡았다.
   `box-shadow: inset` 은 레이아웃을 안 건드리고 모서리 반경을 그대로 따라간다. */

function 도형(자리, i) {
  const s = 자리.도형;
  if (s == null) return '';
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error(
    `자리 ${i} 의 "도형" 은 객체여야 한다`);

  const 배경 = 색(s.배경, 배경이름, '배경', i);
  const 테두리 = 색(s.테두리, 테두리이름, '테두리', i);
  const 그림자 = 이름만(s.그림자, 그림자이름, '그림자', i);
  const 모서리 = 정수(s.모서리, 10, 0, 40, '모서리', i);
  const 투명도 = 정수(s.투명도, 100, 0, 100, '투명도', i);
  // 키노트 세팅 §5 도형표는 선 굵기를 1 로 못박는다. 기본값이 그 1 이다.
  // 굵혀도 글줄이 안 밀린다 — inset 그림자로 그리기 때문이다. 그래서 열어 둔다
  const 굵기 = 정수(s.굵기, 1, 1, 6, '굵기', i);

  if (!배경 && !테두리 && !그림자) return '';

  const out = [];
  if (배경) {
    // opacity 를 쓰지 않는다 — 자손까지 흐려져 24px 본문이 같이 죽는다.
    // 배경색 hex 에 알파 두 자리를 붙인다. 100 이면 안 붙인다
    const a = 투명도 === 100 ? '' :
      반올림(투명도 * 255 / 100).toString(16).toUpperCase().padStart(2, '0');
    out.push(`;background:${배경}${a}`);
  }
  if (모서리) out.push(`;border-radius:${모서리}px`);
  const 그늘 = [];
  if (테두리) 그늘.push(`inset 0 0 0 ${굵기}px ${테두리}`);
  if (그림자) 그늘.push(그림자);
  if (그늘.length) out.push(`;box-shadow:${그늘.join(',')}`);
  return out.join('');
}

/* ─────────────────── 블록 ───────────────────
   제목 · 요약 · 문단 · 목록 · 출처. 표 · 수치 · 지도는 뒤 페이즈다. */

function 블록(자리, r, i, 여백문서) {
  const pad = 자리.여백 ?? 여백문서;
  // 좌표 뒤에 도형을 이어 붙인다 · 순서 고정 · 도형이 없으면 좌표만 나온다
  const st = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px` +
    (pad !== 여백기본 || 자리.여백 != null ? `;padding:${pad}px` : '') + 도형(자리, i);
  const P = ['자리', i];
  // 글자 반전은 명시로만 켠다 — 밝기를 계산해 자동 판정하면 작성자가 결과를 못 읽는다
  if (자리.도형?.글자 != null && 자리.도형.글자 !== '반전') throw new Error(
    `자리 ${i} 의 도형 "글자" 값 ${JSON.stringify(자리.도형.글자)} 을 모른다. ` +
    `쓸 수 있는 값은 "반전" 뿐이다`);
  // 자리 번호는 도구 모드에서만 붙인다 — 편집기가 자리를 고르는 근거다. 출력에는 없다
  const o = [`<div class="bx" style="${st}"` +
    (자리.도형?.글자 === '반전' ? ` data-글자="반전"` : '') + dk(자리.이름) +
    (도구 ? ` data-자리="${i}"` : '') + `>`];

  /* 비워 두는 자리 — 키노트 · 파워포인트에서 채운다.
     판이 2339 × 1654 로 키노트 슬라이드와 같은 좌표계라 이 좌표를 그대로 쓸 수 있다.

     **출력에는 아무것도 안 나간다.** 표식은 도구 모드(편집기)에서만 그린다.
     그래야 산출 HTML · PDF 가 진짜로 비어 그 위에 덮어쓸 수 있다.
     좌표는 `node scripts/비움.mjs <문안>` 으로 표를 뽑는다. */
  if (자리.비움) {
    // 도형도 못 산다 — 비움은 「출력에 아무것도 안 나간다」가 계약이다 · 설계 §5-11
    const 있는것 = ['제목', '요약', '문단', '목록', '번호목록', '단계띠', '수치', '출처', '도형']
      .filter((k) => 자리[k] != null);
    if (있는것.length) throw new Error(
      `자리 ${i} 가 "비움" 인데 ${있는것.join(' · ')} 를 갖고 있다. 비울 거면 내용을 지운다`);
    if (도구) o.push(
      `<div class="emp"><span>${inline(typeof 자리.비움 === 'string' ? 자리.비움 : '비움')}</span>` +
      `<i>x ${r.x} · y ${r.y} · ${r.w} × ${r.h}</i></div>`);
    o.push('</div>');
    return o.join('');
  }
  // 순서 고정 — 제목(박스 타이틀) → 요약문 → 문단 → 목록 → 출처
  if (자리.제목) o.push(`<div class="bt"${dp([...P, '제목'])}>${inline(자리.제목)}</div>`);
  if (자리.요약) o.push(`<div class="sm"${dp([...P, '요약'])}>${inline(자리.요약)}</div>`);
  const 문단 = 자리.문단 == null ? [] : Array.isArray(자리.문단) ? 자리.문단 : [자리.문단];
  문단.forEach((t, j) => {
    if (빔(t)) return;
    o.push(`<div class="bd"${dp([...P, '문단', j])}>${inline(t)}</div>`);
  });
  // 목록 — 항목 하나가 편집 잎사귀 하나다. data-p 는 li 에 붙는다
  for (const [열쇠, 태그, cls] of [['목록', 'ul', 'ls'], ['번호목록', 'ol', 'ol']]) {
    if (자리[열쇠] == null) continue;
    if (!Array.isArray(자리[열쇠])) throw new Error(`자리 ${i} 의 "${열쇠}" 는 배열이어야 한다`);
    // 빈 항목은 안 낸다 — 글자는 지웠는데 마커만 남는 유령 항목을 만들지 않는다.
    // 인덱스는 원본 그대로 쓴다. 다시 매기면 data-p 가 배열과 어긋난다
    const 항목 = 자리[열쇠]
      .map((t, j) => (빔(t) ? '' : `<li${dp([...P, 열쇠, j])}>${inline(t)}</li>`))
      .join('');
    if (항목) o.push(`<${태그} class="${cls}">${항목}</${태그}>`);
  }
  // 단계띠 — 칸이 가로로 나뉘고 칸마다 「라벨 + 내용」이 세로로 앉는다.
  // "현재" 는 활성 칸 번호다 · 글자가 아니라 표식이라 data-p 를 안 붙인다
  if (자리.단계띠) {
    const 칸 = 자리.단계띠.칸 ?? [];
    if (칸.length) o.push(`<div class="sp">` + 칸.map((c, j) => {
      const [머리, 내용] = Array.isArray(c) ? c : [c, ''];
      return `<div class="s${j === 자리.단계띠.현재 ? ' on' : ''}">` +
        `<div class="sk"${dp([...P, '단계띠', '칸', j, 0])}>${inline(머리)}</div>` +
        (빔(내용) ? '' : `<div class="st"${dp([...P, '단계띠', '칸', j, 1])}>${inline(내용)}</div>`) +
        `</div>`;
    }).join('') + `</div>`);
  }
  // 수치 — 값(강조 수치 52) + 단위 한 줄 84 · 그 아래 라벨 42 → 한 칸 126
  if (자리.수치) {
    if (!Array.isArray(자리.수치)) throw new Error(`자리 ${i} 의 "수치" 는 배열이어야 한다`);
    const 칸 = 자리.수치.map((c, j) => {
      const [값, 단위, 라벨] = Array.isArray(c) ? c : [c, '', ''];
      if (빔(값)) return '';
      return `<div class="n"><div class="nv">` +
        `<span class="val"${dp([...P, '수치', j, 0])}>${inline(값)}</span>` +
        (빔(단위) ? '' : `<span class="unit"${dp([...P, '수치', j, 1])}>${inline(단위)}</span>`) +
        `</div>` +
        (빔(라벨) ? '' : `<div class="nk"${dp([...P, '수치', j, 2])}>${inline(라벨)}</div>`) +
        `</div>`;
    }).join('');
    if (칸) o.push(`<div class="nm">${칸}</div>`);
  }
  if (자리.출처) o.push(`<div class="lb"${dp([...P, '출처'])}>${inline(자리.출처)}</div>`);
  if (자리.라벨 != null) throw new Error(
    `자리 ${i} 가 옛 열쇠 "라벨" 을 쓴다. 박스 타이틀이면 "제목" · 출처 표기면 "출처" 로 바꾼다`);
  // 표식 없이 빈 자리 — 일부러 비운 것과 가른다. 도구 모드에서만 보인다
  if (도구 && o.length === 1) o.push(
    `<div class="emp warn"><span>빈 자리</span><i>일부러 비울 거면 "비움" 을 준다</i></div>`);
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

/* ─────────────────── §N-배경 a2 · 구분선 ───────────────────
   자리 테두리를 화면에서만 본다. **출력에 안 나간다** · 인쇄에서 강제로 끈다.
   켜면 도형을 죽이고 테두리만 남긴다 — 그 보기는 골격 확인용이다.
   끄면(기본) 미리보기가 곧 출력본이다.

   **검사용 외곽선(.dbg)과 다른 물건이다.** 목적이 갈린다 —
     .dbg   자리 · 밴드 · 안전영역을 다 본다   편집기 [블록] 토글이 켠다 · 문안에 안 남는다
     구분선  자리 테두리만 본다 · 도형을 죽인다  문서 열쇠다 · 문안에 남는다
   N2 §1-4 는 .dbg 를 지우고 구분선으로 갈아타라고 썼지만 그때는 .dbg 에 UI 가 없었다.
   지금은 사이드패널 토글로 쓰이고 있어 둘을 남긴다. 대신 N2 가 실제로 없애려던 것 —
   아무 문자열이나 .wrap 에 꽂던 doc.판면 — 은 없앤다. */

const 구분선갈래 = { 끔: '', 네변: 'sp4', 세로: 'spv', 가로: 'sph' };

function 구분선(doc) {
  const v = doc.구분선;
  if (v == null) return '';
  if (!Object.prototype.hasOwnProperty.call(구분선갈래, v)) throw new Error(
    `문서 "구분선" 값 ${JSON.stringify(v)} 을 모른다. ` +
    `쓸 수 있는 값은 ${Object.keys(구분선갈래).join(' · ')} 뿐이다`);
  return 구분선갈래[v] ? ' ' + 구분선갈래[v] : '';
}

/* ─────────────────── 문서 ───────────────────
   css 를 주면 <style> 로 박는다 — 산출 HTML 이 자기완결이 되어
   파일을 옮기든 메일로 보내든 판면이 깨지지 않는다. 이것이 기본이다.
   css 를 안 주면 <link> 로 건다 (규칙을 고치며 새로고침하는 개발용).

   기준선 자는 render(doc,{기준선:true}) 또는 doc.기준선 으로 켠다 → .wrap.bl */

export function render(doc, { css, cssBase = '../../rules', 도구: 표식 = false, 기준선 = false } = {}) {
  if (doc.판면 != null) throw new Error(
    `문서가 옛 열쇠 "판면" 을 쓴다. 검사용 외곽선은 편집기 [블록] 토글로 옮겼고 · ` +
    `자리 테두리는 "구분선" 이다 (끔 · 네변 · 세로 · 가로)`);
  const 갈래 = 구분선(doc);
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
</head><body><div class="wrap${갈래}${기준선 || doc.기준선 ? ' bl' : ''}">
${pages}
</div></body></html>`;
}

export default render;

// 검사용 — 관문에서 좌표표를 뽑을 때 쓴다
export const _규격 = { 판, 프레임, 헤더, 푸터, G, 여백기본, 프레임상단, 논지Y, 존, 존높이, 골격 };
export { split, rows, 열자리, 영역 };
