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

function 색(값, 표, 열쇠, i, 갈래 = '도형') {
  if (값 == null || 값 === '없음') return null;
  if (Object.prototype.hasOwnProperty.call(표, 값)) return 표[값];
  if (typeof 값 === 'string' && HEX6.test(값)) return 값;
  throw new Error(
    `자리 ${i} 의 ${갈래} "${열쇠}" 값 ${JSON.stringify(값)} 을 모른다. ` +
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

/* ─────────────────── §N-배경 b · 표 ───────────────────
   설계 §4-2 · **표는 배경이다.** 글자가 먼저 있고 그 밑에 선과 칠이 깔린다.
   그래서 표는 「칸 안에 글자를 넣는 상자」가 아니라
   **글자 격자 + 그 사이에 놓인 선**이다 · 구조화된 구분선인 셈이다.

   ① 선은 **칸 사이**에만 놓는다. 칸 테두리가 아니다 — 구분선에서 배운 그대로다.
      바깥 테두리를 두르고 싶으면 그건 자리 「도형」이 할 일이다.
   ② 열은 골격이 쓰는 split() 을 그대로 쓴다. 거터 21 을 두고 **선은 그 한가운데**다.
      첫 열은 x 0 에서 시작하므로 표 밖 글줄과 왼쪽이 맞는다.
   ③ 행 높이는 42 의 배수다. 칸 안 글자가 표 밖 글줄과 같은 기준선에 앉는다.
   ④ 칠(셀 배경)은 「도형」과 같은 색 어휘를 쓴다. 새 색을 만들지 않는다.

   실물 50건 · 2열 21 · 3열 20 · 4열 8 · 9열 1 · 설계 §5-4.
   49건이 4열 이하라 split() 재사용으로 끝난다. 9열 1건은 예외로 따로 본다. */

const 표거터 = 21;
const 표선갈래 = { 가로: 'x', 격자: 'xy', 없음: '' };

/* 열 폭 — 갈래 둘을 받는다. **한 배열에 섞지 않는다.**

     ① 몫   [1, 2, 1]                       균등 트랙 몇 개를 먹느냐
     ② 백분율 ["25%","30%","15%","30%"]      거터를 뺀 나머지의 % · 합 100

   몫은 골격의 열자리() 가 2:1 을 다루는 방식과 같다. 폭 [2,1,1] 이면 4트랙을 나눠
   첫 열이 둘을 먹는다.

   **둘은 같은 물건이 아니다.** 몫으로 묶은 열은 **안쪽 거터까지 제가 먹는다** —
   안폭 1002 · 4열에서 30% 를 몫 [5,6,3,6](20트랙)으로 흉내 내면 285.9px 이고
   백분율로 주면 282px 이다. 그래서 백분율은 몫의 대체가 아니라 **더 가는 자**다.

   파일 머리 규칙은 「가로 분할은 split() 하나」다. **백분율이 그 규칙을 여는 자리다** ·
   사용자 판정 · N-배경 b3. split() 은 균등 트랙만 내므로 임의 백분율을 못 낸다.
   여는 대신 split() 이 지키던 것을 그대로 지킨다 —
   첫 열은 x 0 · 열 사이는 거터 21 · **마지막 열이 나머지 px 을 받아** 오른쪽 끝에 딱 맞는다.

   세로(채움)는 열지 않았다. 42 격자에 스냅되므로 백분율이 4.76%p 단위로 끊긴다 ·
   실물 표를 옮겨 보고 정한다. */

const 백분율 = /^(\d{1,3})%$/;

function 표열(폭, n, 표폭, i) {
  if (폭 == null) return split(0, 표폭, n, 표거터);
  if (!Array.isArray(폭) || 폭.length !== n) throw new Error(
    `자리 ${i} 의 표 "폭" 은 열 수(${n})와 같은 길이의 배열이어야 한다`);

  // ① 몫
  if (폭.every((v) => Number.isInteger(v))) {
    if (!폭.every((v) => v >= 1 && v <= 8)) throw new Error(
      `자리 ${i} 의 표 "폭" 을 몫으로 주면 1 ~ 8 사이 정수다 (받은 값 ${JSON.stringify(폭)})`);
    const 트랙 = split(0, 표폭, 폭.reduce((a, b) => a + b, 0), 표거터);
    const out = [];
    let k = 0;
    for (const w of 폭) {
      const a = 트랙[k], b = 트랙[k + w - 1];
      out.push({ x: a.x, w: b.x + b.w - a.x });
      k += w;
    }
    return out;
  }

  /* ② 백분율 — **마지막 열이 나머지를 다 받는다.**
     이 파일이 나머지를 다루는 규칙이 그것 하나다 · 사용자 판정 · N-배경 b4.
       split()  마지막 열이 end − x 를 받는다
       rows()   둘째 영역이 h − 걸음 을 받는다
     그래서 여기도 같다. **마지막 열에 적은 값은 안 읽는다** — 100 에서 앞을 뺀 것이
     마지막이다. 합이 99 든 101 이든 판은 어긋나지 않고 · 오른쪽 끝이 언제나 맞는다.
     막는 것은 하나뿐이다 · 앞 열들이 이미 100 을 넘겨 마지막에 남는 것이 없을 때. */
  if (폭.every((v) => typeof v === 'string' && 백분율.test(v))) {
    const 몫 = 폭.map((v) => Number(백분율.exec(v)[1]));
    const 앞 = 몫.slice(0, -1);
    if (!앞.every((v) => v >= 1 && v <= 99)) throw new Error(
      `자리 ${i} 의 표 "폭" 백분율은 1% ~ 99% 다 (받은 값 ${JSON.stringify(폭)})`);
    const 앞합 = 앞.reduce((a, b) => a + b, 0);
    if (앞합 > 99) throw new Error(
      `자리 ${i} 의 표 "폭" 은 마지막을 뺀 앞 열들 합이 ${앞합} 이다. ` +
      `마지막 열이 나머지를 받으므로 앞 열들 합은 99 이하여야 한다 (받은 값 ${JSON.stringify(폭)})`);
    몫[몫.length - 1] = 100 - 앞합;
    // 거터는 백분율 밖이다. 나눌 폭에서 먼저 뺀다 — 그래야 합 100 이 폭 전체를 덮는다
    const 남 = 표폭 - 표거터 * (n - 1);
    const out = [];
    let x = 0;
    몫.forEach((p, k) => {
      const w = k === n - 1 ? 표폭 - x : 반올림(남 * p / 100);
      out.push({ x, w });
      x += w + 표거터;
    });
    if (out.some((c) => c.w < 1)) throw new Error(
      `자리 ${i} 의 표 폭 ${JSON.stringify(폭)} 이 폭 ${표폭}px 에 안 들어간다. ` +
      `열을 줄이거나 작은 비율을 키운다`);
    return out;
  }

  throw new Error(
    `자리 ${i} 의 표 "폭" 은 몫 [1,2,1] 이거나 백분율 ["25%","75%"] 다. 한 배열에 섞지 않는다 ` +
    `(받은 값 ${JSON.stringify(폭)})`);
}

/* ─────────────────── §N-배경 b5 · 채움 · 세로 몫 ───────────────────
   가로가 「폭」이면 세로는 「채움」이다. **같은 어휘를 쓴다.**

     "채움": true                    칸이 고르게 나눠 갖는다 · 지금까지 그대로
     "채움": [1, 2, 1]               몫 · 칸마다 몇 몫이냐
     "채움": ["25%","30%","45%"]     백분율 · 마지막이 나머지를 받는다 (가로와 같다)
     "채움": [1, 1, 1, {"공백": 1}]   공백 · 칸이 아닌 빈 자리 · 칸 수에 안 든다

   **세로는 가로와 성질이 다르다 — 42 격자에 갇힌다.** 자리에 남은 높이가 909 면
   쓸 수 있는 것은 42 × 21 칸뿐이고 **한 칸이 4.76%p** 다. 그래서 백분율을 적어도
   그 언저리 42 배수로 앉는다. 정확히 셋으로 나누려면 백분율 말고 몫 [1,1,1] 을 쓴다.

   **남는 블록은 「공백」이 받는다.** 공백이 없으면 지금까지처럼 위아래로 가른다.
   가로의 「마지막이 받는다」를 그대로 옮기면 마지막 행만 84px 두꺼워져 표가 기운다 —
   세로의 나머지는 반올림 부스러기가 아니라 **42 덩어리**라서 그렇다 · 실측 · 사용자 판정.
   그래서 세로에서 나머지를 받는 자리는 공백이다. 공백이 여럿이면 **마지막 공백**이 받는다. */

const 공백몫 = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v.공백 : null);

function 채움나누기(채움, 칸수, 남은, i) {
  const T = Math.floor(남은 / 42);
  if (T < 칸수) throw new Error(
    `자리 ${i} 의 표가 "채움" 인데 칸 ${칸수}개가 들어갈 높이가 없다 ` +
    `(남은 높이 ${남은} · 칸마다 42 는 있어야 한다)`);

  let 슬롯;
  if (채움 === true) {
    슬롯 = Array.from({ length: 칸수 }, () => ({ 공백: false, 값: 1 }));
  } else {
    if (!Array.isArray(채움) || !채움.length) throw new Error(
      `자리 ${i} 의 표 "채움" 은 true 이거나 몫 배열이다 (받은 값 ${JSON.stringify(채움)})`);
    슬롯 = 채움.map((v) => {
      const g = 공백몫(v);
      return g == null ? { 공백: false, 값: v } : { 공백: true, 값: g };
    });
    const 칸슬롯 = 슬롯.filter((s) => !s.공백).length;
    if (칸슬롯 !== 칸수) throw new Error(
      `자리 ${i} 의 표 "채움" 에 칸이 ${칸슬롯}개다. 칸 수 ${칸수} 와 맞춘다 ` +
      `(공백은 칸 수에 안 든다 · 머리행도 한 칸이다)`);
  }

  /* 갈래 — 몫이냐 백분율이냐. **섞지 않는다.** 공백도 그 배열의 갈래를 따른다 */
  const 값 = 슬롯.map((s) => s.값);
  let 몫, 전체;
  if (값.every((v) => Number.isInteger(v))) {
    if (!값.every((v, k) => v >= (슬롯[k].공백 ? 0 : 1) && v <= 20)) throw new Error(
      `자리 ${i} 의 표 "채움" 몫은 1 ~ 20 사이 정수다 (공백은 0 도 된다 · 받은 값 ${JSON.stringify(채움)})`);
    몫 = 값;
    전체 = 값.reduce((a, b) => a + b, 0);
  } else if (값.every((v) => typeof v === 'string' && 백분율.test(v))) {
    const p = 값.map((v) => Number(백분율.exec(v)[1]));
    const 앞 = p.slice(0, -1);
    if (!앞.every((v) => v >= 0 && v <= 99)) throw new Error(
      `자리 ${i} 의 표 "채움" 백분율은 0% ~ 99% 다 (받은 값 ${JSON.stringify(채움)})`);
    /* 앞 칸들 합은 **100 까지** 받는다 — 가로(99 이하)와 다른 자리다.
       세로에서는 끝에 공백을 두는 것이 정상 쓰임이고 그때 칸들 합이 딱 100 이다.
       마지막이 0 이 되어도 칸은 아래에서 한 블록(42)을 보장받고 · 공백은 0 이어도 된다.
       그래서 가로처럼 99 로 막으면 「칸 100% + 끝 공백」이 못 쓰인다 · 실측으로 잡았다. */
    const 앞합 = 앞.reduce((a, b) => a + b, 0);
    if (앞합 > 100) throw new Error(
      `자리 ${i} 의 표 "채움" 은 마지막을 뺀 앞 칸들 합이 ${앞합} 이다. ` +
      `마지막이 나머지를 받으므로 앞 칸들 합은 100 이하여야 한다 (받은 값 ${JSON.stringify(채움)})`);
    p[p.length - 1] = 100 - 앞합;
    몫 = p;
    전체 = 100;
  } else {
    throw new Error(
      `자리 ${i} 의 표 "채움" 은 몫 [1,2,1] 이거나 백분율 ["30%","70%"] 다. 한 배열에 섞지 않는다 ` +
      `(받은 값 ${JSON.stringify(채움)})`);
  }

  // 칸은 적어도 한 블록(42) 을 갖는다. 공백은 0 이어도 된다
  const 블록 = 몫.map((w, k) =>
    Math.max(슬롯[k].공백 ? 0 : 1, Math.floor(T * w / 전체)));
  const 합 = 블록.reduce((a, b) => a + b, 0);
  if (합 > T) throw new Error(
    `자리 ${i} 의 표 "채움" ${JSON.stringify(채움)} 이 남은 높이 ${남은}px 에 안 들어간다 ` +
    `(42 × ${T} 칸을 쓸 수 있는데 ${합} 칸이 필요하다)`);

  // 남는 블록 — 마지막 공백이 받는다. 공백이 없으면 위아래로 가른다
  let 위로 = 0;
  const 남는 = T - 합;
  if (남는) {
    const 끝공백 = 슬롯.map((s, k) => (s.공백 ? k : -1)).filter((k) => k >= 0).pop();
    if (끝공백 != null) 블록[끝공백] += 남는;
    else 위로 = Math.floor(남는 / 2) * 42;
  }
  return { 슬롯: 슬롯.map((s, k) => ({ 공백: s.공백, h: 블록[k] * 42 })), 위로 };
}

function 표그리기(자리, i, 안폭, 안높이, 앞높이, 뒷높이, P) {
  const t = 자리.표;
  if (t == null) return '';
  if (typeof t !== 'object' || Array.isArray(t)) throw new Error(
    `자리 ${i} 의 "표" 는 객체여야 한다`);
  if (!Array.isArray(t.행) || !t.행.length) throw new Error(
    `자리 ${i} 의 표에 "행" 배열이 없다`);
  if (t.머리 != null && !Array.isArray(t.머리)) throw new Error(
    `자리 ${i} 의 표 "머리" 는 배열이어야 한다`);

  const n = t.머리?.length ?? t.행[0].length;
  for (const [j, 행] of t.행.entries()) {
    if (!Array.isArray(행)) throw new Error(`자리 ${i} 의 표 ${j + 1}행이 배열이 아니다`);
    if (행.length !== n) throw new Error(
      `자리 ${i} 의 표 ${j + 1}행이 ${행.length}칸이다. 열 수 ${n} 과 맞춘다`);
  }

  const 선 = t.선 ?? '가로';
  if (!Object.prototype.hasOwnProperty.call(표선갈래, 선)) throw new Error(
    `자리 ${i} 의 표 "선" 값 ${JSON.stringify(선)} 을 모른다. ` +
    `쓸 수 있는 값은 ${Object.keys(표선갈래).join(' · ')} 뿐이다`);
  const 축 = 표선갈래[선];

  const 열 = 표열(t.폭, n, 안폭, i);
  const 칸수 = t.행.length + (t.머리 ? 1 : 0);

  /* 칸 높이 — 기본은 한 줄 42 다. "채움" 이면 채움나누기() 가 정한다.
     배치[k] 는 k번째 칸의 { y, h } 다 · 공백은 여기 안 들어온다 — 자리만 먹는다. */
  const 배치 = [];
  let 위로 = 0, 높이 = 42 * 칸수;
  if (t.채움) {
    const r = 채움나누기(t.채움, 칸수, 안높이 - 앞높이 - 뒷높이, i);
    위로 = r.위로;
    let y = 0;
    for (const s of r.슬롯) { if (!s.공백) 배치.push({ y, h: s.h }); y += s.h; }
    높이 = y;
  } else {
    for (let k = 0; k < 칸수; k++) 배치.push({ y: k * 42, h: 42 });
  }

  /* 칠 — 셀 배경. **도형과 같은 색 어휘를 쓴다.** 새 색을 만들지 않는다.
     글자 밑에 깔리는 사각형이라 글줄 자리에 개입하지 않는다 · 설계 §4-2.
       "칠": { "머리": "블록배경", "행": [null, "#FDF6EC"] }
     행 배열은 짧아도 된다 — 없는 자리는 안 칠한다. */
  const 칠 = t.칠 ?? {};
  if (typeof 칠 !== 'object' || Array.isArray(칠)) throw new Error(
    `자리 ${i} 의 표 "칠" 은 객체여야 한다`);
  if (칠.행 != null && !Array.isArray(칠.행)) throw new Error(
    `자리 ${i} 의 표 "칠.행" 은 배열이어야 한다`);
  const 머리칠 = 색(칠.머리, 배경이름, '칠.머리', i, '표');
  const 행칠 = (칠.행 ?? []).map((v, j) => 색(v, 배경이름, `칠.행[${j}]`, i, '표'));

  const 칸 = [];
  const 줄 = [];
  const 바탕 = [];
  const 칠하기 = (c, y, h) => {
    if (!c) return;
    바탕.push(`<div class="tf" style="left:0;top:${y}px;width:${안폭}px;` +
      `height:${h}px;background:${c}"></div>`);
  };
  const 셀 = (글, 경로, x, w, y, h, 머리) =>
    `<div class="tc${머리 ? ' th' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"` +
    `${dp(경로)}>${inline(글)}</div>`;

  let k = 0;
  if (t.머리) {
    const { y, h } = 배치[k++];
    칠하기(머리칠, y, h);
    t.머리.forEach((글, c) => 칸.push(셀(글, [...P, '표', '머리', c], 열[c].x, 열[c].w, y, h, true)));
  }
  t.행.forEach((행, ri) => {
    const { y, h } = 배치[k++];
    칠하기(행칠[ri], y, h);
    행.forEach((글, c) => 칸.push(셀(글, [...P, '표', '행', ri, c], 열[c].x, 열[c].w, y, h, false)));
  });

  /* 가로선 — **칸 사이에만.** 표 위와 아래에는 안 긋는다.
     공백이 끼어 두 칸이 안 붙어 있으면 그 사이에는 선이 없다 —
     선은 맞닿은 두 칸을 가르는 것이지 빈 자리를 가르는 것이 아니다.
     그래서 공백은 「여기서 표를 끊는다」는 뜻도 된다. */
  if (축.includes('x')) {
    for (let j = 1; j < 칸수; j++) {
      const 위칸 = 배치[j - 1], 아래칸 = 배치[j];
      if (위칸.y + 위칸.h !== 아래칸.y) continue;
      const 굵 = t.머리 && j === 1;   // 머리행 아래만 진하게
      줄.push(`<div class="tl${굵 ? ' hd' : ''}" ` +
        `style="left:0;top:${아래칸.y}px;width:${안폭}px;height:1px"></div>`);
    }
  }
  // 세로선 — 열 사이 거터 한가운데. 첫 칸 위에서 마지막 칸 아래까지 · 공백까지 안 내려간다
  if (축.includes('y')) {
    const 위 = 배치[0].y;
    const 아래 = 배치[칸수 - 1].y + 배치[칸수 - 1].h;
    for (let j = 1; j < 열.length; j++) {
      const x = 열[j - 1].x + 열[j - 1].w + Math.floor((표거터 - 1) / 2);
      줄.push(`<div class="tl" style="left:${x}px;top:${위}px;width:1px;height:${아래 - 위}px"></div>`);
    }
  }

  /* 위 여백 — **인라인 margin-top 은 CSS 의 위계 간격을 덮어쓴다.**
     `.bt + .tb` · `.sm + .tb` 가 머리뒤 42 를 주는데 여기서 위로만 적으면
     그 42 가 사라져 표가 42px 위로 올라앉는다 · 실측 05면 top 126 → 84.
     앞높이가 0 이 아니면 머리뒤가 걸려 있다는 뜻이므로 그 42 를 같이 싣는다.
     기준선.mjs 는 84 도 126 도 42 배수라 이걸 못 잡는다 · scripts/자리재기.mjs 가 잡는다. */
  const 머리뒤 = 앞높이 ? 42 : 0;
  return `<div class="tb" style="height:${높이}px` +
    (위로 ? `;margin-top:${머리뒤 + 위로}px` : '') +
    `">${바탕.join('')}${줄.join('')}${칸.join('')}</div>`;
}

/* ─────────────────── 블록 ───────────────────
   제목 · 요약 · 문단 · 목록 · 표 · 단계띠 · 수치 · 출처. */

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
    const 있는것 = ['제목', '요약', '문단', '목록', '번호목록', '표', '단계띠', '수치', '출처', '도형']
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
  /* 표 — 「채움」을 계산하려면 앞에 놓인 것들의 높이를 알아야 한다.
     제목 · 요약 · 머리뒤는 42 로 확정이지만 문단 · 목록은 줄 수가 글자에 달렸다.
     그래서 채움은 **앞이 제목 · 요약뿐일 때만** 받는다. 나머지는 오류로 막는다 —
     모르는 값을 어림해서 격자를 깨뜨리느니 안 된다고 말하는 쪽이 낫다. */
  if (자리.표) {
    const 앞 = (자리.제목 ? 42 : 0) + (자리.요약 ? 42 : 0) +
      (자리.제목 || 자리.요약 ? 42 : 0);          // 머리뒤 한 칸
    /* 뒤에 오는 것도 자리를 먹는다 — 출처(.lb)는 28 + 위아래 7 = 42 · 앞 간격 0.
       이걸 안 빼면 채움이 자리를 꽉 채우고 출처가 밖으로 밀린다 ·
       실측 06면 15px 넘침 · scripts/자리재기.mjs 가 잡았다 */
    const 뒤 = 자리.출처 ? 42 : 0;
    if (자리.표.채움) {
      const 막는것 = ['문단', '목록', '번호목록', '단계띠', '수치']
        .filter((k) => 자리[k] != null);
      if (막는것.length) throw new Error(
        `자리 ${i} 의 표가 "채움" 인데 앞에 ${막는것.join(' · ')} 가 있다. ` +
        `줄 수를 미리 못 세서 남는 높이를 못 나눈다. 채움을 끄거나 제목 · 요약만 둔다`);
    }
    o.push(표그리기(자리, i, r.w - pad * 2, r.h - pad * 2, 앞, 뒤, P));
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

/* ─────────────────── §N-배경 a2 · doc.판면 폐기 ───────────────────
   `doc.판면` 은 아무 문자열이나 `.wrap` 에 꽂던 통로였다. 없앤다 · N2 §1-3.

   **N2 의 「구분선」은 안 넣는다** · 사용자 판정. 자리 테두리로 그리면
   거터 양쪽에 선이 둘 생기고 이웃 없는 바깥쪽에도 선이 그어져서 잘못이고 ·
   거터 한가운데 한 줄로 고쳐 그려 봐도 **개념이 골격에 묶여 있다.**
   선은 골격과 무관하게 **판에 얹는 요소**여야 한다 — 도형 · 그림과 같은 층이다.
   그래서 「선 얹기」로 다시 세운다 · 다음 페이즈 · 설계 §8.

   검사용 외곽선(`.dbg`)은 그대로 산다. 편집기 [블록] 토글이 켜고 · 문안에 안 남는다. */

/* ─────────────────── 문서 ───────────────────
   css 를 주면 <style> 로 박는다 — 산출 HTML 이 자기완결이 되어
   파일을 옮기든 메일로 보내든 판면이 깨지지 않는다. 이것이 기본이다.
   css 를 안 주면 <link> 로 건다 (규칙을 고치며 새로고침하는 개발용).

   기준선 자는 render(doc,{기준선:true}) 또는 doc.기준선 으로 켠다 → .wrap.bl */

export function render(doc, { css, cssBase = '../../rules', 도구: 표식 = false, 기준선 = false } = {}) {
  if (doc.판면 != null) throw new Error(
    `문서가 옛 열쇠 "판면" 을 쓴다. 검사용 외곽선은 편집기 [블록] 토글로 옮겼다 · ` +
    `문안에 남는 열쇠가 아니다`);
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
</head><body><div class="wrap${기준선 || doc.기준선 ? ' bl' : ''}">
${pages}
</div></body></html>`;
}

export default render;

// 검사용 — 관문에서 좌표표를 뽑을 때 쓴다
export const _규격 = { 판, 프레임, 헤더, 푸터, G, 여백기본, 프레임상단, 논지Y, 존, 존높이, 골격 };
export { split, rows, 열자리, 영역 };
