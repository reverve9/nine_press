'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 빌드, PDF, 문안저장, 문안불러오기 } from '../actions.js';
import { render, 영역, _규격 } from '../../render/index.js';
import { 구간토큰, 원문, 구간칠, 색토큰인가, HEX6 } from '../../render/inline.js';

// 판면 픽셀 — render/index.js 의 판 · rules/page.css 의 --판W/--판H 와 같은 값이어야 한다.
// 2340 으로 1px 넓게 잡혀 있어 미리보기 오른쪽에 투명 띠 1px 이 남았다.
const W = 2339;
const H = 1654;

/* NBSP 를 공백으로 친다 — contenteditable 이 다 지우고 남기는 것이 이것이다 */
const 빔 = (v) => v == null || String(v).replace(/ /g, ' ').trim() === '';

/* 배열 잎사귀(문단 · 목록 항목)를 비우면 그 원소를 뺀다.
   안 그러면 글자만 사라지고 마커와 빈 줄이 유령으로 남는다.
   되돌리기 스택에는 그대로 쌓이므로 ⌘Z 로 되살릴 수 있다. */
function 쓰기(o, p, v) {
  const 부모 = p.slice(0, -1).reduce((a, k) => a[k], o);
  const 열쇠 = p[p.length - 1];
  // 값을 돌려주지 않는다 — 바꾸기() 가 false 를 「취소」로 읽는다
  if (Array.isArray(부모) && 빔(v)) { 부모.splice(열쇠, 1); return; }
  부모[열쇠] = v;
}

/* 렌더러가 던진 오류를 판 박스에 그린다 — 화면을 죽이지 않는다.
   옛 12칸 트랙 문안 넷은 새 렌더러가 못 그린다. 골라도 앱이 살아 있어야 한다.
   그리는 법은 봉인본으로만 된다 · node scripts/build.js <문안> --v3 */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function 오류판(doc, i, e) {
  const 옛체계 = /구성에 띠가 없다|레이아웃 "undefined"|옛 열쇠 "판면"/.test(e.message);
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>
body{margin:0;padding:0;background:transparent;
  font-family:'Pretendard Variable',Pretendard,'Noto Sans KR',sans-serif}
.er{width:${W}px;height:${H}px;background:#fff;box-sizing:border-box;padding:120px 160px;
  display:flex;flex-direction:column;justify-content:center;gap:34px;color:#1a1a1a}
.er h1{margin:0;font-size:64px;font-weight:800;color:#E68100;letter-spacing:-.015em}
.er p{margin:0;font-size:34px;line-height:1.6;color:#39434f}
.er code{font-size:32px;background:#F4F6F8;border-radius:6px;padding:4px 12px;color:#131B2B}
.er .m{font-size:41px;font-weight:700;color:#131B2B;line-height:1.5}
.er .s{font-size:28px;color:#8792a0;letter-spacing:.06em}
</style></head><body><div class="er">
<h1>이 페이지는 못 그린다</h1>
<div class="m">${esc(e.message)}</div>
<p class="s">${esc(doc?.문서명 ?? '')} · ${i + 1}번째 페이지</p>
${옛체계 ? `<p><b>옛 12칸 트랙 문안이다.</b> 새 렌더러가 못 읽는다.<br>
봉인본으로만 그려진다 · <code>node scripts/build.js &lt;문안&gt; --v3</code></p>` : ''}
</div></body></html>`;
}

/* 새 페이지의 박스는 **진짜로 비운다** · 사용자 판정.
   전에는 `{제목:'박스'}` 를 넣었는데 그건 도구 표식이 아니라 **진짜 글**이라
   안 지우면 산출 PDF 에 「박스」가 그대로 찍힌다. 게다가 글이 하나 들어 있으니
   렌더러의 빈 박스 표식(.emp warn · 빗금)이 안 떠서 「채워야 할 자리」라는 신호도 꺼진다.
   판면을 갈아 칸이 늘 때 붙는 박스와도 꼴이 달라 한 화면에 두 종류가 떴다. */
const 새페이지 = (번호) => ({
  번호, 제목: '새 페이지', 모드: '카피',
  카피: { 메인: '', 서브: '' }, 요지: '',
  레이아웃: 'G2', 박스: [{ 내용: [] }, { 내용: [] }],
});

const 도형배경들 = [
  ['', '없음', null],
  ['블록배경', '블록배경 F4F6F8', '#F4F6F8'],
];
const 도형테두리들 = [['', '없음', null], ['선', '선 E4E8EC', '#E4E8EC'], ['강조', '강조 2D4D6E', '#2D4D6E']];
const 도형그림자들 = [['', '없음'], ['약', '약'], ['중', '중']];
/* 단계띠는 폐기했다 · N-자유 b. 칸마다 라벨 + 내용이 앉는 띠는 앱이 안 그린다 —
   그 높이를 요소 「비움」으로 남겨 두고 키노트가 그 좌표 위에 그린다 */
/* 그림 · N-그림 — 렌더러의 그림그리기() 가 받는 것과 같아야 한다.
   높이 갈래는 표와 같은 어휘다(§N-배경 b7). 다만 그림은 하나뿐이라 「칸수」이 없다 —
   나눌 상대가 없어서 정수는 곧 블록 수다. */
/* ── 요소 · N-자유 ────────────────────────────────────
   박스 안이 배열이 되었다. 도구는 **언제나 배열로 쓴다** —
   옛 꼴(열쇠 뭉치)은 읽기만 하고 · 손대는 순간 접어서 배열로 옮긴다.
   렌더러의 내용읽기() 가 접는 순서와 **같아야 한다** · render/index.js §N-자유. */
const 요소갈래들 = ['제목', '요약', '문단', '목록', '번호목록', '표', '수치', '그림', '빈칸', '비움', '출처'];
/* 접을 때 박스에서 지우는 열쇠 — **「여백」을 뺀다.**
   박스의 「여백」은 안쪽 패딩이고 요소의 「여백」은 42 덩이 빈 칸이다. 이름만 같은 남이다.
   같이 지우면 접는 순간 박스 패딩이 문서 기본값으로 돌아간다 · 렌더러도 같은 예외를 둔다 */
/* 접을 때 박스에서 지우는 열쇠 — **「비움」을 뺀다.**
   박스 「비움」은 박스를 통째로 넘기고 요소 「비움」은 그 높이만 넘긴다. 이름만 같은 남이다.
   여백은 이제 안 겹친다 — 박스는 「안여백」 · 요소는 「빈칸」이다 · N-자유 e */
const 박스내용열쇠 = 요소갈래들.filter((k) => k !== '비움');
// 요소를 새로 놓을 때 들어가는 값. 그림은 경로가 있어야 살아서 여기서 안 만든다
const 새요소값 = {
  제목: () => '제목', 요약: () => '요약', 문단: () => '문단',
  목록: () => ['항목', '항목'], 번호목록: () => ['항목', '항목'],
  표: () => 새표(),
  수치: () => [['0', '건', '라벨']],
  빈칸: () => 1, 비움: () => [2, ''], 출처: () => '출처',
};

/* 옛 꼴 박스를 내용 배열로 접는다. 순서는 렌더러와 같다 */
function 박스접기(z) {
  const out = [];
  if (z.제목) out.push({ 제목: z.제목 });
  if (z.요약) out.push({ 요약: z.요약 });
  if (z.문단 != null) {
    (Array.isArray(z.문단) ? z.문단 : [z.문단]).forEach((t) => {
      if (String(t ?? '').trim()) out.push({ 문단: t });
    });
  }
  for (const k of ['목록', '번호목록', '표', '수치', '그림']) {
    if (z[k] != null) out.push({ [k]: z[k] });
  }
  if (z.출처) out.push({ 출처: z.출처 });
  return out;
}

/* ── 글자 · N-글자 c ──────────────────────────────────
   계획의 마지막 기능이다. 판면에서 두 번 눌러 글자를 바꾸는 것은 됐지만
   **계층을 바꾸거나 크기를 고칠 수 없었다** — 문단을 제목으로 올리려면
   JSON 을 손으로 열어야 했다. 셋으로 막는다 · 계층 · 크기 · 굵게.

   **행간은 안 연다.** 언제나 42 배수다 · 여기만 잠그면 격자가 깨질 방법이 없다.
   크기는 자유 숫자가 아니라 계단이다 · 렌더러의 크기계단과 **같아야 한다**.
   굵게는 새로 만들 것이 없다 — `**굵게**` 는 inline() 이 이미 읽고 원문() 이 되돌린다. */
const 글자갈래들 = ['제목', '요약', '문단', '목록', '번호목록', '출처'];
/* 구간 판이 뜨는 갈래 · N-글자 e. 글자를 담는 것만이다 —
   표 칸 · 수치 값도 판면에서 고쳐 쓰는 글자라 같이 받는다.
   **그림 · 빈칸 · 비움에는 안 뜬다** · 글자가 없는데 글자 판이 뜨면
   그림을 골랐는데 우측이 텍스트 판으로 보인다 · 사용자 지적 */
const 구간갈래 = new Set([...글자갈래들, '표', '수치']);
const 배열갈래 = new Set(['목록', '번호목록']);
const 크기계단 = [21, 24, 26, 29];

/* 구간 스타일 토큰 · N-글자 d — **표는 `render/inline.js` 가 정본이다.**
   여기서 다시 적으면 둘이 갈라진다 · 뒤집어서 「토큰 → 갈래」만 만든다.
   갈래를 아는 이유 하나 · **한 갈래에서 토큰 하나만 산다**(색 둘을 겹치지 않는다) */
const 구간갈래들 = Object.entries(구간토큰);
const 토큰갈래표 = new Map(구간갈래들.flatMap(([갈래, 목록]) => 목록.map((t) => [t, 갈래])));
const 토큰갈래 = (t) => 토큰갈래표.get(t) ?? (HEX6.test(t) ? '색' : null);
// 색 견본 · 이름 여섯에 실제 색을 물린다 · rules/page.css 「색 7」과 같아야 한다
const 구간색값 = { 먹: '#1a1a1a', 네이비: '#131B2B', 강조: '#2D4D6E',
                   결론: '#E68100', 부연: '#6b7784', 출처: '#8792a0' };

/* 요소 한 줄 맛보기 — **판을 안 보고도 순서를 옮길 수 있어야 한다** ·
   app/globals.css `.elrow`. 갈래마다 한 줄로 줄인다 · 표기는 그대로 둔다.
   길이는 CSS 가 말줄임으로 자르므로 여기서 안 자른다 · 줄바꿈만 눕힌다. */
const 한줄 = (v) => String(v ?? '').replace(/\r\n?|\n/g, ' ');
/* 계층을 갈아탈 때 값을 나르는 법 · 계층바꾸기() 가 쓴다.
   글 ↔ 목록은 **줄바꿈으로 가르고 줄바꿈으로 잇는다.** 판면에서 Enter 로 넣는 것이
   줄바꿈이고 문안에도 `\n` 으로 앉으니 그 하나를 경계로 쓴다.
   빈 항목은 안 남긴다 — 마커만 뜬 유령 항목이 되기 때문이다 · 렌더러도 같이 버린다.
   다 버려서 빈 배열이 되면 빈 항목 하나를 남긴다 · 요소가 통째로 사라지면 안 고른다 */
export function 계층값(v, 옛열쇠, 새열쇠) {
  if (!배열갈래.has(새열쇠)) return 배열갈래.has(옛열쇠) ? (v ?? []).join('\n') : v;
  if (배열갈래.has(옛열쇠)) return v;
  const 항목 = String(v ?? '').split(/\r\n?|\n/).filter((t) => !빔(t));
  return 항목.length ? 항목 : [''];
}
function 맛보기(el, k) {
  if (el == null || k == null) return '';
  const v = el[k];
  switch (k) {
    case '목록': case '번호목록':
      return `${(v ?? []).length}항목 · ${한줄(v?.[0])}`;
    case '표': {
      const 열 = v?.헤더?.length ?? v?.행?.[0]?.length ?? 0;
      return `${열}열 × ${(v?.행 ?? []).length}행${v?.헤더 ? ' · 헤더' : ''}`;
    }
    case '수치':
      return `${(v ?? []).length}칸 · ${한줄(Array.isArray(v?.[0]) ? v[0][0] : v?.[0])}`;
    case '그림':
      return (typeof v === 'string' ? v : v?.경로 ?? '').split('/').pop();
    case '빈칸':
      return `${v} × 42 = ${v * 42}px`;
    case '비움': {
      const [n, 무엇] = Array.isArray(v) ? [v[0], v[1] ?? ''] : [v, ''];
      return `${n} × 42${빔(무엇) ? '' : ` · ${무엇}`}`;
    }
    default:
      return 한줄(v);
  }
}

/* ── 얹는 층 · N-얹기 ──────────────────────────────────
   **흐름 밖이다.** 요소는 박스 안에 순서대로 쌓이는데 이건 판 전역 절대 좌표로 앉는다.
   그래서 박스 · 요소와 나란히 서는 물건이 아니라 **탭이 따로 하나 든다** · [얹기].
   좌표는 키노트 슬라이드와 같은 계다 · 2339 × 1654. */
const 판W = 2339, 판H = 1654;
const 얹기갈래들 = [['선', '선'], ['도형', '도형'], ['그림', '그림'], ['글', '글']];
/* 얹은 글 · N-얹기 e. 계단과 정렬은 렌더러 얹기글계단 · 얹기정렬과 같아야 한다 */
const 얹기글크기들 = [21, 24, 26, 29, 39, 64];
const 얹기정렬들 = [['왼쪽', '왼쪽'], ['가운데', '가운데'], ['오른쪽', '오른쪽']];
const 선방향들 = [['가로', '가로'], ['세로', '세로']];
/* 층 · 박스 뒤 · 박스 앞 · N-얹기 b · 사용자 판정.
   쌓임은 DOM 순서가 전부다 — 렌더러가 박스 앞뒤로 한 번씩 내놓는다.
   기본이 「뒤」인 이유는 이 층을 연 두 쓰임(박스 사이 선 · 뒤에 까는 도형)이 다 뒤여서다 */
const 얹기층들 = [['뒤', '박스 뒤'], ['앞', '박스 앞']];
const 새얹기 = {
  // 판 한가운데를 가로지르는 선 · 처음 놓을 때 눈에 바로 보이는 자리다
  선: () => ({ 선: '가로', x: 80, y: 827, 길이: 2179, 굵기: 2, 색: '선' }),
  도형: () => ({ 도형: { 배경: '블록배경', 모서리: 10 }, x: 80, y: 260, 폭: 1090, 높이: 1150 }),
  // 카피 밴드 자리(y 271)에 놓는다 — 이 갈래를 연 쓰임이 거기다 · 높이는 안 준다
  글: () => ({ 글: '새 글', x: 80, y: 271, 폭: 2179, 크기: 64, 층: '앞' }),
  // 그림은 경로가 있어야 살아서 여기서 안 만든다 — 견본을 고르는 것이 곧 놓는 것이다
};
const 얹기열쇠 = (o) => 얹기갈래들.map(([k]) => k).find((k) => o?.[k] != null) ?? null;
const 얹기맛보기 = (o) => {
  const k = 얹기열쇠(o);
  if (k === '선') return `${o.선} · ${o.x},${o.y} · 길이 ${o.길이} · 굵기 ${o.굵기 ?? 1}`;
  if (k === '도형' || k === '그림') {
    const 뒤 = k === '그림'
      ? ` · ${(typeof o.그림 === 'string' ? o.그림 : o.그림?.경로 ?? '').split('/').pop()}` : '';
    return `${o.x},${o.y} · ${o.폭} × ${o.높이}${뒤}`;
  }
  if (k === '글') {
    const t = String(o.글 ?? '').replace(/\s+/g, ' ').trim();
    return `${o.x},${o.y} · ${o.크기 ?? 24}px · ${t.length > 22 ? `${t.slice(0, 22)}…` : t || '빈 글'}`;
  }
  return '';
};

const 맞춤들 = [['전체', '전체'], ['채우기', '채우기']];
const 그림높이갈래들 = [['채움', '채움'], ['블록', '블록'], ['%', '%']];
const 그림높이갈래 = (h) => (h == null || h === '채움' ? '채움'
  : Number.isInteger(h) ? '블록' : '%');

/* ── 표 칩 — N-배경 b2 ──────────────────────────────────
   렌더러의 표그리기() 가 읽는 열쇠만 여기서 만든다 · **헤더 · 행 · 폭 · 높이 · 선 · 배경**.
   배경은 도형 배경과 **같은 색 어휘**를 쓴다(배경이름) — 표 전용 색을 새로 만들지 않는다.

   실물 50건이 2 ~ 4열이고 9열 1건이 예외다 · 설계 §5-4.
   열 상한 8 은 렌더러의 「폭」 상한과 같은 값이다 — 여기서 막는 것은 편의고
   진짜 계약은 렌더러가 지킨다. */
const 표선들 = [['가로', '가로'], ['격자', '격자'], ['없음', '없음']];
const 표열최대 = 8;
/* 폭 갈래 셋 · N-배경 b3 — 렌더러의 표열() 이 받는 것과 같아야 한다.
     균등   폭 열쇠가 없다
     칸수     [1, 2, 1]                  균등 트랙 몇 개를 먹느냐 · 안쪽 거터를 열이 먹는다
     %      ["25%","30%","15%","30%"]  거터를 뺀 나머지의 % · 합 100
   칸수와 % 는 같은 물건이 아니다 — 30% 를 칸수로 흉내 내면 4px 넓다. 섞어 쓰지 않는다. */
const 표폭갈래들 = [['균등', '균등'], ['칸수', '칸수'], ['%', '%']];
const 비율하한 = 5;
const 백분율폭 = (폭) => Array.isArray(폭) && typeof 폭[0] === 'string';
const 퍼센트수 = (v) => Number(String(v).replace('%', ''));
const 퍼센트글 = (n) => `${n}%`;
/* 마지막 열이 나머지를 다 받는다 · 렌더러의 표열() 과 같은 규칙이다 · N-배경 b4.
   그래서 화면에 보이는 값도 **적힌 값이 아니라 그려지는 값**이어야 한다 —
   손으로 합 99 를 적어 둔 문안을 열면 마지막 칸이 그 1 을 먹은 값으로 뜬다. */
/* 높이 슬롯 · N-배경 b5 · b7 — **가로가 「폭」이면 세로는 「높이」다.**
     없음 · "채움" · 칸수 [1,2,1] · % ["30%","70%"] · 공백 { "공백": n }
   「채움」은 열쇠가 아니라 높이에 주는 값이다. 공백은 칸 수에 안 들고
   **남는 42 덩어리를 받는 자리**다. */
const 높이갈래들 = [['줄', '줄'], ['채움', '채움'], ['칸수', '칸수'], ['%', '%']];
const 공백자리들 = [['없음', '없음'], ['위', '위'], ['아래', '아래'], ['위아래', '위아래']];
const 공백인가 = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const 슬롯값 = (v) => (공백인가(v) ? v.공백 : v);
const 높이갈래 = (v) => (!v ? '줄' : v === '채움' ? '채움'
  : typeof 슬롯값(v[0]) === 'string' ? '%' : '칸수');
const 높이기본 = (칸수, 갈래) => {
  if (갈래 === '칸수') return Array.from({ length: 칸수 }, () => 1);
  const 배분 = Math.floor(100 / 칸수);
  const w = Array.from({ length: 칸수 }, () => 배분);
  w[칸수 - 1] += 100 - 칸수 * 배분;              // 나머지는 마지막이 받는다
  return w.map(퍼센트글);
};
const 빈슬롯 = (갈래) => ({ 공백: 갈래 === '%' ? '0%' : 0 });
const 공백자리 = (v) => {
  if (!Array.isArray(v)) return '없음';
  const 위 = 공백인가(v[0]), 아래 = 공백인가(v[v.length - 1]) && v.length > 1;
  return 위 && 아래 ? '위아래' : 위 ? '위' : 아래 ? '아래' : '없음';
};

const 유효비율 = (폭) => {
  const w = 폭.map(퍼센트수);
  w[w.length - 1] = 100 - w.slice(0, -1).reduce((a, b) => a + b, 0);
  return w;
};
const 줄무늬색 = '블록배경';
const 새표 = () => ({ 헤더: ['구분', '내용'], 행: [['칸', '칸'], ['칸', '칸']] });
// 헤더를 끄면 행 첫 줄이 칸 수를 나른다 — 렌더러의 셈과 같은 순서다
const 표열수 = (t) => t?.헤더?.length ?? t?.행?.[0]?.length ?? 0;
/* 지금 배경이 줄무늬 그대로인가 — 한 줄 걸러 같은 색이고 행과 길이가 같은가.
   행을 넣을 때 무늬를 이어 칠할지 가르는 박스다. 손으로 칠한 표는 안 건드린다 */
const 줄무늬인가 = (t) => Array.isArray(t.배경?.행)
  && t.배경.행.length === t.행.length
  && t.배경.행.every((v, j) => (j % 2 ? v === 줄무늬색 : v == null));
// 아무 색도 안 남으면 「배경」 을 통째로 없앤다. 안 보이는 값을 문안에 남기지 않는다
const 배경정리 = (t) => {
  const c = t.배경;
  if (!c) return;
  if (Array.isArray(c.행) && !c.행.some(Boolean)) delete c.행;
  if (c.헤더 == null && c.행 == null) delete t.배경;
};

/* ── 값 갈래 넷 · 화면 문법을 여기에 맞춘다 ────────────────
     색     견본 줄 + hex 칸        배경 · 테두리
     수     칸 하나                 모서리 · 투명도 · 굵기
     이름   선택띠                  그림자 · 여럿 중 하나인데 수가 아니다
     켜기   낱개 칩                 글자 반전
   수에 자주 쓰는 값을 칩으로 박아 두면 그것만 쓰라는 뜻이 된다.
   범위는 렌더러의 도형() 과 같아야 한다 — 여기서 막는 것은 편의고
   진짜 계약은 렌더러가 지킨다. */
const 수범위 = { 모서리: [0, 40], 투명도: [0, 100], 굵기: [1, 6],
                 /* 얹기 · 이름을 갈라 둔다 — 「폭」은 표 열 폭이 이미 쓴다.
                    한 객체에 같은 열쇠를 두 번 적으면 뒤엣것이 조용히 이긴다 */
                 얹x: [0, 판W], 얹y: [0, 판H], 얹가로: [1, 판W], 얹세로: [1, 판H],
                 얹폭: [1, 판W], 얹높이: [1, 판H], 얹굵기: [1, 20],
                 폭: [1, 표열최대], 비율: [비율하한, 100 - 비율하한],
                 칸수: [1, 20], 빈칸수: [0, 20], 빈비율: [0, 100 - 비율하한],
                 블록: [1, 30], 그림비율: [1, 100] };

/* 위 · 아래 화살표로 올리고 내린다 · ⇧ 를 누르면 열 걸음이다. 어도비 수치 칸 그대로다.
   「좁게」 는 칸이 여럿 늘어설 때다 — 표 열 폭은 열 수만큼 칸이 서므로
   칸마다 범위를 되풀이해 적으면 줄이 두 번 접힌다. 범위는 이름표 곁말이 나른다. */
function 수칸({ 열쇠, 값, 기본, 놓기, 로그, 열림 = true, 좁게 = false }) {
  const [아래, 위] = 수범위[열쇠];
  const 지금 = 값 ?? 기본;
  const [글, set글] = useState(String(지금));
  useEffect(() => { set글(String(지금)); }, [지금]);

  const 맞추기 = (t) => {
    const s = String(t).trim();
    const n = Number(s);
    if (s === '' || !Number.isInteger(n) || n < 아래 || n > 위) {
      set글(String(지금));
      return 로그(`${열쇠} "${s}" · ${아래} ~ ${위} 사이 정수로 적는다`);
    }
    if (n !== 지금) 놓기(n);
  };

  return (
    <span className="numwrap">
      <input
        className={'barin numin' + (좁게 ? ' w' : '')} type="text" inputMode="numeric"
        value={글} disabled={!열림}
        title={`${아래} ~ ${위} 사이 정수 · ↑↓ 로 한 걸음 · ⇧↑↓ 로 열 걸음`}
        onChange={(e) => set글(e.target.value)}
        onBlur={(e) => 맞추기(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { 맞추기(e.currentTarget.value); return; }
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const 걸음 = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          const n = Math.min(위, Math.max(아래, 지금 + 걸음));
          if (n !== 지금) 놓기(n);
        }}
      />
      {!좁게 && <span className="numrg">{아래}~{위}</span>}
    </span>
  );
}

function 줄({ 이름, 곁, children }) {
  return (
    <div className="fld">
      <span className="fldnm">{이름}{곁 ? <em>{곁}</em> : null}</span>
      <span className="fldv">{children}</span>
    </div>
  );
}

/* 글 칸 — 색입력 · 수칸과 같은 규칙이다. **문안을 따라간다.**
   비우면 열쇠가 지워진다 — 안 보이는 값을 문안에 남기지 않는다. */
function 입력({ 값, 놓기, 힌트 }) {
  const [글, set글] = useState(값 ?? '');
  useEffect(() => { set글(값 ?? ''); }, [값]);
  const 맞추기 = () => { const v = 글.trim(); if (v !== (값 ?? '')) 놓기(v); };
  return (
    <input className="barin" style={{ width: '100%' }} type="text"
           value={글} placeholder={힌트}
           onChange={(e) => set글(e.target.value)}
           onBlur={맞추기}
           onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

/* hex 칸 — **문안을 따라간다.** defaultValue 로 두면 안 된다.
   defaultValue 는 제 값을 따로 들고 있다가 칸을 벗어날 때 그 옛 값을 다시 밀어 넣는다.
   그래서 다른 속성을 고치면 방금 고친 것이 되돌아갔다. 수치 칸(수칸)과 같은 방식으로 맞춘다. */
function 색입력({ 값, 이름, 놓기, 로그 }) {
  const 현 = HEX6.test(값 ?? '') ? 값 : '';
  const [글, set글] = useState(현);
  useEffect(() => { set글(현); }, [현]);

  const 맞추기 = () => {
    const v = 글.trim();
    if (v === '') return;                 // 비워 두는 것은 「안 고친다」는 뜻이다
    if (!HEX6.test(v)) { set글(현); return 로그(`${이름} "${v}" · #RRGGBB 여섯 자리로 적는다`); }
    if (v !== 값) 놓기(v);
  };

  return (
    <input
      className="barin hexin" style={{ width: '100%' }}
      placeholder="#RRGGBB 로 적으면 위에 남는다"
      value={글}
      title="#RRGGBB"
      onChange={(e) => set글(e.target.value)}
      onBlur={맞추기}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

/* 색은 이름이 아니라 색으로 고른다 — 어도비 견본 칸 그대로다.
   글자 칩으로 늘어놓으면 네 개만 돼도 줄이 접히고 무슨 색인지도 안 보인다. */
/* 그림 견본 판 · N-그림 c. 두 자리(놓기 · 바꾸기)가 같은 것을 쓴다 —
   따로 적어 두면 한쪽만 고쳐져 갈라진다. 판으로 끌어다 놓는 길도 여기 산다 */
function 견본판({ 목록, 지금, 누르기 }) {
  return (
    <div className="imgs">
      {목록.map((it) => (
        <button key={it.경로} className={'imgc' + (지금 === it.경로 ? ' on' : '')}
                title={`${it.경로} · 판으로 끌어다 놓을 수 있다`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', it.경로)}
                onClick={() => 누르기(it.경로)}>
          <img src={`/api/img/${it.경로.slice('assets/'.length)}`} alt="" />
          <em>{it.이름}</em>
        </button>
      ))}
    </div>
  );
}

function 색칸({ 색, 이름, 지금, 누르기 }) {
  return (
    <button className={'sw' + (지금 ? ' on' : '') + (색 ? '' : ' none')}
            style={색 ? { background: 색 } : undefined}
            title={이름} onClick={누르기} />
  );
}

/* 고르는 자리에 낼 묶음 — **유형 하나가 묶음 하나**다 · listDocs 의 유형순서 그대로다.
   줄에는 문서 이름만 낸다. 사업은 이름이 겹칠 때만 덧붙인다 —
   묶음이 이미 성격을 말하고 있어서 줄마다 `sokcho /` 를 다는 것은 군더더기다. */
function 묶기(docs) {
  const 셈 = new Map();
  for (const d of docs) 셈.set(d.이름, (셈.get(d.이름) ?? 0) + 1);
  const 순서 = [];
  const 통 = new Map();
  for (const d of docs) {
    if (!통.has(d.유형)) { 통.set(d.유형, []); 순서.push(d.유형); }
    통.get(d.유형).push({ ...d, 낼이름: 셈.get(d.이름) > 1 ? `${d.이름} · ${d.사업}` : d.이름 });
  }
  return 순서.map((유형) => [유형, 통.get(유형)]);
}

/* 지난번에 열었던 문안으로 돌아온다 — 이 브라우저에만 남는다.
   못 읽어도(프라이빗 창 · 저장 막은 설정) 그냥 기본 시작점으로 간다. */
const 기억열쇠 = 'nine_press.문안';
const 기억 = {
  읽기: () => { try { return localStorage.getItem(기억열쇠); } catch { return null; } },
  쓰기: (v) => { try { localStorage.setItem(기억열쇠, v); } catch { /* 그냥 안 남긴다 */ } },
};

export default function Shell({ docs, first }) {
  const [slug, setSlug] = useState(first?.slug ?? '');
  const [doc, setDoc] = useState(first?.doc ?? null);
  const [mtime, setMtime] = useState(0);
  const [i, setI] = useState(0);
  const [더러움, set더러움] = useState(false);
  const [로그, set로그] = useState('');
  const [바쁨, set바쁨] = useState(false);
  const [축척, set축척] = useState(0.3);
  const [판본키, set판본키] = useState(0);
  const [검사, set검사] = useState(null);
  const [되돌림, set되돌림] = useState(0);
  const [충돌, set충돌] = useState(false);
  const [자, set자] = useState(false);      // 기준선 자 42px · rules/page.css .wrap.bl
  // 이름을 「블록」 으로 두면 안 된다 — 옛 12칸 트랙의 `const 블록` 과 같은 스코프에서 부딪친다
  const [외곽선, set외곽선] = useState(false);  // 박스 · 밴드 외곽선 · rules/page.css .wrap.dbg
  // 배율 · null 이면 창에 맞춘다. 숫자면 그 배율로 못박는다.
  // 키노트와 견주려면 못박아야 한다 — 키노트 50% 와 여기 50% 가 같은 크기다
  const [배율, set배율] = useState(null);
  const 묶음 = useMemo(() => 묶기(docs), [docs]);
  // 고른 박스 번호
  const [박스번호, set박스번호] = useState(null);
  /* 고른 요소 번호 · 내용 배열 안 박스다. 옛 꼴 박스에서는 안 쓴다 —
     그때는 박스 자신이 요소 뭉치라 속성이 박스에 걸린다 · N-자유 */
  const [요소번호, set요소번호] = useState(null);
  /* 놓기 판 — **판 위에 뜬다** · 사용자 판정 · N-자유 c.
     도크에서 놓으면 「어느 박스에?」가 늘 흐리다. 박스를 눌러 그 박스 위에서 놓으면
     고를 것이 하나뿐이라 흐릴 박스가 없다. { 박스, x, y } · 좌표는 판면 px 이다 */
  const [놓기판, set놓기판] = useState(null);
  useEffect(() => { set놓기판(null); }, [i, slug, 판본키]);
  /* 판면에서 드래그해 고른 글자 · N-글자 d.
     **도크의 범위가 이걸 보고 갈린다** — 있으면 그 구간에 걸고 · 없으면 요소에 건다.
     { 글 · 토큰[] } · 토큰은 이미 걸린 구간 안일 때 그 span 의 것이다 */
  const [고른글자, set고른글자] = useState(null);

  // 오른쪽 도크 · 지금 연 탭
  const [탭, set탭] = useState('판면');

  /* assets/ 아래 그림 목록 · 한 번만 받는다. 파일을 새로 넣으면 새로고침한다 —
     문안 파일과 같은 규칙이다(밖에서 고치면 다시 읽어야 한다 · v8 §9 ⑦) */
  const [그림목록, set그림목록] = useState([]);
  /* 그림 견본을 펼쳤나 · N-그림 c. **기본은 접힘이다** —
     사이드에 썸네일이 늘 깔려 있으면 지금 박스에 무엇이 놓였는지가 안 읽힌다 ·
     사용자 지적 둘. 놓는 길은 판의 「+」 놓기 판에도 있다 */
  const [견본, set견본] = useState(false);
  /* 고른 요소가 판에서 실제로 차지한 px · N-그림 e.
     **계산하지 않고 잰다** — 레이아웃 열둘 × 안여백 × 좌우 패딩을 도구가 다시 셈하면
     렌더러와 갈라진다. 판이 이미 그려 놨으니 그것을 읽는다 · { 가로, 세로 } */
  const [요소칸, set요소칸] = useState(null);
  // 고른 얹기 번호 · 페이지.얹기[] 의 자리다 · N-얹기
  const [얹기번호, set얹기번호] = useState(null);
  useEffect(() => {
    fetch('/api/img')
      .then((r) => r.json())
      .then((j) => set그림목록(Array.isArray(j?.그림) ? j.그림 : []))
      .catch(() => { /* 못 받으면 빈 목록이다. 경로를 손으로 적을 수 있다 */ });
  }, []);

  /* 최근 쓴 색 — 견본에 없는 색은 hex 로 적어야 하는데 같은 색을 여러 박스에 줄 때
     매번 여섯 자리를 다시 친다. 쓴 것을 남겨 두고 눌러 쓴다. 브라우저에 남는다 */
  const [최근색, set최근색] = useState([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('나인_최근색') ?? '[]');
      if (Array.isArray(v)) set최근색(v.filter((x) => HEX6.test(x)).slice(0, 8));
    } catch { /* 저장소가 막힌 브라우저면 그냥 빈 채로 간다 */ }
  }, []);
  const 색기억 = useCallback((색) => set최근색((a) => {
    const n = [색, ...a.filter((x) => x !== 색)].slice(0, 8);
    try { localStorage.setItem('나인_최근색', JSON.stringify(n)); } catch { /* 무시 */ }
    return n;
  }), []);

  const 판 = useRef(null);
  const 틀 = useRef(null);
  const 문서ref = useRef(null);
  const 페이지ref = useRef(0);
  const 시각ref = useRef(0);
  const 자ref = useRef(false);
  /* 탭 · 고른 얹기를 판에 알린다 · N-얹기. 클래스만 껐다 켜므로 판을 다시 안 그린다 */
  const 탭ref = useRef('박스');
  const 얹기번호ref = useRef(null);
  const 얹기자리ref = useRef(() => {});
  const 외곽선ref = useRef(false);
  /* 판 안 리스너는 판이 뜰 때 한 번 달린다. 그때의 클로저를 물면 옛 박스번호를 본다 —
     그래서 놓기 동작만 ref 로 빼 둔다. 판본 · 판이 갈려도 언제나 지금 것을 부른다 */
  const 끌어놓기ref = useRef(() => {});
  const 놓기판열기ref = useRef(() => {});
  const 파일놓기ref = useRef(() => {});
  const 스택 = useRef([]);        // 되돌리기 — 문서 스냅샷
  const 앞스택 = useRef([]);      // 다시 하기

  const 불러오기 = useCallback(async (s) => {
    const r = await 문안불러오기(s);
    if (!r.ok) return set로그(r.사유);
    스택.current = []; 앞스택.current = []; set되돌림(0);
    문서ref.current = r.doc;   // 판본 useMemo 가 이 렌더에서 바로 읽는다
    setDoc(r.doc); setMtime(r.mtime); setI(0);
    set자(!!r.doc.기준선);   // 문안이 "기준선": true 페이지 켠 채로 연다
    // 외곽선은 문안에서 안 읽는다 — 검사용이라 문서에 남을 물건이 아니다.
    // 문안에 남는 박스 테두리는 "구분선" 이고 그건 렌더러가 판면에 그린다
    set외곽선(false);
    set더러움(false); set판본키((n) => n + 1);
  }, []);

  useEffect(() => { if (slug) 불러오기(slug); }, [slug, 불러오기]);

  // 마운트 때 한 번 — 지난 자리가 아직 있는 문안이면 그리로 옮긴다
  useEffect(() => {
    const 지난 = 기억.읽기();
    if (지난 && 지난 !== slug && docs.some((d) => d.slug === 지난)) setSlug(지난);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (slug) 기억.쓰기(slug); }, [slug]);
  useEffect(() => { 문서ref.current = doc; }, [doc]);
  useEffect(() => { 페이지ref.current = i; }, [i]);
  useEffect(() => { 시각ref.current = mtime; }, [mtime]);
  useEffect(() => { 자ref.current = 자; }, [자]);
  useEffect(() => { 탭ref.current = 탭; 얹기번호ref.current = 얹기번호; 테칠ref.current(); },
    [탭, 얹기번호]);
  useEffect(() => { 얹기자리ref.current = 얹기자리; });
  useEffect(() => { 외곽선ref.current = 외곽선; }, [외곽선]);

  /* 켜고 끌 때 iframe 문서에 바로 입힌다.
     둘 다 rules/page.css 가 이미 갖고 있다 — .wrap.bl (기준선 자) · .wrap.dbg (외곽선).
     클래스만 껐다 켜므로 판면을 다시 그리지 않는다. 제자리 편집이 안 끊긴다.
     둘 다 검사용이라 산출 HTML · PDF 에는 안 나간다. */
  useEffect(() => {
    const w = 틀.current?.contentDocument?.querySelector('.wrap');
    if (!w) return;
    w.classList.toggle('bl', 자);
    w.classList.toggle('dbg', 외곽선);
  }, [자, 외곽선]);

  /* 고른 박스 · 고른 요소에 테두리를 입힌다 · N-그림 d.
     **강한 테는 언제나 하나다.** 요소를 고르면 박스 테를 지날 때 세기로 낮추고
     요소가 진한 테를 받는다 — 둘 다 진하면 무엇을 고른 것인지 안 읽힌다.
     `:has()` 를 안 쓴다 · 여기서 클래스로 준다 · 판이 iframe 이라 어차피 JS 가 만진다. */
  const 테칠ref = useRef(() => {});
  useEffect(() => {
    /* 판이 다시 뜰 때도 불러야 한다 — 판본키가 오르면 iframe 이 새로 뜨고
       그 문서에는 클래스가 없다. 효과만으로는 로드 순서에 걸려 한 박자 빈다 ·
       그래서 재기()(onLoad) 도 같은 함수를 부른다 */
    테칠ref.current = (문서) => {
      const d = 문서 ?? 틀.current?.contentDocument;
      if (!d) return;
      d.querySelectorAll('[data-박스]').forEach((el) => {
        const 이박스 = Number(el.getAttribute('data-박스')) === 박스번호;
        el.classList.toggle('pick', 이박스);
        el.classList.toggle('epick', 이박스 && 요소번호 != null);
      });
      d.querySelectorAll('[data-요소]').forEach((el) => {
        const 이박스 = Number(el.closest('[data-박스]')?.getAttribute('data-박스')) === 박스번호;
        el.classList.toggle('epick', 이박스 && Number(el.getAttribute('data-요소')) === 요소번호);
      });
      // 얹은 것 · [얹기] 탭일 때만 누를 수 있고 고른 것에 테가 붙는다 · N-얹기
      d.querySelector('.wrap')?.classList.toggle('ovp', 탭ref.current === '얹기');
      d.querySelectorAll('[data-얹기]').forEach((el) =>
        el.classList.toggle('opick', Number(el.getAttribute('data-얹기')) === 얹기번호ref.current));
      /* 고른 요소의 실치수 · 판면 px 그대로다 — 페이지그리기() 가
         `.sheet .page{transform:none}` 을 박아 두어 축척이 안 걸린다 */
      const 고름 = d.querySelector(`[data-박스="${박스번호}"] [data-요소="${요소번호}"]`);
      const r = 고름?.getBoundingClientRect();
      set요소칸(r && r.width ? { 가로: Math.round(r.width), 세로: Math.round(r.height) } : null);
    };
    테칠ref.current();
  }, [박스번호, 요소번호, 판본키]);

  /* 페이지를 옮기거나 문안을 갈면 고르기를 푼다.

     **박스가 바뀔 때는 요소를 안 푼다** · N-그림 c. 판에서 그림을 누르면 클릭 하나가
     박스와 요소를 같이 고르는데(`set박스번호` + `set요소번호`) · 박스 바뀜을 보고
     요소를 지우면 그 클릭이 통째로 무효가 된다. 실제로 **그림이 영영 안 골라졌다** —
     글자는 두 번 눌러 들어가는 길이 따로 있어 안 드러났고 그림만 드러났다 · 사용자 지적.
     박스만 고른 클릭은 고르는 쪽에서 이미 `set요소번호(null)` 을 함께 부른다. */
  useEffect(() => { set박스번호(null); set요소번호(null); set얹기번호(null); }, [i, slug]);

  /* 고른 박스를 비우거나 되돌린다.
     비움은 내용과 함께 못 산다 — 렌더러가 오류를 던진다. 그래서 내용이 있으면 막는다. */
  const 박스비움 = (값) => 바꾸기((d) => {
    const z = d.페이지[i]?.박스?.[박스번호];
    if (!z) return false;
    if (값) {
      // 도형도 함께 못 산다 — 비움은 「출력에 아무것도 안 나간다」가 계약이다.
      // 목록은 렌더러(블록())가 막는 것과 **같아야 한다**. 표가 빠져 있어
      // 표가 있는 박스를 비우면 렌더러가 던지고 판이 오류판으로 떨어졌다
      const 있는것 = [...박스내용열쇠, '내용', '도형']
        .filter((k) => z[k] != null);
      if (있는것.length) {
        set로그(`내용이 있어 못 비운다 · ${있는것.join(' · ')} 를 먼저 지운다`);
        return false;
      }
      z.비움 = 값 === true ? true : 값;
    } else {
      delete z.비움;
    }
  }, { 그리기: true });

  /* ── 요소 · N-자유 ────────────────────────────────────
     **속성이 걸리는 곳이 박스에서 요소로 내려갔다.**
     새 꼴이면 고른 요소(`박스.내용[요소번호]`) · 옛 꼴이면 박스 자신이다.
     옛 꼴을 그대로 두는 이유는 회귀 문안 여덟이 아직 옛 꼴이고 · 렌더러가 둘 다 읽어서다.
     **속성은 언제나 요소에 걸린다** · 옛 꼴이어도 그렇다 · N-그림 b.
     읽기는 가상으로 접어 보고 · 손대는 순간 진짜로 접는다. */
  /* 고른 박스의 내용 배열 · **옛 꼴이면 여기서 접는다** · N-그림 b.
     도구는 언제나 배열로 쓴다. 읽기는 가상으로 접어 보고(박스접기) ·
     **손대는 순간 진짜로 접는다.** 그래야 옛 꼴 박스의 그림을 골라도
     요소가 「그림」으로 잡힌다 — 전에는 박스 자신이 요소라 첫 열쇠(제목)가 잡혔다.
     번호는 안 어긋난다 · 박스접기() 가 렌더러 내용읽기() 와 같은 순서다 */
  const 접힌내용 = (d) => {
    const z = d.페이지[i]?.박스?.[박스번호];
    if (!z || z.비움) return null;
    return 접기(z);
  };
  const 요소찾기 = (d) => {
    const 내용 = 접힌내용(d);
    return 요소번호 == null ? null : (내용?.[요소번호] ?? null);
  };

  /* 옛 꼴 박스를 배열로 접는다. 접고 나면 옛 열쇠를 지운다 —
     둘을 같이 두면 렌더러가 던진다 · 한 꼴로만 산다 */
  const 접기 = (z) => {
    if (Array.isArray(z.내용)) return z.내용;
    const 내용 = 박스접기(z);
    for (const k of 박스내용열쇠) delete z[k];
    z.내용 = 내용;
    return 내용;
  };
  /* 요소를 놓는다 · 뺀다 · 옮긴다. 놓으면 옛 꼴 박스가 먼저 배열로 접힌다 */
  const 요소넣기 = (열쇠, 값) => 바꾸기((d) => {
    const z = d.페이지[i]?.박스?.[박스번호];
    if (!z) return false;
    if (z.비움) { set로그('비운 박스에는 못 놓는다 · 비움을 먼저 푼다'); return false; }
    const 내용 = 접기(z);
    const v = 값 !== undefined ? 값 : 새요소값[열쇠]?.();
    if (v === undefined) { set로그(`"${열쇠}" 는 값 없이 못 놓는다`); return false; }
    // 고른 요소 바로 뒤에 넣는다. 안 골랐으면 끝에 붙인다
    const 박스 = 요소번호 == null ? 내용.length : 요소번호 + 1;
    내용.splice(박스, 0, { [열쇠]: v });
    set요소번호(박스);
  }, { 그리기: true });

  const 요소빼기 = (j) => 바꾸기((d) => {
    const 내용 = 접힌내용(d);
    if (내용?.[j] == null) return false;
    내용.splice(j, 1);
    set요소번호(내용.length ? Math.min(j, 내용.length - 1) : null);
  }, { 그리기: true });

  const 요소옮기기 = (j, 걸음) => 바꾸기((d) => {
    const 내용 = 접힌내용(d);
    const k = j + 걸음;
    if (!내용 || k < 0 || k >= 내용.length) return false;
    [내용[j], 내용[k]] = [내용[k], 내용[j]];
    set요소번호(k);
  }, { 그리기: true });

  // 열쇠로 지운다 — 고른 요소가 그 열쇠면 요소를 통째로 뺀다
  const 요소지우기 = (열쇠) => 바꾸기((d) => {
    const 내용 = 접힌내용(d);
    if (요소번호 == null || 내용?.[요소번호]?.[열쇠] == null) return false;
    내용.splice(요소번호, 1);
    set요소번호(내용.length ? Math.min(요소번호, 내용.length - 1) : null);
  }, { 그리기: true });

  /* ── 얹는 층 · N-얹기 ────────────────────────────────
     **박스가 아니라 페이지에 붙는다.** `페이지.얹기[]` 다 · 판 전역 절대 좌표.
     그래서 박스번호 · 요소번호와 무관하게 산다 — 다루는 꼴은 요소와 같다. */
  const 얹기들 = (d) => {
    const p = d.페이지[i];
    if (!p) return null;
    if (!Array.isArray(p.얹기)) p.얹기 = [];
    return p.얹기;
  };
  const 얹기찾기 = (d) => (얹기번호 == null ? null : (얹기들(d)?.[얹기번호] ?? null));

  const 얹기넣기 = (갈래) => 바꾸기((d) => {
    const a = 얹기들(d);
    if (!a) return false;
    a.push(새얹기[갈래]());
    set얹기번호(a.length - 1);
  }, { 그리기: true });

  const 얹기빼기 = (k) => 바꾸기((d) => {
    const a = 얹기들(d);
    if (a?.[k] == null) return false;
    a.splice(k, 1);
    // 빈 배열은 문안에 안 남긴다 · 안 보이는 열쇠를 남기지 않는 규칙 그대로다
    if (!a.length) delete d.페이지[i].얹기;
    set얹기번호(a.length ? Math.min(k, a.length - 1) : null);
  }, { 그리기: true });

  const 얹기옮기기 = (k, 걸음) => 바꾸기((d) => {
    const a = 얹기들(d);
    const n = k + 걸음;
    if (!a || n < 0 || n >= a.length) return false;
    [a[k], a[n]] = [a[n], a[k]];
    set얹기번호(n);
  }, { 그리기: true });

  /* 끌어 옮긴 결과를 한 걸음으로 놓는다 · N-얹기 b.
     x · y 를 따로 부르면 되돌리기가 두 걸음이 되어 한 번 끌면 두 번 되돌려야 한다 */
  const 얹기자리 = (k, x, y) => 바꾸기((d) => {
    const o = 얹기들(d)?.[k];
    if (!o || (o.x === x && o.y === y)) return false;
    o.x = x; o.y = y;
    set얹기번호(k);
  }, { 그리기: true });

  /* 얹기 그림 — **견본을 고르는 것이 곧 놓는 것이다** · 요소 그림과 같은 규칙이다.
     경로 없는 그림을 한 박자 만들면 렌더러가 던져 그 페이지가 오류판이 된다 · §7 첫째 구멍.

     **자연 비율을 재서 앉힌다.** 얹기는 42 스냅이 없어 내보낸 그대로 쓸 수 있는데 ·
     기본 크기를 어림잡으면 첫 화면부터 찌그러져 보인다. 그림을 한 번 읽어 비율을 얻는다.
     못 읽으면(SVG 에 치수가 없는 등) 16:9 로 앉힌다 · 끌어서 고치면 된다.

     고른 것이 있으면 **그 자리를 갈아 끼운다** — x · y 를 지키고 갈래만 바뀐다. */
  const 얹기그림놓기 = async (경로) => {
    const 잰것 = await new Promise((풀기) => {
      const im = new Image();
      im.onload = () => 풀기(im.naturalWidth && im.naturalHeight
        ? { w: im.naturalWidth, h: im.naturalHeight } : null);
      im.onerror = () => 풀기(null);
      im.src = `/api/img/${경로.slice('assets/'.length)}`;
    });
    const 비 = 잰것 ? 잰것.h / 잰것.w : 9 / 16;
    const 폭 = Math.min(1000, 판W - 160);
    const 높이 = Math.max(1, Math.min(판H - 300, Math.round(폭 * 비)));
    바꾸기((d) => {
      const a = 얹기들(d);
      if (!a) return false;
      const 옛 = 얹기번호 == null ? null : a[얹기번호];
      const 새 = { 그림: 경로, x: 옛?.x ?? 80, y: 옛?.y ?? 260, 폭, 높이,
        ...(옛?.층 ? { 층: 옛.층 } : {}) };
      if (옛) { a[얹기번호] = 새; return; }
      a.push(새);
      set얹기번호(a.length - 1);
    }, { 그리기: true });
  };

  const 얹기값 = (열쇠, 값) => 바꾸기((d) => {
    const o = 얹기찾기(d);
    if (!o) return false;
    // undefined 를 주면 열쇠를 지운다 — 기본값을 문안에 안 남긴다 · 도형바꾸기와 같은 규칙
    if (값 === undefined) {
      if (o[열쇠] === undefined) return false;
      delete o[열쇠];
      return;
    }
    if (o[열쇠] === 값) return false;
    o[열쇠] = 값;
  }, { 그리기: true });

  /* 얹기 도형 — 박스 · 요소 도형과 같은 어휘다. 다만 **다 지우면 안 된다** —
     렌더러가 「아무것도 안 그린다」로 던진다. 마지막 하나는 안 지운다 */
  const 얹기도형 = (열쇠, 값) => 바꾸기((d) => {
    const o = 얹기찾기(d);
    if (o?.도형 == null) return false;
    const t = { ...o.도형 };
    if (값 === '' || 값 == null) delete t[열쇠]; else t[열쇠] = 값;
    if (!['배경', '테두리', '그림자'].some((k) => t[k])) {
      set로그('배경 · 테두리 · 그림자 중 하나는 남긴다 · 안 그리면 얹을 것이 없다');
      return false;
    }
    o.도형 = t;
  }, { 그리기: true });

  /* 갈래 갈아타기 — 선 ↔ 도형. x · y 만 나르고 나머지는 새로 세운다.
     길이와 폭/높이는 뜻이 달라 나를 수 없다 */
  const 얹기갈래바꾸기 = (갈래) => {
    // 그림은 경로가 있어야 산다 — 갈아타는 대신 견본을 편다 · 거기서 고르면 갈아 끼워진다
    if (갈래 === '그림') return set견본(true);
    바꾸기((d) => {
      const a = 얹기들(d);
      const o = a?.[얹기번호];
      if (!o || 얹기열쇠(o) === 갈래) return false;
      a[얹기번호] = { ...새얹기[갈래](), x: o.x, y: o.y, ...(o.층 ? { 층: o.층 } : {}) };
    }, { 그리기: true });
  };

  /* 비움 — 짧은 꼴(높이만)과 긴 꼴([높이, 무엇]) 둘을 오간다.
     무엇이 비면 짧은 꼴로 되돌린다 · 안 보이는 값을 문안에 안 남긴다 */
  const 비움값 = (열쇠, 값) => 바꾸기((d) => {
    const el = 요소찾기(d);
    if (el?.비움 == null) return false;
    const v = el.비움;
    let [n, 무엇] = Array.isArray(v) ? [v[0], v[1] ?? ''] : [v, ''];
    if (열쇠 === '높이') n = 값; else 무엇 = String(값 ?? '').trim();
    el.비움 = 무엇 ? [n, 무엇] : n;
  }, { 그리기: true });

  /* ── 글자 · N-글자 c ────────────────────────────────
     계층 · 크기 · 굵게 셋. 판정은 이미 다 나 있다 · 설계 §8-1 · v8 §9 ②.
     행간은 안 준다 — 42 배수로 못박힌 채다. 크기만 갈면 격자가 안 깨진다. */

  /* 계층 갈아타기 — **열쇠만 가고 값은 그대로 나른다.**
     `{문단:"…"} → {제목:"…"}` · 도형 · 크기는 붙어서 따라간다.

     **배열 모델이 이 길을 냈다** · N-자유 a. 옛 꼴은 박스가 열쇠 뭉치라
     「문단을 제목으로」 가 곧 자리 다툼이었다 — 이미 제목이 있으면 어디로 갈지가 없다.
     지금은 배열 한 칸이라 열쇠만 바꾸면 끝이고 · 그 칸에 이웃이 있어도 상관없다.

     값을 나르는 법은 계층값() 에 있다. 새 열쇠를 **앞에 둔다** —
     그래야 문안에서 내용이 도형 · 크기보다 먼저 읽힌다 */
  const 계층바꾸기 = (새열쇠) => 바꾸기((d) => {
    const 내용 = 접힌내용(d);
    if (!내용 || 요소번호 == null) return false;
    const el = 내용[요소번호];
    const 옛열쇠 = 글자갈래들.find((k) => el?.[k] != null);
    if (옛열쇠 == null || 옛열쇠 === 새열쇠) return false;
    const 값 = 계층값(el[옛열쇠], 옛열쇠, 새열쇠);
    const 나머지 = { ...el };
    delete 나머지[옛열쇠];
    내용[요소번호] = { [새열쇠]: 값, ...나머지 };
  });

  /* 크기 계단 — 없으면 계층 기본이다. 열쇠를 지우는 것이 「기본」이다 —
     기본값을 숫자로 적어 두면 계층을 갈아탈 때 옛 계층의 크기가 따라붙는다 */
  const 크기바꾸기 = (n) => 바꾸기((d) => {
    const el = 요소찾기(d);
    if (!el) return false;
    if (n == null) {
      if (el.크기 == null) return false;
      delete el.크기;
      return;
    }
    if (el.크기 === n) return false;
    el.크기 = n;
  });

  /* 굵게 — **새로 만들 것이 없다.** `**굵게**` 는 inline() 이 읽고 원문() 이 되돌린다 ·
     roundtrip 이 이미 전수 검사하는 길이다. 여기서는 판면에서 고른 자리에
     `<b>` 를 씌우기만 하면 그 길에 올라탄다.

     `styleWithCSS` 를 꺼야 `<b>` 가 나온다 — 켜져 있으면 `<span style=…>` 이 되고
     원문() 이 그 span 을 못 읽어 굵기가 저장에서 날아간다.
     쓰는 것은 판면 iframe 의 execCommand 다 · 저장은 언제나처럼 focusout 이 한다. */
  const 굵게 = () => 판면에서((d) => {
    d.execCommand('styleWithCSS', false, false);
    d.execCommand('bold');
  });

  /* ── 구간 스타일 · N-글자 d ──────────────────────────
     **여기가 「요소에 건다」와 「고른 글자에 건다」가 갈리는 자리다.**
     지금까지 도크는 범위가 요소로 고정이었다 · 문단 하나가 최소 단위였다.
     구간은 문안의 문자열 안 표기라(`{결론|38억원}`) 몇 글자에만 걸린다 · 사용자 판정.

     씌우는 법은 굵게와 같다 — **판면 DOM 에 span 을 넣고 저장은 focusout 이 한다.**
     `원문()` 이 그 span 을 표기로 되돌리고 `roundtrip` 이 전수 검사한다.
     새 길을 안 내는 것이 요점이다 · 굵게가 이미 그 길이었다. */

  /* 판면 편집이 열려 있을 때만 듣는다. **mousedown 을 막는 것과 짝이다** —
     막아도 focus 는 판면에 있고 · 안 막으면 누르는 순간 편집이 닫혀 고른 자리가 사라진다 */
  const 판면에서 = (fn) => {
    const d = 틀.current?.contentDocument;
    const t = d?.querySelector('[data-p][contenteditable="true"]');
    if (!t) return set로그('판에서 글자를 두 번 눌러 연 뒤에 씌운다');
    fn(d, t);
  };

  const 구간씌우기 = (토큰) => 판면에서((d) => {
    const sel = d.getSelection();
    if (!sel || sel.isCollapsed) return set로그(`고른 글자가 없다 · 씌울 자리를 끌어서 고른다`);
    /* 이미 걸린 구간 안이면 그 span 의 토큰을 갈아 끼운다 — 겹쳐 씌우면
       `{강조|{결론|글}}` 이 되어 안쪽이 이기고 · 벗길 때 둘을 다 벗겨야 한다 */
    const 안 = 구간span(d, sel);
    if (안 && 안.textContent === sel.toString()) return 토큰정하기(안, 토큰);
    const sp = d.createElement('span');
    구간칠하기(sp, [토큰]);
    sp.appendChild(sel.getRangeAt(0).extractContents());
    sel.getRangeAt(0).insertNode(sp);
    sel.selectAllChildren(sp);
  });

  /* 민글로 — **고른 자리의 표기를 통째로 벗긴다.** 구간 토큰과 굵게를 같이 푼다.
     둘은 층이 다르지만(`{강조|글}` 은 span · `**굵게**` 는 `<b>`) 쓰는 쪽에는
     「씌운 것을 다 떼라」 하나다. 이름과 동작을 맞춘다 · 사용자 판정.

     구간이 없어도 굵게만 풀 수 있어야 해서 **둘을 따로 센다.** */
  const 민글로 = () => 판면에서((d, t) => {
    const sel = d.getSelection();
    if (!sel || !sel.rangeCount) return set로그('고른 글자가 없다');
    // 굵게 · 고른 자리에 <b> 가 걸려 있으면 푼다. execCommand 가 부분 선택도 다룬다
    if (굵은가(d, sel)) {
      d.execCommand('styleWithCSS', false, false);
      d.execCommand('bold');
    }
    // 구간 · 고른 자리를 감싼 span 을 벗긴다
    const sp = 구간span(d, sel);
    if (sp) {
      const 부모 = sp.parentNode;
      while (sp.firstChild) 부모.insertBefore(sp.firstChild, sp);
      부모.removeChild(sp);
      부모.normalize();
    }
    if (!sp && !t.querySelector('b')) set로그('벗길 표기가 없다');
  });

  // 고른 자리가 굵은가 · queryCommandState 가 부분 선택도 판정한다
  const 굵은가 = (d, sel) => {
    if (d.queryCommandState?.('bold')) return true;
    let n = sel.getRangeAt(0).commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    return !!n?.closest?.('b, strong');
  };

  /* 고른 자리를 감싸는 구간 span 을 찾는다 · 편집 잎사귀 밖으로는 안 나간다 */
  const 구간span = (d, sel) => {
    if (!sel || !sel.rangeCount) return null;
    let n = sel.getRangeAt(0).commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    for (; n && n !== d.body; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      if (n.matches?.('[data-p]')) return null;
      if (n.dataset?.i) return n;
    }
    return null;
  };

  /* **표기가 `data-i` 에 산다** · 칠은 거기서 나온다 · N-글자 e.
     이름은 클래스로 · `#RRGGBB` 는 인라인 style 로 갈린다. 되읽기는 `data-i` 만 본다 —
     그래야 적힌 순서가 그대로 남고 · 클래스가 못 담는 `#` 도 실린다.
     `구간칠()` 이 그 갈래를 정한다 · 렌더러와 같은 함수다 */
  const 구간칠하기 = (sp, 토큰) => {
    const { 클래스, 스타일 } = 구간칠(토큰);
    sp.dataset.i = 토큰.join('·');
    sp.className = 클래스;
    sp.style.cssText = 스타일;
  };

  /* 한 갈래에서는 토큰 하나만 산다 — 색 둘을 겹치면 뒤엣것이 이기고 표기만 지저분해진다.
     같은 것을 다시 누르면 벗긴다 · 칩이 껐다 켜는 물건으로 읽힌다 */
  const 토큰정하기 = (sp, 토큰) => {
    const 갈래 = 토큰갈래(토큰);
    const 지금 = sp.dataset.i.split('·').filter(Boolean);
    const 남길것 = 지금.filter((t) => 토큰갈래(t) !== 갈래);
    const 켬 = !지금.includes(토큰);
    const 다음 = [...남길것, ...(켬 ? [토큰] : [])];
    if (다음.length) return 구간칠하기(sp, 다음);
    const 부모 = sp.parentNode;
    while (sp.firstChild) 부모.insertBefore(sp.firstChild, sp);
    부모.removeChild(sp);
    부모.normalize();
  };

  /* 요소 도형 — 박스 도형과 같은 어휘 · 같은 규칙이다. 빈 값이면 열쇠를 지운다 */
  const 요소도형바꾸기 = (열쇠, 값) => 바꾸기((d) => {
    const el = 요소찾기(d);
    if (!el || el.비움) return false;
    const s = { ...(el.도형 ?? {}) };
    if (값 === '' || 값 == null) delete s[열쇠]; else s[열쇠] = 값;
    if (Object.keys(s).length) el.도형 = s; else delete el.도형;
  }, { 그리기: true });

  /* 고른 박스의 도형을 고친다 — 배경 · 테두리 · 모서리 · 그림자 · 투명도 · 글자 반전.
     빈 값을 주면 그 열쇠를 지우고 · 남는 열쇠가 없으면 "도형" 을 통째로 없앤다.
     안 보이는 값을 문안에 남기지 않는다 — 렌더러가 도형 문자열을 안 내는 것과 같은 규칙이다. */
  const 도형바꾸기 = (열쇠, 값) => 바꾸기((d) => {
    const z = d.페이지[i]?.박스?.[박스번호];
    if (!z) return false;
    if (z.비움) { set로그('비운 박스에는 도형을 못 준다 · 비움을 먼저 푼다'); return false; }
    const s = { ...(z.도형 ?? {}) };
    if (값 === '' || 값 == null) delete s[열쇠]; else s[열쇠] = 값;
    if (Object.keys(s).length) z.도형 = s; else delete z.도형;
  }, { 그리기: true });

  /* ── 표 · N-배경 b2 ────────────────────────────────────
     **칸 안 글자는 여기서 안 고친다** — 판면에서 그 칸을 눌러 고친다.
     렌더러가 칸마다 `data-p:["박스",i,"표","헤더",c]` 를 붙여 두었다.
     이 패널이 맡는 것은 **틀**이다 · 열 · 행 · 헤더행 · 선 · 폭 · 높이 · 배경.

     열과 행을 넣고 뺄 때 헤더 · 모든 행 · 폭 · 높이 · 배경 이 **함께** 움직여야 한다.
     하나라도 어긋나면 렌더러가 「행마다 칸 수가 같다」에서 던진다. */
  const 표바꾸기 = (fn) => 바꾸기((d) => {
    const el = 요소찾기(d);
    if (!el?.표) return false;
    return fn(el.표, el);
  }, { 그리기: true });

  const 표만들기 = () => 요소넣기('표');
  const 표없애기 = () => 요소지우기('표');

  const 표열넣기 = () => 표바꾸기((t) => {
    const n = 표열수(t);
    if (n >= 표열최대) { set로그(`열은 ${표열최대} 까지다`); return false; }
    if (t.헤더) t.헤더.push('');
    t.행.forEach((r) => r.push(''));
    if (백분율폭(t.폭)) {
      /* % 는 합이 언제나 100 이다. 새 열 칸수를 떼고 나머지를 그 비율대로 줄인다 —
         비율은 지키고 합만 맞춘다. **새 열이 마지막이므로 나머지를 그것이 받는다** */
      const 새칸수 = Math.max(비율하한, Math.round(100 / (n + 1)));
      const 준 = 유효비율(t.폭).map((v) => Math.max(1, Math.round(v * (100 - 새칸수) / 100)));
      t.폭 = [...준, 100 - 준.reduce((a, b) => a + b, 0)].map(퍼센트글);
    } else if (t.폭) t.폭.push(1);
  });
  const 표열빼기 = () => 표바꾸기((t) => {
    if (표열수(t) <= 1) { set로그('마지막 열은 지우지 않는다 · 표를 지운다'); return false; }
    if (t.헤더) t.헤더.pop();
    t.행.forEach((r) => r.pop());
    if (백분율폭(t.폭)) {
      t.폭.pop();
      t.폭 = 유효비율(t.폭).map(퍼센트글);      // 뺀 칸수는 마지막 열이 받는다 · 합 100
    } else if (t.폭) t.폭.pop();
  });
  const 표행넣기 = () => 표바꾸기((t) => {
    // 지금 배경이 줄무늬 그대로면 무늬를 이어 칠한다.
    // 손으로 칠한 행은 안 건드리고 박스만 맞춘다 — 배경.행 은 행과 길이가 같아야 한다
    const 무늬 = 줄무늬인가(t);
    t.행.push(Array.from({ length: 표열수(t) }, () => ''));
    if (t.배경?.행) t.배경.행.push(무늬 && (t.행.length - 1) % 2 ? 줄무늬색 : null);
    높이맞추기(t);
  });
  const 표행빼기 = () => 표바꾸기((t) => {
    if (t.행.length <= 1) { set로그('마지막 행은 지우지 않는다 · 표를 지운다'); return false; }
    t.행.pop();
    if (t.배경?.행) { t.배경.행.pop(); 배경정리(t); }
    높이맞추기(t);
  });

  /* 헤더행 — 켜면 빈 헤더를 세우고 · 끄면 헤더와 헤더 배경을 같이 지운다.
     지운 글자는 ⌘Z 로 돌아온다 */
  const 표헤더 = (켬) => 표바꾸기((t) => {
    if (켬) {
      if (t.헤더) return false;
      t.헤더 = Array.from({ length: 표열수(t) }, () => '');
    } else {
      if (!t.헤더) return false;
      delete t.헤더;
      if (t.배경) { delete t.배경.헤더; 배경정리(t); }
    }
    높이맞추기(t, '앞');      // 헤더행은 첫 칸이다
  });

  // 「가로」는 렌더러의 기본값이다. 기본과 같은 값을 문안에 남기지 않는다
  const 표선 = (v) => 표바꾸기((t) => { if (v === '가로') delete t.선; else t.선 = v; });

  /* 폭 갈래를 바꾼다 · 균등 · 칸수 · % · N-배경 b3.
     갈래를 옮길 때는 값을 이어 나르지 않는다 — 칸수 2 와 2% 는 뜻이 다르다.
     균등에서 시작하는 것이 언제나 읽히는 값이다 */
  const 표폭갈래 = (갈래) => 표바꾸기((t) => {
    const n = 표열수(t);
    const 지금 = !t.폭 ? '균등' : 백분율폭(t.폭) ? '%' : '칸수';
    if (갈래 === 지금) return false;
    if (갈래 === '균등') { delete t.폭; return; }
    if (갈래 === '칸수') { t.폭 = Array.from({ length: n }, () => 1); return; }
    const 칸수 = Math.floor(100 / n);
    const w = Array.from({ length: n }, () => 칸수);
    w[n - 1] += 100 - 칸수 * n;                  // 나머지는 마지막 열이 받는다 · 합 100
    t.폭 = w.map(퍼센트글);
  });

  /* 칸수 — 균등 트랙을 몇 개 먹느냐다. 열마다 따로 적는다 */
  const 표폭 = (c, n) => 표바꾸기((t) => {
    if (백분율폭(t.폭)) return false;
    const w = t.폭 ? [...t.폭] : Array.from({ length: 표열수(t) }, () => 1);
    if (w[c] === n) return false;
    w[c] = n;
    t.폭 = w;
  });

  /* % — 합은 언제나 100 이다. 이웃 열이 차액을 받는다.
     이웃이 차액을 받아 합을 지킨다 */
  const 표비율 = (c, v) => 표바꾸기((t) => {
    if (!백분율폭(t.폭)) return false;
    const w = 유효비율(t.폭);
    const 차 = v - w[c];
    if (!차) return false;
    const j = c + 1 < w.length ? c + 1 : c - 1;
    if (j < 0 || w[j] - 차 < 비율하한) {
      set로그(`합은 언제나 100 이다 · 이웃 열이 ${비율하한}% 밑으로 못 내려간다`);
      return false;
    }
    w[j] -= 차; w[c] = v;
    t.폭 = w.map(퍼센트글);
  });

  const 표배경헤더 = (v) => 표바꾸기((t) => {
    // 헤더행이 없으면 칠할 박스가 없다 — 안 보이는 열쇠를 문안에 남기지 않는다
    if (!t.헤더) { set로그('헤더행이 없다 · 헤더행을 먼저 켠다'); return false; }
    const c = { ...(t.배경 ?? {}) };
    if (v === '' || v == null) delete c.헤더; else c.헤더 = v;
    t.배경 = c; 배경정리(t);
  });
  // 줄무늬 — 한 줄 걸러 칠한다. 행마다 색을 따로 주는 박스는 아직 없다
  const 표줄무늬 = (켬) => 표바꾸기((t) => {
    const c = { ...(t.배경 ?? {}) };
    if (켬) c.행 = t.행.map((_, j) => (j % 2 ? 줄무늬색 : null));
    else delete c.행;
    t.배경 = c; 배경정리(t);
  });

  /* 높이 — 남는 높이를 칸들이 42 걸음으로 나눠 갖는다 · N-배경 b5 · b7.
     앞에 문단 · 목록이 있으면 줄 수를 못 세서 렌더러가 던진다.
     같은 말을 여기서 먼저 한다 — 판이 오류판으로 떨어지기 전에 막는 쪽이 낫다 */
  const 표칸수 = (t) => t.행.length + (t.헤더 ? 1 : 0);

  /* 높이 배열은 **칸 수와 박스를 맞춰야 한다.** 행을 넣고 빼거나 헤더행을 껐다 켜면
     슬롯도 같이 움직인다 — 안 맞추면 렌더러가 「높이에 칸이 N개다」로 던진다.
     헤더행은 첫 칸이라 앞에서 · 행은 끝에서 넣고 뺀다. */
  const 높이맞추기 = (t, 어디 = '뒤') => {
    if (!Array.isArray(t.높이)) return;
    const 갈래 = 높이갈래(t.높이);
    const 위 = 공백인가(t.높이[0]) ? [t.높이[0]] : [];
    const 아래 = t.높이.length > 1 && 공백인가(t.높이[t.높이.length - 1])
      ? [t.높이[t.높이.length - 1]] : [];
    const 칸 = t.높이.filter((v) => !공백인가(v));
    const 칸수 = 표칸수(t);
    const 기본 = 갈래 === '%' ? 퍼센트글(0) : 1;
    while (칸.length < 칸수) (어디 === '앞' ? 칸.unshift(기본) : 칸.push(기본));
    while (칸.length > 칸수) (어디 === '앞' ? 칸.shift() : 칸.pop());
    let 새 = [...위, ...칸, ...아래];
    if (갈래 === '%') {
      // 마지막이 나머지를 받는다. 앞이 이미 100 을 넘겼으면 되돌릴 길이 없어 고르게 다시 깐다
      const w = 유효비율(새.map((v) => String(슬롯값(v))));
      새 = w.some((v) => v < 0)
        ? [...위, ...높이기본(칸수, '%'), ...아래]
        : 새.map((v, k) => (공백인가(v) ? { 공백: 퍼센트글(w[k]) } : 퍼센트글(w[k])));
    }
    t.높이 = 새;
  };
  const 표높이갈래 = (v) => 표바꾸기((t, z) => {
    const 지금 = 높이갈래(t.높이);
    if (v === 지금) return false;
    if (v === '줄') { delete t.높이; return; }
    const 막는것 = ['문단', '목록', '번호목록', '수치'].filter((k) => z[k] != null);
    if (막는것.length) {
      set로그(`높이는 앞에 ${막는것.join(' · ')} 가 있으면 못 준다 · 제목 · 요약만 둔다`);
      return false;
    }
    if (v === '채움') { t.높이 = '채움'; return; }
    // 갈래를 옮길 때 값을 이어 나르지 않는다 — 칸수 2 와 2% 는 뜻이 다르다.
    // 공백 박스는 지킨다. 그것이 이 갈래의 쓸모다
    const 박스 = 공백자리(t.높이);
    const 칸 = 높이기본(표칸수(t), v);
    t.높이 = [
      ...(박스 === '위' || 박스 === '위아래' ? [빈슬롯(v)] : []),
      ...칸,
      ...(박스 === '아래' || 박스 === '위아래' ? [빈슬롯(v)] : []),
    ];
  });

  /* 공백 박스 — 남는 42 덩어리를 위 · 아래로 몬다.
     균등에서 고르면 같은 높이의 칸수로 갈아 준다. 균등에는 공백을 끼울 박스가 없다 */
  const 표공백 = (박스) => 표바꾸기((t) => {
    const 갈래 = 높이갈래(t.높이);
    if (갈래 === '줄') { set로그('높이를 먼저 준다 · 채움 · 칸수 · % 중 하나'); return false; }
    if (공백자리(t.높이) === 박스) return false;
    const v = 갈래 === '%' ? '%' : '칸수';
    const 칸 = 갈래 === '채움' ? 높이기본(표칸수(t), v)
      : t.높이.filter((x) => !공백인가(x));
    t.높이 = [
      ...(박스 === '위' || 박스 === '위아래' ? [빈슬롯(v)] : []),
      ...칸,
      ...(박스 === '아래' || 박스 === '위아래' ? [빈슬롯(v)] : []),
    ];
  });

  /* 슬롯 값 하나 — 몫이면 그 자리만 · % 페이지 이웃이 차액을 받는다(합 100).
     가로의 표비율() 과 같은 규칙이다 */
  const 표높이값 = (k, n) => 표바꾸기((t) => {
    const a = t.높이;
    if (!Array.isArray(a)) return false;
    if (높이갈래(a) !== '%') {
      if (슬롯값(a[k]) === n) return false;
      t.높이 = a.map((v, j) => (j === k ? (공백인가(v) ? { 공백: n } : n) : v));
      return;
    }
    const w = 유효비율(a.map((v) => String(슬롯값(v))));
    const 차 = n - w[k];
    if (!차) return false;
    const j = k + 1 < w.length ? k + 1 : k - 1;
    if (j < 0 || w[j] - 차 < (공백인가(a[j]) ? 0 : 비율하한)) {
      set로그('합은 언제나 100 이다 · 이웃 칸이 차액을 받는다');
      return false;
    }
    w[j] -= 차; w[k] = n;
    t.높이 = a.map((v, m) => (공백인가(v) ? { 공백: 퍼센트글(w[m]) } : 퍼센트글(w[m])));
  });

  useEffect(() => {
    const el = 판.current;
    if (!el) return;
    if (배율 != null) { set축척(배율); return; }      // 못박은 배율 · 창 크기를 안 듣는다
    const 맞춤 = () => {
      const { width, height } = el.getBoundingClientRect();
      set축척(Math.max(0.08, Math.min((width - 48) / W, (height - 72) / H)));
    };
    맞춤();
    const ro = new ResizeObserver(맞춤);
    ro.observe(el);
    return () => ro.disconnect();
  }, [배율]);

  const 페이지 = doc?.페이지 ?? [];
  const 현재 = 페이지[i];

  /* ── 모든 수정은 여기를 지난다.  되돌리기 스택이 여기서 쌓인다 ── */
  function 바꾸기(fn, { 그리기 = false } = {}) {
    const d = structuredClone(문서ref.current);
    const r = fn(d);
    if (r === false) return;
    스택.current.push(structuredClone(문서ref.current));
    if (스택.current.length > 60) 스택.current.shift();
    앞스택.current = [];
    문서ref.current = d;
    setDoc(d); set더러움(true); set되돌림(스택.current.length);
    if (그리기) set판본키((n) => n + 1);
  }
  function 되돌리기() {
    const 이전 = 스택.current.pop();
    if (!이전) return set로그('되돌릴 것이 없다');
    앞스택.current.push(structuredClone(문서ref.current));
    문서ref.current = 이전;
    setDoc(이전); set더러움(true); set되돌림(스택.current.length); set판본키((n) => n + 1);
  }
  function 다시하기() {
    const 앞 = 앞스택.current.pop();
    if (!앞) return;
    스택.current.push(structuredClone(문서ref.current));
    문서ref.current = 앞;
    setDoc(앞); set더러움(true); set되돌림(스택.current.length); set판본키((n) => n + 1);
  }

  /* ── 판면 · N-판면 ──────────────────────────────────────────────
     **판면을 정하는 것이 문서를 정하는 것이다.** 봉인본 39쪽은 블록 157개 중 124개가
     내용 요소 하나뿐인 격자다 — 칸을 깔고 칸을 채운 물건이지 글을 나눈 물건이 아니다.
     그래서 칸을 고르는 일이 편집기의 첫 손짓이어야 하는데 · 여기가 글자로 찍히기만 했다.

     **미리보기는 그리는 게 아니라 재는 것이다** — `영역()` 을 그대로 불러 좌표를 %로 옮긴다.
     도식을 손으로 그리면 레이아웃이 바뀔 때 조용히 거짓말을 한다. */
  /* 밴드 — 헤더 · 카피 · 요지 · 푸터. **미리보기가 카피 영역을 보여야 한다** ·
     사용자 판정. 「모드」라는 말은 속을 안 드러낸다 — 실제로 갈리는 것은
     **위에 카피 밴드가 서느냐**이고 · 그것 때문에 박스 존이 199 내려앉는다. */
  const 밴드들 = useCallback((모드) => {
    const { 프레임, 헤더, 푸터, 요지Y, 존, G: 거터, 프레임상단 } = _규격;
    const 요지높이 = 존[모드] - 거터 - 요지Y[모드];
    const 것 = [
      { 갈래: 'bn', y: 헤더.y, h: 헤더.h },
      { 갈래: 'bn', y: 요지Y[모드], h: 요지높이 },
      { 갈래: 'bn', y: 푸터.y, h: 푸터.h },
    ];
    if (모드 === '카피') 것.splice(1, 0,
      { 갈래: 'cp', y: 프레임상단, h: 요지Y.카피 - 거터 - 프레임상단 });
    return 것.map((b) => ({ ...b, x: 프레임.x, w: 프레임.w }));
  }, []);

  const 판면갈래 = useMemo(() => {
    const 모드 = 현재?.모드 === '연속' ? '연속' : '카피';
    const 밴드 = 밴드들(모드);
    const 통 = new Map();
    for (const G of Object.keys(_규격.레이아웃)) {
      let r;
      try { r = 영역({ 번호: '01', 모드, 레이아웃: G, 박스: [] }); } catch { continue; }
      if (!통.has(r.length)) 통.set(r.length, []);
      통.get(r.length).push({ 레이아웃: G, 이름: _규격.레이아웃[G].이름, 칸: r, 밴드 });
    }
    return [...통.entries()].sort((a, b) => a[0] - b[0]);
  }, [현재?.모드, 밴드들]);

  /* 내용이 든 박스가 빠지는 판면은 **아예 못 고른다** · 사용자 판정.
     묻고 지우는 길을 두면 「그만」을 누르는 일이 대부분이라 물음이 값을 못 한다 —
     고를 수 없게 막고 왜 막혔는지만 말한다. 비우면 그때 열린다. */
  const 잃는수 = useCallback((레이아웃, 모드) => {
    const p = 현재;
    if (!p) return 0;
    let 필요;
    try { 필요 = 영역({ ...p, 모드, 레이아웃, 구성: undefined, 박스: [] }).length; }
    catch { return 0; }
    return (p.박스 ?? []).slice(필요)
      .filter((b) => (Array.isArray(b.내용) ? b.내용.length : Object.keys(b).length) > 0).length;
  }, [현재]);

  const 판면고르기 = (레이아웃, 모드) => {
    const p = 현재;
    if (!p) return;
    let 필요;
    try { 필요 = 영역({ ...p, 모드, 레이아웃, 구성: undefined, 박스: [] }).length; }
    catch { return set로그(`레이아웃 ${레이아웃} 을 못 읽는다`); }
    if (잃는수(레이아웃, 모드)) return;
    바꾸기((d) => {
      const q = d.페이지[i];
      const 레이아웃바뀜 = q.레이아웃 !== 레이아웃 || q.구성 != null;
      q.모드 = 모드; q.레이아웃 = 레이아웃;
      delete q.구성;
      // 비율은 통짜 열 번호로 매겨 있어 골격이 갈리면 뜻을 잃는다 · 같이 버린다
      if (레이아웃바뀜) delete q.비율;
      const 박스 = q.박스 ?? [];
      while (박스.length < 필요) 박스.push({ 내용: [] });
      박스.length = 필요;
      q.박스 = 박스;
    }, { 그리기: true });
    set박스번호(null); set요소번호(null);
  };

  /* ── 페이지 ── */
  const 번호매기기 = (d) => d.페이지.forEach((p, k) => { p.번호 = String(k + 1).padStart(2, '0'); });
  const 페이지넣기 = () => 바꾸기((d) => { d.페이지.splice(i + 1, 0, 새페이지('00')); 번호매기기(d); }, { 그리기: true });
  const 페이지복제 = () => 바꾸기((d) => { d.페이지.splice(i + 1, 0, structuredClone(d.페이지[i])); 번호매기기(d); }, { 그리기: true });
  const 페이지빼기 = () => 바꾸기((d) => {
    if (d.페이지.length <= 1) { set로그('마지막 페이지는 지우지 않는다'); return false; }
    d.페이지.splice(i, 1); 번호매기기(d);
    setI(Math.max(0, i - 1));
  }, { 그리기: true });
  const 페이지옮기기 = (dir) => 바꾸기((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.페이지.length) return false;
    [d.페이지[i], d.페이지[j]] = [d.페이지[j], d.페이지[i]];
    번호매기기(d); setI(j);
  }, { 그리기: true });

  async function 저장() {
    set바쁨(true); set로그('저장 …');
    const r = await 문안저장(slug, 시각ref.current, 문서ref.current);
    if (r.ok) {
      setMtime(r.mtime); set더러움(false); set충돌(false);
      set로그('저장됨'); set판본키((n) => n + 1);
    } else {
      set충돌(true);
      set로그(r.사유 + '\n\n고친 내용은 화면에 그대로 있다. 아래 「덮어쓰기」 를 누르면 그대로 저장한다.');
    }
    set바쁨(false);
  }
  // 밖에서 바뀐 걸 알고도 내 것으로 덮는다
  async function 덮어쓰기() {
    set바쁨(true); set로그('덮어쓰는 중 …');
    const r = await 문안저장(slug, 0, 문서ref.current);   // 기준시각 0 = 대조 건너뜀
    if (r.ok) { setMtime(r.mtime); set더러움(false); set충돌(false); set로그('저장됨'); set판본키((n) => n + 1); }
    else set로그(r.사유);
    set바쁨(false);
  }

  async function 실행(fn) {
    set바쁨(true); set로그('…');
    const r = await fn();
    set로그(r.log || (r.ok ? '완료' : '실패'));
    set바쁨(false);
  }

  /* ── 바깥 창에서도 ⌘Z · ⌘S ── */
  useEffect(() => {
    const on = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'z') { e.preventDefault(); e.shiftKey ? 다시하기() : 되돌리기(); }
      if (e.key === 's') { e.preventDefault(); 저장(); }
      if (e.key === '\\') { e.preventDefault(); set자((v) => !v); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  /* 판본이 그려지면 ① 제자리 편집을 붙이고 ② 고른 테를 다시 칠하고 ③ 넘침을 잰다 */
  function 재기() {
    const el = 틀.current;
    if (!el) return;
    // 판이 새로 떴다 — 고른 박스 · 요소의 테가 없다 · N-그림 d
    try { 테칠ref.current(el.contentDocument); } catch { /* 아직 못 읽는다 */ }

    try {
      const d = el.contentDocument;
      if (d && !d.body.dataset.집음) {
        d.body.dataset.집음 = '1';
        const st = d.createElement('style');
        st.textContent =
          '[data-p]{cursor:default}' +
          '[data-p][contenteditable="true"]{cursor:text;background:#fff;' +
            'outline:calc(2*var(--u)) solid #E68100;outline-offset:calc(1.5*var(--u))}' +
          '[data-p] .tbd, [data-p] .ar{user-select:all}' +
          // 박스 — 한 번 누르면 고른다. 지날 때 옅은 테, 고르면 진한 테
          '[data-박스]{cursor:default}' +
          '[data-박스]:hover{outline:2px solid rgba(230,129,0,.35);outline-offset:2px}' +
          '[data-박스].pick{outline:3px solid #E68100;outline-offset:3px}' +
          '[data-박스].pick [data-p]:hover{background:rgba(230,129,0,.10)}' +
          /* 요소 — 고르면 제 테를 받는다 · N-그림 d.
             **그림에 특히 필요했다** · 글자는 두 번 눌러 들어가면 편집 테가 뜨는데
             그림은 그 길이 없어 무엇을 고른 것인지 판에서 안 보였다 · 사용자 지적.
             outline 은 흐름을 안 건드린다 — 42 격자에 닿지 않는다 */
          '[data-요소]{cursor:default}' +
          '[data-박스].pick [data-요소]:hover{outline:1px solid rgba(230,129,0,.45);outline-offset:2px}' +
          '[data-요소].epick{outline:2px solid #E68100;outline-offset:2px}' +
          // 요소를 고르면 박스 테는 물러난다 · 강한 테는 하나만 남는다
          '[data-박스].pick.epick{outline:2px solid rgba(230,129,0,.30);outline-offset:3px}';
        d.head.appendChild(st);
        d.execCommand?.('defaultParagraphSeparator', false, 'br');

        /* 한 번 누르면 박스를 고르고 · 두 번 누르면 글자로 들어간다.
           키노트 · 피그마와 같다. 한 번에 글자가 열리면 표 칸이 박스를 덮어
           박스를 고를 방법이 없어진다 */
        d.addEventListener('dblclick', (e) => {
          const t = e.target.closest?.('[data-p]');
          if (!t || t.isContentEditable) return;
          t.dataset.전 = 원문(t);
          t.dataset.전html = t.innerHTML;
          t.contentEditable = 'true';
          t.querySelectorAll('.tbd, .ar').forEach((x) => { x.contentEditable = 'false'; });
          setTimeout(() => t.focus(), 0);
        });

        d.addEventListener('focusout', (e) => {
          const t = e.target.closest?.('[data-p]');
          if (!t || !t.isContentEditable) return;
          t.contentEditable = 'false';
          const 뒤 = 원문(t);
          if (뒤 === t.dataset.전) return;
          // 배열 원소가 빠지면 뒤 인덱스가 전부 당겨진다. 판면을 다시 그려야 맞는다
          바꾸기((dd) => { 쓰기(dd.페이지[페이지ref.current], JSON.parse(t.dataset.p), 뒤); },
                { 그리기: 빔(뒤) });
        }, true);

        d.addEventListener('keydown', (e) => {
          const t = e.target.closest?.('[data-p]');
          if (e.key === 'Escape' && t?.isContentEditable) {
            t.innerHTML = t.dataset.전html ?? t.innerHTML; t.blur(); return;
          }
          if (e.key === 'Enter' && !e.shiftKey && t?.isContentEditable) {
            e.preventDefault(); d.execCommand('insertLineBreak');
          }
          if (e.metaKey || e.ctrlKey) {
            if (e.key === 's') { e.preventDefault(); t?.blur(); 저장(); }
            if (e.key === 'z' && !t?.isContentEditable) {
              e.preventDefault(); e.shiftKey ? 다시하기() : 되돌리기();
            }
            // 제자리 편집 중에도 듣는다 — \ 는 글자 입력과 겹치지 않는다
            if (e.key === '\\') { e.preventDefault(); set자((v) => !v); }
          }
        });

        /* 고른 글자를 도크에 알린다 · N-글자 d.
           **판정 범위가 여기서 갈린다** — 구간이 있으면 도크가 그 구간에 걸고
           없으면 지금까지처럼 요소에 건다. 편집 잎사귀(`[data-p]`) 안일 때만 센다 —
           박스를 고르려고 끄는 것까지 글자 선택으로 읽으면 도크가 계속 흔들린다. */
        d.addEventListener('selectionchange', () => {
          const sel = d.getSelection();
          if (!sel || sel.isCollapsed || !sel.rangeCount) return set고른글자(null);
          let n = sel.getRangeAt(0).commonAncestorContainer;
          if (n.nodeType === 3) n = n.parentNode;
          const 잎 = n?.closest?.('[data-p]');
          if (!잎?.isContentEditable) return set고른글자(null);
          // 걸려 있는 토큰 · 구간 안을 통째로 골랐을 때만 읽는다 · 칩이 그걸 켜서 보인다
          const sp = 구간span(d, sel);
          set고른글자({
            글: sel.toString(),
            토큰: sp && sp.textContent === sel.toString()
              ? sp.dataset.i.split('·').filter(Boolean) : [],
          });
        });

        /* ── 얹은 것을 끌어 옮긴다 · N-얹기 b ──────────────────
           **판에서 끌고 · 놓을 때 한 걸음으로 문안에 앉는다.** 끄는 동안은 인라인
           style 만 만진다 — 값마다 문안을 고치면 판이 매 픽셀 다시 뜬다.

           **좌표를 안 나눈다** · iframe 안 clientX 는 이미 판면 px 이다 ·
           바깥 scale 은 iframe 요소에 걸려 있고 안쪽 문서는 1:1 이다 · §5 함정.

           **자석** · Shift 를 누르면 박스 모서리 · 거터 한가운데에 붙는다.
           「박스와 박스 사이에 선」이 이 층을 연 이유라(사용자) 손으로 맞출 일을 없앤다.
           안 누르면 자유다 · 세로를 42 에 안 붙이는 것과 같은 결이다. */
        let 끌기 = null;
        const 자석 = (축, 기준선 = false) => {
          const 값 = [];
          d.querySelectorAll('[data-박스]').forEach((b) => {
            const r = b.getBoundingClientRect();
            값.push(축 === 'x' ? r.left : r.top, 축 === 'x' ? r.right : r.bottom);
          });
          const 낱 = [...new Set(값.map(Math.round))].sort((a, b) => a - b);
          // 이웃한 모서리 사이의 한가운데 = 거터 한가운데
          const 사이 = 낱.slice(1).map((v, k) => Math.round((v + 낱[k]) / 2));
          const out = [...낱, ...사이];
          /* **얹은 글만 42 기준선에도 붙는다** · N-얹기 e. 선 · 도형은 글을 안 담아
             기준선과 무관하지만(그래서 세로를 안 붙였다) 글은 박스 안 글과 같은 줄에
             앉아야 한다. 박스 안 원점들이 한 나머지로 모이므로 아무 박스나 하나면 격자를 안다 */
          if (축 === 'y' && 기준선) {
            const b = d.querySelector('[data-박스]');
            if (b) {
              const 안top = Math.round(
                b.getBoundingClientRect().top + parseFloat(d.defaultView.getComputedStyle(b).paddingTop));
              for (let v = ((안top % 42) + 42) % 42; v < H; v += 42) out.push(v);
            }
          }
          return out;
        };
        const 붙이기 = (v, 후보) => {
          let 가까운 = v, 거리 = 11;                 // 10px 안에서만 붙는다
          for (const c of 후보) {
            const t = Math.abs(c - v);
            if (t < 거리) { 거리 = t; 가까운 = c; }
          }
          return 가까운;
        };

        d.addEventListener('pointerdown', (e) => {
          if (!d.querySelector('.wrap')?.classList.contains('ovp')) return;
          const el = e.target.closest?.('[data-얹기]');
          if (!el) return;
          e.preventDefault();
          const k = Number(el.getAttribute('data-얹기'));
          set얹기번호(k);
          끌기 = {
            el, k, x0: e.clientX, y0: e.clientY,
            l: parseFloat(el.style.left) || 0, t: parseFloat(el.style.top) || 0,
            w: el.offsetWidth, h: el.offsetHeight,
            자x: 자석('x'), 자y: 자석('y', el.classList.contains('tx')),
          };
          el.setPointerCapture?.(e.pointerId);
        });

        d.addEventListener('pointermove', (e) => {
          if (!끌기) return;
          let x = 끌기.l + (e.clientX - 끌기.x0);
          let y = 끌기.t + (e.clientY - 끌기.y0);
          if (e.shiftKey) {
            // 시작 모서리와 끝 모서리 둘 다 붙여 본다 · 가까운 쪽이 이긴다
            const x2 = 붙이기(x, 끌기.자x), x3 = 붙이기(x + 끌기.w, 끌기.자x) - 끌기.w;
            const y2 = 붙이기(y, 끌기.자y), y3 = 붙이기(y + 끌기.h, 끌기.자y) - 끌기.h;
            x = Math.abs(x2 - x) <= Math.abs(x3 - x) ? x2 : x3;
            y = Math.abs(y2 - y) <= Math.abs(y3 - y) ? y2 : y3;
          }
          x = Math.max(0, Math.min(W - 끌기.w, Math.round(x)));
          y = Math.max(0, Math.min(H - 끌기.h, Math.round(y)));
          끌기.el.style.left = `${x}px`;
          끌기.el.style.top = `${y}px`;
          끌기.끝 = { x, y };
        });

        const 끌기끝 = () => {
          if (!끌기) return;
          const g = 끌기; 끌기 = null;
          if (g.끝) 얹기자리ref.current(g.k, g.끝.x, g.끝.y);
        };
        d.addEventListener('pointerup', 끌기끝);
        d.addEventListener('pointercancel', 끌기끝);

        d.addEventListener('paste', (e) => {
          if (!e.target.closest?.('[data-p]')?.isContentEditable) return;
          e.preventDefault();
          d.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        });

        d.addEventListener('click', (e) => {
          if (e.target.isContentEditable) return;
          /* 얹은 것 · **[얹기] 탭일 때만 누를 수 있다** · N-얹기.
             늘 열어 두면 판 위를 덮은 도형이 박스 고르기를 통째로 가로챈다 —
             `.wrap.ovp` 가 그때만 pointer-events 를 연다 · page.css ㊲ */
          const 얹 = e.target.closest?.('[data-얹기]');
          if (얹) { set얹기번호(Number(얹.getAttribute('data-얹기'))); return; }
          const 박스 = e.target.closest?.('[data-박스]');
          if (!박스) { if (!e.target.closest?.('[data-p]')) set박스번호(null); return; }
          const n = Number(박스.getAttribute('data-박스'));
          set박스번호(n);
          /* 요소도 같이 고른다 · N-자유. 렌더러가 도구 모드에서만 data-요소 를 붙인다.
             **옛 꼴 박스에도 붙는다** · 번호는 박스접기() 순서와 같다 · N-그림 b.
             박스만 누른 클릭은 여기서 요소를 함께 푼다 — 위 useEffect 가 안 푼다 */
          const 요소 = e.target.closest?.('[data-요소]');
          set요소번호(요소 ? Number(요소.getAttribute('data-요소')) : null);
          /* 「+」 를 눌렀으면 그 박스 위에 놓기 판을 연다. 좌표는 판면 px 이다 —
             페이지그리기() 가 `.sheet .page{transform:none}` 을 박아 두어서 그렇다 */
          if (e.target.closest?.('.plus, .emp.add')) {
            const r = 박스.getBoundingClientRect();
            놓기판열기ref.current(n, Math.round(r.left), Math.round(r.top),
              Math.round(r.width), Math.round(r.height));
          } else {
            set놓기판(null);
          }
        });

        /* 도크 그림 견본을 판의 박스로 끌어다 놓는다 · N-자유.
           srcdoc 은 부모와 같은 출처라 dataTransfer 가 문서 경계를 넘는다.
           **좌표를 안 쓴다** — closest('.bx') 로 박스를 찾으므로 바깥 축척과 무관하다.
           판이 새로 뜰 때마다 이 onLoad 가 다시 단다 · 기존 리스너와 같은 길이다. */
        const 끌박스 = (ev) => ev.target?.closest?.('[data-박스]');
        d.addEventListener('dragover', (e) => {
          const bx = 끌박스(e);
          if (!bx) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          d.querySelectorAll('.bx.drop').forEach((el) => el.classList.remove('drop'));
          bx.classList.add('drop');
        });
        d.addEventListener('dragleave', (e) => 끌박스(e)?.classList.remove('drop'));
        d.addEventListener('drop', (e) => {
          const bx = 끌박스(e);
          d.querySelectorAll('.bx.drop').forEach((el) => el.classList.remove('drop'));
          if (!bx) return;
          e.preventDefault();
          const n = Number(bx.getAttribute('data-박스'));
          // Finder 에서 온 파일이 먼저다 · 그다음이 도크 견본 경로다
          const 파일 = [...(e.dataTransfer.files ?? [])];
          if (파일.length) { 파일놓기ref.current(n, 파일); return; }
          const 경로 = e.dataTransfer.getData('text/plain');
          if (!경로.startsWith('assets/')) return;
          끌어놓기ref.current(n, 경로);
        });

        // srcdoc 이 갈리면 문서가 새로 만들어져 클래스가 날아간다. 다시 입힌다.
        // 문안에 "기준선": true 가 있으면 render 가 이미 .bl 을 붙여 놓지만
        // 패널이 정본이다 — 켬이든 끔이든 자ref 가 이긴다.
        const w = d.querySelector('.wrap');
        w?.classList.toggle('bl', 자ref.current);
        w?.classList.toggle('dbg', 외곽선ref.current);

      }
    } catch { /* 다른 출처면 못 붙인다 */ }

    setTimeout(() => {
      try {
        const d = el.contentDocument;
        const sh = d?.querySelector('.sheet');
        if (!sh) return;
        /* 박스(.bx)마다 넘쳤는지 잰다. 옛 12칸 시절 `.b · .col · .foot .pt` 를
           보고 있어서 레이아웃 체계에서는 아무것도 안 재고 있었다 */
        const 넘침 = [];
        let 여유 = null;
        sh.querySelectorAll('.bx').forEach((el2, n) => {
          const 넘 = el2.scrollHeight - el2.clientHeight;
          if (넘 > 1) { 넘침.push({ 이름: `박스 ${n + 1}`, 값: Math.round(넘) }); return; }
          const 남 = Math.round(el2.clientHeight - el2.scrollHeight);
          if (여유 == null || 남 < 여유) 여유 = 남;
        });
        set검사({ 넘침, 여유: 여유 ?? 0 });
      } catch { /* 못 잰다 */ }
    }, 700);
  }

  /* ── 그림 · N-그림 ──
     문안에는 **객체 꼴로만 쓴다.** 짧은 꼴(경로 문자열)은 렌더러가 읽어 주지만
     도구가 높이 · 맞춤을 얹는 순간 객체가 되어야 하므로 여기서는 한 꼴로 통일한다.
     읽기는 두 꼴 다 받는다 — 손으로 짧게 적은 문안을 열어도 탭이 뜬다. */
  const 그림읽기 = (z) => (typeof z?.그림 === 'string' ? { 경로: z.그림 } : z?.그림 ?? null);
  const 그림바꾸기 = (fn) => 바꾸기((d) => {
    const el = 요소찾기(d);
    if (el?.그림 == null) return false;
    if (typeof el.그림 === 'string') el.그림 = { 경로: el.그림 };   // 짧은 꼴을 펴 놓는다
    return fn(el.그림, el);
  }, { 그리기: true });

  const 그림놓기 = (경로) => 바꾸기((d) => {
    const z = d.페이지[i]?.박스?.[박스번호];
    if (!z) return false;
    if (z.비움) { set로그('비운 박스에는 그림을 못 놓는다 · 비움을 먼저 푼다'); return false; }
    // 이미 고른 요소가 그림이면 경로만 간다
    const el = 요소찾기(d);
    if (el?.그림 != null) {
      if (typeof el.그림 === 'string') el.그림 = { 경로: el.그림 };
      if (el.그림.경로 === 경로) return false;
      el.그림.경로 = 경로;
      return;
    }
    /* 새로 놓을 때 높이를 정해 준다 — 기본값 「채움」은 같은 박스에 문단 · 목록이 있으면
       줄 수를 못 세서 렌더러가 던진다. 그 박스에서 오류판으로 떨어지지 않게
       미리 블록 수로 앉힌다 · 빈 박스면 채움 그대로 둔다 · 그게 가장 흔한 쓰임이다 */
    const 내용 = 접기(z);
    const 못셀것 = 내용.some((e) => ['문단', '목록', '번호목록'].some((k) => e[k] != null));
    const 박스 = 요소번호 == null ? 내용.length : 요소번호 + 1;
    내용.splice(박스, 0, { 그림: 못셀것 ? { 경로, 높이: 6 } : { 경로 } });
    set요소번호(박스);
  }, { 그리기: true });
  const 그림없애기 = () => 요소지우기('그림');

  /* 판에 떨어뜨렸을 때 · 그 박스를 먼저 고르고 그림을 끝에 놓는다.
     박스를 고르는 것과 놓는 것을 한 번에 해야 한다 — set박스번호 는 다음 렌더에나
     반영되므로 그림놓기() 가 옛 박스번호를 본다. 그래서 여기서 통째로 쓴다 */
  const 판에놓기 = (박스n, 경로) => 바꾸기((d) => {
    const z = d.페이지[i]?.박스?.[박스n];
    if (!z) return false;
    if (z.비움) { set로그('비운 박스에는 그림을 못 놓는다 · 비움을 먼저 푼다'); return false; }
    const 내용 = 접기(z);
    const 못셀것 = 내용.some((e) => ['문단', '목록', '번호목록'].some((k) => e[k] != null));
    내용.push({ 그림: 못셀것 ? { 경로, 높이: 6 } : { 경로 } });
    set박스번호(박스n);
    set요소번호(내용.length - 1);
    set탭('요소');
  }, { 그리기: true });
  /* 파일을 받아 `assets/올린것/` 에 쓰고 그 경로로 놓는다 · N-자유 d.
     **지금까지는 assets 에 손으로 먼저 넣어야 했다.** 이제 Finder 에서 바로 끈다.
     겹침 · 크기 · 이름 다듬기는 전부 라우트가 정한다 — 여기서는 결과 경로만 받는다 */
  const 파일놓기 = async (박스n, files) => {
    const 받은 = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append('파일', f);
      let r;
      try { r = await (await fetch('/api/img', { method: 'POST', body: fd })).json(); }
      catch { set로그(`${f.name} · 올리다 끊겼다`); continue; }
      if (!r?.경로) { set로그(`${f.name} · ${r?.사유 ?? '못 올렸다'}`); continue; }
      받은.push(r.경로);
    }
    if (!받은.length) return;
    // 목록을 새로 받는다 — 방금 올린 것이 견본에 떠야 한다
    try {
      const j = await (await fetch('/api/img')).json();
      set그림목록(Array.isArray(j?.그림) ? j.그림 : []);
    } catch { /* 목록을 못 받아도 놓는 것은 된다 */ }
    for (const 경로 of 받은) 판에놓기(박스n, 경로);
    set로그(`${받은.length}개를 assets/올린것/ 에 넣고 놓았다`);
  };

  useEffect(() => { 끌어놓기ref.current = 판에놓기; });
  useEffect(() => { 파일놓기ref.current = 파일놓기; });
  useEffect(() => { 놓기판열기ref.current = (박스, x, y, w, h) => set놓기판({ 박스, x, y, w, h }); });

  /* 놓기 판이 놓는다 — **판이 가리키는 그 박스에** 놓는다.
     「지금 고른 박스」를 다시 읽지 않는다 · 그게 어느 박스인지 흐려지던 박스였다 */
  const 판에요소놓기 = (박스n, 열쇠, 값) => 바꾸기((d) => {
    const z = d.페이지[i]?.박스?.[박스n];
    if (!z) return false;
    if (z.비움) { set로그('비운 박스에는 못 놓는다 · 비움을 먼저 푼다'); return false; }
    const 내용 = 접기(z);
    const v = 값 !== undefined ? 값 : 새요소값[열쇠]?.();
    if (v === undefined) { set로그(`"${열쇠}" 는 값 없이 못 놓는다`); return false; }
    내용.push({ [열쇠]: v });
    set박스번호(박스n);
    set요소번호(내용.length - 1);
    set탭('요소');
    set놓기판(null);
  }, { 그리기: true });

  // 빈 값을 주면 열쇠를 지운다 · 도형바꾸기와 같은 규칙
  const 그림값 = (열쇠, 값) => 그림바꾸기((g) => {
    if (값 === '' || 값 == null) delete g[열쇠]; else g[열쇠] = 값;
  });
  const 그림높이갈래놓기 = (갈래) => 그림바꾸기((g) => {
    if (그림높이갈래(g.높이) === 갈래) return false;
    if (갈래 === '채움') delete g.높이;
    else if (갈래 === '블록') g.높이 = 6;
    else g.높이 = '50%';
  });

  /* 판 · 썸네일 · 한 함수로 그린다 */
  const 페이지그리기 = useCallback((d, n) => {
    if (!d?.페이지?.[n]) return '';
    let html;
    try {
      html = render({ ...d, 페이지: [d.페이지[n]] }, { cssBase: '/api/css', 도구: true });
    } catch (e) {
      return 오류판(d, n, e);
    }
    return html
      .replaceAll('src="assets/', 'src="/api/img/')
      .replace('</head>', `<style>
body{padding:0;margin:0;background:transparent;overflow:hidden}
.wrap{width:${W}px;margin:0}
.sheet{width:${W}px;height:${H}px;margin:0;overflow:hidden}
.sheet .page{transform:none;box-shadow:none}
</style></head>`);
  }, []);

  // 판 — 판본키가 오를 때만 다시 만든다. doc 에 묶으면 글자 한 자마다 iframe 이 새로 뜬다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const 판본 = useMemo(() => 페이지그리기(문서ref.current, i), [판본키, i, slug]);

  /* 페이지 미리보기 — 페이지마다 iframe 하나. render 가 결정적이라 안 바뀐 페이지는
     같은 문자열이 나오고 · React 가 srcdoc 을 안 건드려 그 iframe 은 다시 안 뜬다 */
  const 썸네일 = useMemo(() => (doc?.페이지 ?? []).map((_, n) => 페이지그리기(doc, n)), [doc, 페이지그리기]);
  const 썸폭 = 200;   // 왼쪽 패널 244 − 좌우 안여백 28 − 번호 자리 16

  const 고른 = 박스번호 == null ? null : 현재?.박스?.[박스번호];
  /* 고른 요소 · N-자유. 새 꼴이면 내용 배열의 한 칸 · 옛 꼴이면 박스 자신이다.
     요소 탭이 이걸 보고 갈래별로 갈라진다 — 요소찾기() 의 읽기판이다 */
  /* **옛 꼴도 배열로 읽는다** · N-그림 b. 접지 않고 가상으로만 접어 본다 —
     고르기만 했는데 문안이 바뀌면 안 된다. 진짜 접기는 손댈 때 접힌내용() 이 한다.
     번호는 렌더러의 `data-요소` 와 같다 · 박스접기() 가 내용읽기() 와 같은 순서다 */
  const 옛꼴 = !!고른 && !고른.비움 && !Array.isArray(고른.내용);
  const 고른내용 = 고른 == null || 고른.비움 ? null
    : (Array.isArray(고른.내용) ? 고른.내용 : 박스접기(고른));
  const 고른요소 = 요소번호 == null ? null : (고른내용?.[요소번호] ?? null);
  const 요소열쇠 = (el) => 요소갈래들.find((k) => el?.[k] != null) ?? null;
  const 고른갈래 = 요소열쇠(고른요소);

  return (
    <div className="shell">
      <header className="top">
        <span className="brand">nine_press</span>
        <span className="bsp" />
        <span className="undo">
          <button disabled={!되돌림} onClick={되돌리기} title="⌘Z">↺</button>
          <button disabled={!앞스택.current.length} onClick={다시하기} title="⌘⇧Z">↻</button>
        </span>
        <span className="bsp" />
        <button className={'chip' + (자 ? ' on' : '')} onClick={() => set자((v) => !v)}
                title="기준선 42 · ⌘\">기준선</button>
        <button className={'chip' + (외곽선 ? ' on' : '')} onClick={() => set외곽선((v) => !v)}
                title="박스 외곽선">외곽선</button>
        <span className="bsp" />
        <span className="seg">
          <button className={'chip' + (배율 == null ? ' on' : '')} onClick={() => set배율(null)}>맞춤</button>
          {[0.25, 0.5, 1].map((v) => (
            <button key={v} className={'chip' + (배율 === v ? ' on' : '')}
                    onClick={() => set배율(v)}>{v * 100}%</button>
          ))}
        </span>
        <input
          className="barin zin" type="text" inputMode="numeric" placeholder="%"
          key={`zoom-${배율}`} defaultValue={배율 == null ? '' : Math.round(배율 * 100)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v) return set배율(null);
            const n = Number(v.replace('%', ''));
            if (!Number.isFinite(n) || n < 10 || n > 400) {
              e.target.value = 배율 == null ? '' : Math.round(배율 * 100);
              return set로그(`배율 "${v}" · 10 ~ 400`);
            }
            set배율(n / 100);
          }}
        />
        <span className="znow">{Math.round(축척 * 100)}%</span>

        <span className="bfill" />

        {검사 && (
          <span className={'chk' + (검사.넘침.length ? ' bad' : '')}
                title={검사.넘침.map((o) => `${o.이름} ${o.값}px`).join(' · ')}>
            {검사.넘침.length ? `넘침 ${검사.넘침.length}` : `여유 ${검사.여유}`}
          </span>
        )}
        {로그 && <span className="log1" title={로그}>{로그.split('\n')[0]}</span>}
        {충돌 && (
          <>
            <button className="chip warn" disabled={바쁨} onClick={() => 불러오기(slug)}>버리기</button>
            <button className="chip warn" disabled={바쁨} onClick={덮어쓰기}>덮어쓰기</button>
          </>
        )}
        <button className="chip" disabled={바쁨 || !slug} onClick={() => 실행(() => 빌드(slug))}>빌드</button>
        <button className="chip" disabled={바쁨 || !slug} onClick={() => 실행(() => 빌드(slug, true))}
                title="폰트 내장">폰트</button>
        <button className="chip" disabled={바쁨 || !slug} onClick={() => 실행(() => PDF(slug))}>PDF</button>
        <button className="save" disabled={바쁨 || !더러움} onClick={저장}>
          {더러움 ? '저장 ⌘S' : '저장됨'}
        </button>
      </header>

      <aside className="pages">
        {/* 문안 고르기 — **왼쪽 맨 위다** · 사용자 판정.
            상단바에 있을 때는 도구 버튼들과 한 줄에 섞여 무엇을 고르는 것인지 흐렸다.
            페이지 목록 바로 위가 제자리다 — 문안을 고르면 그 아래가 통째로 바뀐다 */}
        <div className="dochd">
          <select className="pick" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {묶음.map(([이름, 목록]) => (
              <optgroup key={이름} label={이름}>
                {목록.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.낼이름}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="pgs">
          {페이지.map((pg, n) => (
            <button key={n} className={'pg' + (n === i ? ' on' : '')} onClick={() => setI(n)}>
              <span className="pgno">{pg.번호}</span>
              <span className="pgsh" style={{ width: 썸폭, height: Math.round(썸폭 * H / W) }}>
                <iframe
                  loading="lazy" tabIndex={-1} title={pg.제목} srcDoc={썸네일[n]}
                  style={{ width: W, height: H, transform: `scale(${썸폭 / W})` }}
                />
              </span>
              <span className="pgtt">{pg.제목}</span>
            </button>
          ))}
        </div>
        <div className="pgbar">
          <button className="chip" onClick={() => 페이지옮기기(-1)} disabled={i === 0}>↑</button>
          <button className="chip" onClick={() => 페이지옮기기(1)} disabled={i >= 페이지.length - 1}>↓</button>
          <button className="chip" onClick={페이지넣기}>+</button>
          <button className="chip" onClick={페이지복제}>복제</button>
          <button className="chip warn" onClick={페이지빼기}>−</button>
        </div>
      </aside>

      <main className="view" ref={판}>
        {현재 ? (
          <div className="frame" style={{ width: W * 축척, height: H * 축척 }}>
            <iframe
              ref={틀}
              key={`${slug}-${i}-${판본키}`}
              srcDoc={판본}
              onLoad={재기}
              style={{ width: W, height: H, transform: `scale(${축척})`, transformOrigin: 'top left' }}
            />
            {/* 놓기 판 — **박스 위에 뜬다** · 사용자 판정 · N-자유 c.
                iframe 안이 아니라 그 위에 얹는다 · 안에 넣으면 판본이 갈릴 때마다 날아간다.
                좌표는 판면 px 이라 축척만 곱하면 그 박스에 붙는다 —
                페이지그리기() 가 `.sheet .page{transform:none}` 을 박아 둔 덕이다 */}
            {놓기판 && (
              <div className="drop-pane"
                   style={{ left: (놓기판.x + 놓기판.w / 2) * 축척,
                            top: (놓기판.y + 놓기판.h / 2) * 축척 }}>
                <div className="dp-hd">
                  박스 <b>{놓기판.박스 + 1}</b> 에 놓는다
                  <span className="bfill" />
                  <button className="chip mini" onClick={() => set놓기판(null)}>닫기</button>
                </div>
                <div className="dp-bd">
                  {요소갈래들.filter((k) => k !== '그림').map((k) => (
                    <button key={k} className="chip"
                            onClick={() => 판에요소놓기(놓기판.박스, k)}>{k}</button>
                  ))}
                </div>
                <div className="dp-hd sub">
                  그림
                  <span className="bfill" />
                  <label className="chip">
                    파일에서
                    <input type="file" hidden accept="image/*"
                           onChange={(e) => {
                             const f = e.target.files?.[0];
                             e.target.value = '';
                             if (f) 파일놓기(놓기판.박스, [f]);
                           }} />
                  </label>
                </div>
                <p className="dim">Finder 에서 판의 박스로 바로 끌어다 놓아도 된다</p>
                {그림목록.length > 0 && (
                  <>
                    <div className="imgs">
                      {그림목록.map((it) => (
                        <button key={it.경로} className="imgc" title={it.경로}
                                onClick={() => 판에요소놓기(놓기판.박스, '그림', { 경로: it.경로, 높이: 6 })}>
                          <img src={`/api/img/${it.경로.slice('assets/'.length)}`} alt="" />
                          <em>{it.이름}</em>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="empty">페이지가 없다</p>
        )}
      </main>

      <aside className="dock">
        {/* 아무것도 안 골랐을 때는 **비워 둔다** · 사용자 판정.
            「박스를 고른다」는 판면 · 얹기 탭에서는 틀린 말이었다 — 그 둘은 박스를 안 고르고 쓴다.
            띠 자체는 남긴다 · 없앴다 켜면 탭이 위아래로 밀린다 */}
        <div className="dkhd">
          {!고른 ? null : (
            <>
              <i>{현재?.레이아웃 ?? '구성'}</i>
              박스 <b>{박스번호 + 1}</b> / {현재?.박스?.length}
              <span className="bfill" />
              <button className={'chip' + (고른.비움 ? ' on' : '')}
                      onClick={() => 박스비움(!고른.비움)}>비움</button>
            </>
          )}
        </div>
        {고른?.비움 && (
          <div className="dkln">
            <input
              className="barin" style={{ width: '100%' }}
              placeholder="무엇으로 채울지"
              key={`빔-${slug}-${i}-${박스번호}`}
              defaultValue={typeof 고른.비움 === 'string' ? 고른.비움 : ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if ((typeof 고른.비움 === 'string' ? 고른.비움 : '') !== v) 박스비움(v || true);
              }}
            />
          </div>
        )}

        {고른 && !고른.비움 && (
          <div className="dkln">
            {/* 내용 목록 — **박스 안이 배열이다.** 한 줄이 요소 하나고 · 누르면 고른다.
                **옛 꼴 박스도 같은 목록이 뜬다** · N-그림 b. 접지 않고 가상으로 접어 보여 주고 ·
                손대는 순간 진짜로 접힌다. 전에는 여기가 「배열로」 버튼 하나였는데
                그림이 든 옛 꼴 박스를 고른 사람에게 요소가 통째로 안 보였다 · 사용자 지적 */}
            <div className="fld">
              <span className="fldnm">
                내용
                {고른내용 && <em>{고른내용.length}개{옛꼴 ? ' · 옛 꼴' : ''}</em>}
              </span>
            </div>
            {고른내용 && (
              <div className="elrows">
                {고른내용.map((el, j) => {
                  const k = 요소열쇠(el);
                  return (
                    <div key={j} className={'elrow' + (요소번호 === j ? ' on' : '')}
                         onClick={() => set요소번호(j)}>
                      <span className="eln">{k ?? '?'}</span>
                      <em>{맛보기(el, k)}</em>
                      {el.도형 && <span className="eldot" title="요소 도형" />}
                      <button className="chip mini" title="위로"
                              onClick={(e) => { e.stopPropagation(); 요소옮기기(j, -1); }}>↑</button>
                      <button className="chip mini" title="아래로"
                              onClick={(e) => { e.stopPropagation(); 요소옮기기(j, 1); }}>↓</button>
                      <button className="chip mini warn" title="뺀다"
                              onClick={(e) => { e.stopPropagation(); 요소빼기(j); }}>−</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="fld">
              <span className="fldnm">놓기{고른내용 && 요소번호 != null ? <em>고른 것 뒤에</em> : null}</span>
              <span className="fldv">
                {요소갈래들.filter((k) => k !== '그림').map((k) => (
                  <button key={k} className="chip" onClick={() => 요소넣기(k)}>+ {k}</button>
                ))}
                {/* 「+ 그림」 은 **견본을 펴면서** [요소] 탭으로 간다 · N-그림 d.
                    견본을 접어 둔 뒤로 이 버튼이 아무것도 안 여는 것처럼 보였다 · 사용자 지적.
                    경로 없는 그림을 미리 만들지 않는 것은 그대로다 — 그러면 렌더러가 던진다 */}
                <button className="chip"
                        onClick={() => { set요소번호(null); set탭('요소'); set견본(true); }}
                        title="견본을 펴고 [요소] 탭으로 간다 · 판의 「+」로도 놓는다">+ 그림</button>
              </span>
            </div>
          </div>
        )}

        {/* 탭 둘. **「표」 · 「그림」은 요소의 갈래지 요소와 나란히 설 물건이 아니다** —
            그림 요소를 골라 두고 [표] 탭을 눌러도 뭔가 나오면 어디에 걸린 값인지 흐려진다.
            그래서 박스에 걸리는 것과 요소에 걸리는 것 둘로만 가르고 ·
            요소 탭이 고른 요소의 갈래를 보고 갈라진다 · 사용자 판정 · N-자유 c */}
        <div className="tabs">
          {['판면', '박스', '요소', '얹기'].map((v) => (
            <button key={v} className={'tab' + (탭 === v ? ' on' : '')}
                    onClick={() => set탭(v)}>{v}</button>
          ))}
        </div>

        <div className="dkbd">
          {탭 === '판면' && (
            <div className="lays">
              <div className="fld">
                <span className="fldnm">카피 영역</span>
                <span className="seg">
                  {[['카피', '있다'], ['연속', '없다']].map(([m, 글]) => (
                    <button key={m}
                            className={'chip' + ((현재?.모드 === '연속' ? '연속' : '카피') === m ? ' on' : '')}
                            onClick={() => 판면고르기(현재?.레이아웃 ?? 'G2', m)}>{글}</button>
                  ))}
                </span>
              </div>

              {현재?.구성 && <p className="dim">이 페이지는 「구성」으로 골격을 직접 적었다 · 아래에서 고르면 그것이 지워진다</p>}

              {판면갈래.map(([수, 것들]) => (
                <div key={수} className="laygrp">
                  <span className="laynm">{수}칸</span>
                  <div className="laylist">
                    {것들.map(({ 레이아웃, 이름, 칸, 밴드 }) => {
                      const 모드 = 현재?.모드 === '연속' ? '연속' : '카피';
                      const 잃음 = 잃는수(레이아웃, 모드);
                      return (
                      <button key={레이아웃} disabled={!!잃음}
                              title={잃음
                                ? `${레이아웃} · ${이름} — 내용이 든 박스 ${잃음}개가 빠져서 못 고른다 · 그 박스를 비우면 열린다`
                                : `${레이아웃} · ${이름}`}
                              className={'lay' + (현재?.레이아웃 === 레이아웃 && !현재?.구성 ? ' on' : '')
                                + (잃음 ? ' 막힘' : '')}
                              onClick={() => 판면고르기(레이아웃, 모드)}>
                        <span className="laypv" style={{ aspectRatio: `${W} / ${H}` }}>
                          {[...밴드.map((b) => ({ ...b, 갈래: b.갈래 })),
                            ...칸.map((r) => ({ ...r, 갈래: 'bx' }))].map((r, k) => (
                            <i key={k} className={r.갈래} style={{
                              left: `${r.x / W * 100}%`, top: `${r.y / H * 100}%`,
                              width: `${r.w / W * 100}%`, height: `${r.h / H * 100}%`,
                            }} />
                          ))}
                        </span>
                        {!!잃음 && <em className="layx">박스 {잃음}개가 빠진다</em>}
                      </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {탭 === '박스' && (() => {
            const z = 고른;
            const s = z?.도형 ?? {};
            const 켬 = !!z && !z.비움;
            if (!켬) return <p className="dim">{z?.비움 ? '비운 박스' : '박스를 고른다'}</p>;
            return (
              <>
              <줄 이름="배경"
                  곁={도형배경들.find(([v]) => v === (s.배경 ?? ''))?.[1]
                    ?? (HEX6.test(s.배경 ?? '') ? s.배경 : null)}>
                {도형배경들.map(([v, 이름, 색]) => (
                  <색칸 key={v || 'n'} 색={색} 이름={이름}
                        지금={(s.배경 ?? '') === v}
                        누르기={() => 도형바꾸기('배경', v)} />
                ))}
                {최근색.length > 0 && <span className="swsp" />}
                {최근색.map((색) => (
                  <색칸 key={색} 색={색} 이름={`최근 ${색}`}
                        지금={s.배경 === 색}
                        누르기={() => 도형바꾸기('배경', 색)} />
                ))}
                <span className="brk" />
                <색입력 값={s.배경} 이름="배경" 로그={set로그}
                          놓기={(v) => { 도형바꾸기('배경', v); 색기억(v); }} />
              </줄>
              <줄 이름="투명도" 곁={null}>
                <수칸 열쇠="투명도" 값={s.투명도} 기본={100} 열림={!!s.배경}
                      로그={set로그} 놓기={(n) => 도형바꾸기('투명도', n)} />
              </줄>

              <div className="popln" />

              <줄 이름="테두리"
                  곁={도형테두리들.find(([v]) => v === (s.테두리 ?? ''))?.[1]
                    ?? (HEX6.test(s.테두리 ?? '') ? s.테두리 : null)}>
                {도형테두리들.map(([v, 이름, 색]) => (
                  <색칸 key={v || 'n'} 색={색} 이름={이름}
                        지금={(s.테두리 ?? '') === v}
                        누르기={() => 도형바꾸기('테두리', v)} />
                ))}
                {최근색.length > 0 && <span className="swsp" />}
                {최근색.map((색) => (
                  <색칸 key={색} 색={색} 이름={`최근 ${색}`}
                        지금={s.테두리 === 색}
                        누르기={() => 도형바꾸기('테두리', 색)} />
                ))}
                <span className="brk" />
                <색입력 값={s.테두리} 이름="테두리" 로그={set로그}
                          놓기={(v) => { 도형바꾸기('테두리', v); 색기억(v); }} />
              </줄>
              <줄 이름="굵기" 곁={null}>
                <수칸 열쇠="굵기" 값={s.굵기} 기본={1} 열림={!!s.테두리}
                      로그={set로그} 놓기={(n) => 도형바꾸기('굵기', n)} />
              </줄>
              <줄 이름="모서리">
                <수칸 열쇠="모서리" 값={s.모서리} 기본={10}
                      로그={set로그} 놓기={(n) => 도형바꾸기('모서리', n)} />
              </줄>
              <줄 이름="그림자">
                <span className="seg">
                  {도형그림자들.map(([v, 이름]) => (
                    <button key={v || 'n'}
                            className={'chip' + ((s.그림자 ?? '') === v ? ' on' : '')}
                            onClick={() => 도형바꾸기('그림자', v)}>{이름}</button>
                  ))}
                </span>
              </줄>

              <div className="popln" />

              <줄 이름="글자">
                <button className={'chip' + (s.글자 === '반전' ? ' on' : '')}
                        onClick={() => 도형바꾸기('글자', s.글자 === '반전' ? '' : '반전')}
                        title="반전">
                  반전
                </button>
              </줄>
              </>
            );
          })()}

          {/* 요소 머리 + 글자 — **[요소] 탭의 맨 위다.**
              어느 요소를 골랐는지 · 순서 · 계층 · 크기 · 굵게. 갈래별 판은 그 아래고 ·
              도형은 맨 아래다 · 갈래와 무관하게 언제나 같은 자리에 있어야 찾는다 · N-글자 c */}
          {탭 === '요소' && (() => {
            const el = 고른요소;
            if (고른?.비움) return <p className="dim">비운 박스</p>;
            if (!고른) return <p className="dim">박스를 고른다</p>;
            if (!el) return <p className="dim">요소를 고른다 · 위 목록에서 한 줄을 누른다</p>;
            const k = 요소열쇠(el);
            return (
              <>
                <줄 이름="요소" 곁={맛보기(el, k)}>
                  <span className="seg">
                    <button className="chip" onClick={() => 요소옮기기(요소번호, -1)}>↑</button>
                    <button className="chip" onClick={() => 요소옮기기(요소번호, 1)}>↓</button>
                  </span>
                  <button className="chip warn" onClick={() => 요소빼기(요소번호)}>− 요소</button>
                </줄>

                {/* 계층 · 크기는 글자 요소에만 뜬다. 표 · 수치 · 그림엔 갈아탈 곳이 없다 */}
                {글자갈래들.includes(k) && (
                  <>
                    <div className="popln" />

                    <줄 이름="계층" 곁="값은 그대로 나른다">
                      <span className="seg">
                        {글자갈래들.map((v) => (
                          <button key={v} className={'chip' + (k === v ? ' on' : '')}
                                  onClick={() => 계층바꾸기(v)}>{v}</button>
                        ))}
                      </span>
                    </줄>
                    <줄 이름="크기" 곁={el.크기 ? `${el.크기}px · 행간 42` : '계층 기본'}>
                      <span className="seg">
                        <button className={'chip' + (el.크기 == null ? ' on' : '')}
                                onClick={() => 크기바꾸기(null)}>기본</button>
                        {크기계단.map((n) => (
                          <button key={n} className={'chip' + (el.크기 === n ? ' on' : '')}
                                  onClick={() => 크기바꾸기(n)}>{n}</button>
                        ))}
                      </span>
                    </줄>
                  </>
                )}
              </>
            );
          })()}

          {탭 === '요소' && 고른갈래 === '비움' && (() => {
            /* 비움 — **앱이 못 하는 것을 키노트로 넘긴다** · 설계 §5-11 의 요소판이다.
               박스 「비움」은 박스를 통째로 넘기고 이건 그 높이만 넘긴다.
               좌표는 `node scripts/비움.mjs <문안>` 이 표로 뽑는다 · N-자유 c */
            const v = 고른요소.비움;
            const [n, 무엇] = Array.isArray(v) ? [v[0], v[1] ?? ''] : [v, ''];
            return (
              <>
                <div className="popln" />

                <줄 이름="높이" 곁={`${n} × 42 = ${n * 42}px`}>
                  <수칸 열쇠="블록" 값={n} 기본={2}
                        로그={set로그} 놓기={(x) => 비움값('높이', x)} />
                </줄>
                <줄 이름="무엇" 곁="키노트에서 무엇으로 채울지">
                  <입력 값={무엇} 힌트="단계띠 · 도표 · 사진"
                        놓기={(x) => 비움값('무엇', x)} />
                </줄>
                <줄 이름="비움">
                  <button className="chip warn" onClick={() => 요소빼기(요소번호)}>− 비움</button>
                </줄>
              </>
            );
          })()}

          {탭 === '요소' && 고른갈래 === '표' && (() => {
            const z = 고른;
            const t = z?.표 ?? null;
            const 켬 = !!z && !z.비움;
            const n = 표열수(t);
            const 줄무늬 = !!t?.배경?.행?.some(Boolean);
            const 헤더배경 = t?.배경?.헤더 ?? '';
            const 폭갈래 = !t?.폭 ? '균등' : 백분율폭(t.폭) ? '%' : '칸수';
            const 비율 = 폭갈래 === '%' ? 유효비율(t.폭) : null;
            const 높이갈 = t ? 높이갈래(t.높이) : '줄';
            const 빈자리 = t ? 공백자리(t.높이) : '없음';
            const 높이비율 = 높이갈 === '%' ? 유효비율(t.높이.map((v) => String(슬롯값(v)))) : null;
            const 슬롯보기 = 높이갈 === '칸수' || 높이갈 === '%'
              ? t.높이.map((v, k) => (공백인가(v) ? `빈 ${높이갈 === '%' ? 높이비율[k] + '%' : 슬롯값(v)}`
                  : String(높이갈 === '%' ? 높이비율[k] + '%' : 슬롯값(v))))
              : [];
            if (!켬) return null;
            if (!t) return <button className="chip" onClick={표만들기}>+ 표</button>;
            return (
              <>
                <div className="popln" />

              <줄 이름="열" 곁={`${n}열`}>
                <span className="seg">
                  <button className="chip" onClick={표열빼기} title="끝 열을 뺀다">−</button>
                  <button className="chip" onClick={표열넣기} title="끝에 열을 넣는다">+</button>
                </span>
              </줄>
              <줄 이름="행" 곁={`${t.행.length}행${t.헤더 ? ' + 헤더' : ''}`}>
                <span className="seg">
                  <button className="chip" onClick={표행빼기} title="끝 행을 뺀다">−</button>
                  <button className="chip" onClick={표행넣기} title="끝에 행을 넣는다">+</button>
                </span>
                <button className={'chip' + (t.헤더 ? ' on' : '')}
                        onClick={() => 표헤더(!t.헤더)}
                        title="헤더행">
                  헤더행
                </button>
              </줄>
              <줄 이름="선">
                <span className="seg">
                  {표선들.map(([v, 이름]) => (
                    <button key={v} className={'chip' + ((t.선 ?? '가로') === v ? ' on' : '')}
                            onClick={() => 표선(v)}>{이름}</button>
                  ))}
                </span>
              </줄>
              <줄 이름="폭"
                  곁={폭갈래 === '균등' ? null
                    : 폭갈래 === '칸수' ? t.폭.join(' : ') : `${비율.join(' + ')} = 100`}>
                <span className="seg">
                  {표폭갈래들.map(([v, 이름]) => (
                    <button key={v} className={'chip' + (폭갈래 === v ? ' on' : '')}
                            onClick={() => 표폭갈래(v)}>
                      {이름}
                    </button>
                  ))}
                </span>
                {폭갈래 !== '균등' && <span className="brk" />}
                {폭갈래 === '칸수' && Array.from({ length: n }, (_, c) => (
                  <수칸 key={c} 열쇠="폭" 값={t.폭[c]} 기본={1} 좁게
                        로그={set로그} 놓기={(v) => 표폭(c, v)} />
                ))}
                {폭갈래 === '%' && Array.from({ length: n }, (_, c) => (
                  <수칸 key={c} 열쇠="비율" 값={비율[c]} 기본={비율[c]} 좁게
                        로그={set로그} 놓기={(v) => 표비율(c, v)} />
                ))}
              </줄>

              <줄 이름="높이"
                  곁={높이갈 === '줄' || 높이갈 === '채움' ? null : 슬롯보기.join(' · ')}>
                <span className="seg">
                  {높이갈래들.map(([v, 이름]) => (
                    <button key={v} className={'chip' + (높이갈 === v ? ' on' : '')}
                            onClick={() => 표높이갈래(v)}>
                      {이름}
                    </button>
                  ))}
                </span>
                {(높이갈 === '칸수' || 높이갈 === '%') && <span className="brk" />}
                {(높이갈 === '칸수' || 높이갈 === '%') && t.높이.map((v, k) => (
                  <수칸 key={k}
                        열쇠={높이갈 === '%' ? (공백인가(v) ? '빈비율' : '비율')
                          : (공백인가(v) ? '빈칸수' : '칸수')}
                        값={높이갈 === '%' ? 높이비율[k] : 슬롯값(v)}
                        기본={높이갈 === '%' ? 높이비율[k] : 슬롯값(v)} 좁게
                        로그={set로그} 놓기={(n) => 표높이값(k, n)} />
                ))}
              </줄>
              {높이갈 !== '줄' && (
                <줄 이름="공백">
                  <span className="seg">
                    {공백자리들.map(([v, 이름]) => (
                      <button key={v} className={'chip' + (빈자리 === v ? ' on' : '')}
                              onClick={() => 표공백(v)}>
                        {이름}
                      </button>
                    ))}
                  </span>
                </줄>
              )}

              <div className="popln" />

              <줄 이름="헤더 배경"
                  곁={도형배경들.find(([v]) => v === 헤더배경)?.[1]
                    ?? (HEX6.test(헤더배경) ? 헤더배경 : null)}>
                {도형배경들.map(([v, 이름, 색]) => (
                  <색칸 key={v || 'n'} 색={색} 이름={이름}
                        지금={헤더배경 === v}
                        누르기={() => 표배경헤더(v)} />
                ))}
                {최근색.length > 0 && <span className="swsp" />}
                {최근색.map((색) => (
                  <색칸 key={색} 색={색} 이름={`최근 ${색}`}
                        지금={헤더배경 === 색}
                        누르기={() => 표배경헤더(색)} />
                ))}
                <span className="brk" />
                <색입력 값={헤더배경} 이름="헤더 배경" 로그={set로그}
                          놓기={(v) => { 표배경헤더(v); 색기억(v); }} />
              </줄>
              <줄 이름="줄무늬">
                <button className={'chip' + (줄무늬 ? ' on' : '')}
                        onClick={() => 표줄무늬(!줄무늬)}>줄무늬</button>
              </줄>

              <div className="popln" />

              <줄 이름="표">
                <button className="chip warn" onClick={표없애기}>− 표</button>
              </줄>
              </>
            );
          })()}

          {탭 === '요소' && (고른갈래 === '그림' || !고른갈래) && (() => {
            const z = 고른요소;
            const g = 그림읽기(z);
            const 켬 = !!고른 && !고른.비움;
            if (!켬) return null;
            /* 그림이 없으면 목록만 낸다 — **고르는 것이 곧 놓는 것이다.**
               「+ 그림」 버튼을 따로 두면 경로 없는 그림이 한 박자 생겨 렌더러가 던지고
               그 페이지가 통째로 오류판이 되어 박스를 다시 못 고른다 · §7 첫째 구멍.
               대신 곁말이 「누르면 놓인다」를 말한다 — 다른 탭의 `+ 표` 박스다 */
            if (!g) {
              if (!그림목록.length) return (
                <p className="dim">assets/ 아래에 그림이 없다 · 파일을 넣고 새로고침한다</p>
              );
              return (
                <>
                <div className="popln" />

                <줄 이름="그림" 곁={`${그림목록.length}개`}>
                  <button className={'chip' + (견본 ? ' on' : '')}
                          onClick={() => set견본((v) => !v)}
                          title="견본을 펴서 누르면 놓인다 · 판의 「+」로도 놓는다">
                    {견본 ? '견본 접기' : '견본 펴기'}
                  </button>
                </줄>
                {견본 && <견본판 목록={그림목록} 지금={null} 누르기={그림놓기} />}
                </>
              );
            }
            const 갈래 = 그림높이갈래(g.높이);
            const 지금것 = 그림목록.find((it) => it.경로 === g.경로);
            return (
              <>
                <div className="popln" />

                {/* **놓은 뒤에는 놓은 것만 낸다** · N-글자 e.
                    견본 갤러리를 그대로 두면 그림을 골랐는데 「고르는 판」이 다시 떠서
                    무엇이 놓인 것인지 안 읽힌다 · 사용자 지적. 바꾸는 길은 아래 「바꾸기」다 */}
                <줄 이름="그림" 곁={g.경로}>
                  <span className="imgs">
                    <button className="imgc on" title={g.경로}
                            onClick={() => 그림놓기(g.경로)}>
                      <img src={`/api/img/${g.경로.slice('assets/'.length)}`} alt="" />
                      <em>{지금것?.이름 ?? g.경로.split('/').pop()}</em>
                    </button>
                  </span>
                </줄>

                <div className="popln" />

                {/* **실치수를 곁말로 낸다** · N-그림 e · 사용자 요구.
                    높이는 언제나 42 배수라 값이 셋(채움 · 블록 · %) 다 블록 수로 떨어지는데
                    **가로는 레이아웃과 안여백이 정해서 눈으로 알 길이 없었다.**
                    그 둘을 같이 보여야 그 크기에 맞춰 그림을 잘라 붙일 수 있다.
                    계산 안 하고 판에서 잰다 — 렌더러와 갈라질 자리를 안 만든다 */}
                <줄 이름="높이"
                    곁={요소칸
                      ? `${요소칸.가로} × ${요소칸.세로}px · ${Math.round(요소칸.세로 / 42)}칸`
                      : (갈래 === '채움' ? '남은 높이를 다 먹는다'
                        : 갈래 === '블록' ? `42 × ${g.높이} = ${g.높이 * 42}px` : null)}>
                  <span className="seg">
                    {그림높이갈래들.map(([v, 이름]) => (
                      <button key={v} className={'chip' + (갈래 === v ? ' on' : '')}
                              onClick={() => 그림높이갈래놓기(v)}>{이름}</button>
                    ))}
                  </span>
                  {갈래 !== '채움' && <span className="brk" />}
                  {갈래 === '블록' && (
                    <수칸 열쇠="블록" 값={g.높이} 기본={6}
                          로그={set로그} 놓기={(n) => 그림값('높이', n)} />
                  )}
                  {갈래 === '%' && (
                    <수칸 열쇠="그림비율" 값={퍼센트수(g.높이)} 기본={50}
                          로그={set로그} 놓기={(n) => 그림값('높이', 퍼센트글(n))} />
                  )}
                </줄>
                <줄 이름="맞춤"
                    곁={(g.맞춤 ?? '전체') === '전체' ? '다 보인다' : '채우고 자른다'}>
                  <span className="seg">
                    {맞춤들.map(([v, 이름]) => (
                      <button key={v} className={'chip' + ((g.맞춤 ?? '전체') === v ? ' on' : '')}
                              onClick={() => 그림값('맞춤', v === '전체' ? '' : v)}>{이름}</button>
                    ))}
                  </span>
                </줄>

                <div className="popln" />

                <줄 이름="설명" 곁="그림이 안 뜰 때 남는 글">
                  <입력 값={g.설명 ?? ''} 놓기={(v) => 그림값('설명', v)} />
                </줄>

                <div className="popln" />

                {/* 바꾸기 — **접어 둔다** · N-그림 c. 견본이 늘 깔려 있으면
                    이 박스에 무엇이 놓였는지가 위의 한 칸에 안 읽힌다 · 사용자 지적 */}
                <줄 이름="바꾸기" 곁={`${그림목록.length}개`}>
                  <button className={'chip' + (견본 ? ' on' : '')}
                          onClick={() => set견본((v) => !v)}
                          title="견본을 펴서 누르면 갈아 끼운다">
                    {견본 ? '견본 접기' : '견본 펴기'}
                  </button>
                </줄>
                {견본 && <견본판 목록={그림목록} 지금={g.경로} 누르기={그림놓기} />}
                <줄 이름="그림">
                  <button className="chip warn" onClick={그림없애기}>− 그림</button>
                </줄>
              </>
            );
          })()}

          {/* ── 고른 글자 · N-글자 d ────────────────────────
              **요소 범위와 구간 범위가 여기서 갈린다.** 위의 계층 · 크기는 문단 하나를
              통째로 잡고 · 이 아래는 판면에서 끌어서 고른 몇 글자에만 걸린다.

              **갈래별 판 아래에 둔다** · 처음엔 맨 위에 뒀는데 그러면 그림을 골라도
              글자 판이 먼저 떠서 우측이 텍스트 판으로 보인다 · 사용자 지적 · N-글자 e */}
          {탭 === '요소' && 구간갈래.has(고른갈래) && (
            <>
              {/* ── 고른 글자 · N-글자 d ────────────────────────
                  **여기가 요소 범위와 구간 범위가 갈리는 자리다.**
                  위의 계층 · 크기는 문단 하나를 통째로 잡는다. 이 아래는
                  판면에서 끌어서 고른 몇 글자에만 걸린다 · 문안에 표기로 앉는다.

                  칩은 다 `onMouseDown` 을 막는다. 안 막으면 누르는 순간 판면이
                  focus 를 잃고 focusout 이 편집을 닫아 고른 자리가 사라진다. */}
              <줄 이름="고른 글자"
                  곁={고른글자 ? `"${고른글자.글.slice(0, 18)}"` : '판에서 끌어서 고른다'}>
                <button className="chip" onMouseDown={(e) => e.preventDefault()}
                        onClick={굵게} title="**굵게** · 굵기 700 + 강조색이 한 묶음이다">
                  굵게
                </button>
              </줄>

              {/* 색 — **도형 배경 · 테두리와 같은 꼴이다** · N-글자 e.
                  견본 + 최근색 + #RRGGBB 자유 입력. 전에는 여기만 이름 칩 여섯이라
                  한 도크 안에서 색 고르는 법이 둘이었다 · 사용자 지적.
                  이름은 이름대로 둔다 — 문안에서 `{결론|38억원}` 으로 읽힌다 */}
              {(() => {
                const 색토큰 = 고른글자?.토큰.find(색토큰인가) ?? '';
                return (
                  <줄 이름="색" 곁={색토큰 || null}>
                    {구간토큰.색.map((t) => (
                      <색칸 key={t} 색={구간색값[t]} 이름={`${t} ${구간색값[t].slice(1)}`}
                            지금={색토큰 === t} 누르기={() => 구간씌우기(t)} />
                    ))}
                    {최근색.length > 0 && <span className="swsp" />}
                    {최근색.map((색) => (
                      <색칸 key={색} 색={색} 이름={`최근 ${색}`} 지금={색토큰 === 색}
                            누르기={() => 구간씌우기(색)} />
                    ))}
                    <span className="brk" />
                    <색입력 값={색토큰} 이름="글자 색" 로그={set로그}
                              놓기={(v) => { 구간씌우기(v); 색기억(v); }} />
                  </줄>
                );
              })()}

              {구간갈래들.filter(([갈래]) => 갈래 !== '색').map(([갈래, 목록]) => (
                <줄 key={갈래} 이름={갈래}
                    곁={고른글자?.토큰.find((t) => 토큰갈래(t) === 갈래) ?? null}>
                  <span className="seg">
                    {목록.map((t) => (
                      <button key={t}
                              className={'chip' + (고른글자?.토큰.includes(t) ? ' on' : '')}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => 구간씌우기(t)}
                              title={`{${t}|고른 글자}`}>{t}</button>
                    ))}
                  </span>
                </줄>
              ))}

              {/* 벗길 대상 바로 아래다. 위에 두면 무엇을 벗기는지가 흐리다 ·
                  켠 칩을 다시 눌러 하나씩 끄는 길도 그대로 있다 */}
              <줄 이름="민글로" 곁="씌운 것을 다 뗀다">
                <button className="chip warn" onMouseDown={(e) => e.preventDefault()}
                        onClick={민글로}
                        title="고른 자리의 구간 표기와 굵게를 함께 벗긴다">민글로</button>
              </줄>
            </>
          )}

          {탭 === '요소' && (() => {
            /* 요소 도형 — 박스 도형과 **같은 어휘 · 같은 규칙**이다.
               다른 것은 걸리는 범위 하나다 · 박스 사각형이 아니라 요소 한 덩이.
               글자 요소면 렌더러가 좌우 21 을 들인다 · 세로는 안 준다 · N-자유.

               **탭의 꼬리다** · 갈래와 무관하게 언제나 맨 아래에 있다.
               못 고를 때 말은 맨 위 글자 판이 이미 한다 — 여기서 또 하지 않는다 */
            const el = 고른요소;
            if (!el || 고른?.비움) return null;
            const s = el.도형 ?? {};
            const 이름표 = (열쇠, 표) => 표.find(([v]) => v === (s[열쇠] ?? ''))?.[1]
              ?? (HEX6.test(s[열쇠] ?? '') ? s[열쇠] : null);
            return (
              <>
                <div className="popln" />

                <줄 이름="배경" 곁={이름표('배경', 도형배경들)}>
                  {도형배경들.map(([v, 이름, 색]) => (
                    <색칸 key={v || 'n'} 색={색} 이름={이름} 지금={(s.배경 ?? '') === v}
                          누르기={() => 요소도형바꾸기('배경', v)} />
                  ))}
                  {최근색.length > 0 && <span className="swsp" />}
                  {최근색.map((색) => (
                    <색칸 key={색} 색={색} 이름={`최근 ${색}`} 지금={s.배경 === 색}
                          누르기={() => 요소도형바꾸기('배경', 색)} />
                  ))}
                  <span className="brk" />
                  <색입력 값={s.배경} 이름="배경" 로그={set로그}
                            놓기={(v) => { 요소도형바꾸기('배경', v); 색기억(v); }} />
                </줄>
                <줄 이름="투명도">
                  <수칸 열쇠="투명도" 값={s.투명도} 기본={100} 열림={!!s.배경}
                        로그={set로그} 놓기={(n) => 요소도형바꾸기('투명도', n)} />
                </줄>

                <div className="popln" />

                <줄 이름="테두리" 곁={이름표('테두리', 도형테두리들)}>
                  {도형테두리들.map(([v, 이름, 색]) => (
                    <색칸 key={v || 'n'} 색={색} 이름={이름} 지금={(s.테두리 ?? '') === v}
                          누르기={() => 요소도형바꾸기('테두리', v)} />
                  ))}
                  <span className="brk" />
                  <색입력 값={s.테두리} 이름="테두리" 로그={set로그}
                            놓기={(v) => { 요소도형바꾸기('테두리', v); 색기억(v); }} />
                </줄>
                <줄 이름="굵기">
                  <수칸 열쇠="굵기" 값={s.굵기} 기본={1} 열림={!!s.테두리}
                        로그={set로그} 놓기={(n) => 요소도형바꾸기('굵기', n)} />
                </줄>
                <줄 이름="모서리">
                  <수칸 열쇠="모서리" 값={s.모서리} 기본={10}
                        로그={set로그} 놓기={(n) => 요소도형바꾸기('모서리', n)} />
                </줄>
                <줄 이름="그림자">
                  <span className="seg">
                    {도형그림자들.map(([v, 이름]) => (
                      <button key={v || 'n'} className={'chip' + ((s.그림자 ?? '') === v ? ' on' : '')}
                              onClick={() => 요소도형바꾸기('그림자', v)}>{이름}</button>
                    ))}
                  </span>
                </줄>

                <div className="popln" />

                <줄 이름="글자">
                  <button className={'chip' + (s.글자 === '반전' ? ' on' : '')}
                          onClick={() => 요소도형바꾸기('글자', s.글자 === '반전' ? '' : '반전')}>
                    반전
                  </button>
                </줄>
              </>
            );
          })()}

          {/* ── 얹는 층 · N-얹기 ────────────────────────────
              **박스가 아니라 페이지에 붙는다.** 그래서 탭이 따로 하나 든다 —
              박스를 안 골라도 쓸 수 있어야 하고 · 고른 박스와 무관하다.
              좌표는 판 전역 절대다 · 2339 × 1654 · 키노트 슬라이드와 같은 계다 */}
          {탭 === '얹기' && (() => {
            const 목록 = 현재?.얹기 ?? [];
            const o = 얹기번호 == null ? null : (목록[얹기번호] ?? null);
            const k = 얹기열쇠(o);
            const s2 = o?.도형 ?? {};
            const 이름표 = (열쇠, 표) => 표.find(([v]) => v === (s2[열쇠] ?? ''))?.[1]
              ?? (HEX6.test(s2[열쇠] ?? '') ? s2[열쇠] : null);
            return (
              <>
                <줄 이름="얹기" 곁={`${목록.length}개 · 판 ${판W} × ${판H}`}>
                  {얹기갈래들.map(([v, 이름]) => (
                    <button key={v} className="chip"
                            onClick={() => (v === '그림'
                              ? (set얹기번호(null), set견본(true)) : 얹기넣기(v))}>+ {이름}</button>
                  ))}
                </줄>
                {/* 견본 — 고르는 것이 곧 놓는 것이다. 고른 얹기가 있으면 그 자리를 갈아 끼운다 */}
                {견본 && (그림목록.length
                  ? <견본판 목록={그림목록}
                            지금={k === '그림'
                              ? (typeof o.그림 === 'string' ? o.그림 : o.그림?.경로) : null}
                            누르기={얹기그림놓기} />
                  : <p className="dim">assets/ 아래에 그림이 없다 · 파일을 넣고 새로고침한다</p>)}

                {목록.length > 0 && (
                  <div className="elrows">
                    {목록.map((it, j) => (
                      <div key={j} className={'elrow' + (얹기번호 === j ? ' on' : '')}
                           onClick={() => set얹기번호(j)}>
                        <span className="eln">{얹기열쇠(it) ?? '?'}</span>
                        <em>{얹기맛보기(it)}</em>
                        <button className="chip mini" title="위로"
                                onClick={(e) => { e.stopPropagation(); 얹기옮기기(j, -1); }}>↑</button>
                        <button className="chip mini" title="아래로"
                                onClick={(e) => { e.stopPropagation(); 얹기옮기기(j, 1); }}>↓</button>
                        <button className="chip mini warn" title="뺀다"
                                onClick={(e) => { e.stopPropagation(); 얹기빼기(j); }}>−</button>
                      </div>
                    ))}
                  </div>
                )}

                {!o && <p className="dim">얹은 것을 고른다 · 없으면 위에서 놓는다</p>}

                {o && (
                  <>
                    <div className="popln" />

                    <줄 이름="갈래">
                      <span className="seg">
                        {얹기갈래들.map(([v, 이름]) => (
                          <button key={v} className={'chip' + (k === v ? ' on' : '')}
                                  onClick={() => 얹기갈래바꾸기(v)}>{이름}</button>
                        ))}
                      </span>
                    </줄>

                    <줄 이름="층" 곁={(o.층 ?? '뒤') === '뒤' ? '글에 안 가린다' : '글을 덮는다'}>
                      <span className="seg">
                        {얹기층들.map(([v, 이름]) => (
                          <button key={v} className={'chip' + ((o.층 ?? '뒤') === v ? ' on' : '')}
                                  onClick={() => 얹기값('층', v === '뒤' ? undefined : v)}>{이름}</button>
                        ))}
                      </span>
                    </줄>

                    <줄 이름="자리" 곁={`x ${o.x} · y ${o.y} · 끌어서 옮긴다 · Shift 자석`}>
                      <수칸 열쇠="얹x" 값={o.x} 기본={80} 로그={set로그}
                            놓기={(n) => 얹기값('x', n)} />
                      <수칸 열쇠="얹y" 값={o.y} 기본={260} 로그={set로그}
                            놓기={(n) => 얹기값('y', n)} />
                    </줄>

                    {k === '글' && (
                      <>
                        <줄 이름="글" 곁="**굵게** · {강조|글자} 가 그대로 먹는다">
                          <textarea
                            className="barin txin" rows={3}
                            key={`얹글-${slug}-${i}-${얹기번호}`}
                            defaultValue={o.글 ?? ''}
                            onBlur={(e) => { if (e.target.value !== o.글) 얹기값('글', e.target.value); }} />
                        </줄>
                        <줄 이름="폭" 곁={`${o.폭}px · 높이는 글이 정한다`}>
                          <수칸 열쇠="얹폭" 값={o.폭} 기본={2179} 로그={set로그}
                                놓기={(n) => 얹기값('폭', n)} />
                        </줄>
                        <줄 이름="크기" 곁={`행간 ${(o.크기 ?? 24) <= 29 ? 42 : 84}`}>
                          <span className="seg">
                            {얹기글크기들.map((v) => (
                              <button key={v} className={'chip' + ((o.크기 ?? 24) === v ? ' on' : '')}
                                      onClick={() => 얹기값('크기', v)}>{v}</button>
                            ))}
                          </span>
                        </줄>
                        <줄 이름="정렬">
                          <span className="seg">
                            {얹기정렬들.map(([v, 이름]) => (
                              <button key={v} className={'chip' + ((o.정렬 ?? '왼쪽') === v ? ' on' : '')}
                                      onClick={() => 얹기값('정렬', v === '왼쪽' ? undefined : v)}>{이름}</button>
                            ))}
                          </span>
                        </줄>
                      </>
                    )}

                    {k === '선' && (
                      <>
                        <줄 이름="방향">
                          <span className="seg">
                            {선방향들.map(([v, 이름]) => (
                              <button key={v} className={'chip' + (o.선 === v ? ' on' : '')}
                                      onClick={() => 얹기값('선', v)}>{이름}</button>
                            ))}
                          </span>
                        </줄>
                        <줄 이름="길이" 곁={`${o.길이}px`}>
                          <수칸 열쇠={o.선 === '가로' ? '얹가로' : '얹세로'} 값={o.길이}
                                기본={o.선 === '가로' ? 2179 : 1108}
                                로그={set로그} 놓기={(n) => 얹기값('길이', n)} />
                        </줄>
                        <줄 이름="굵기" 곁={`${o.굵기 ?? 1}px`}>
                          <수칸 열쇠="얹굵기" 값={o.굵기} 기본={1} 로그={set로그}
                                놓기={(n) => 얹기값('굵기', n)} />
                        </줄>
                        <줄 이름="색" 곁={도형테두리들.find(([v]) => v === (o.색 ?? ''))?.[1]
                          ?? (HEX6.test(o.색 ?? '') ? o.색 : null)}>
                          {도형테두리들.filter(([v]) => v).map(([v, 이름, 색]) => (
                            <색칸 key={v} 색={색} 이름={이름} 지금={o.색 === v}
                                  누르기={() => 얹기값('색', v)} />
                          ))}
                          {최근색.length > 0 && <span className="swsp" />}
                          {최근색.map((색) => (
                            <색칸 key={색} 색={색} 이름={`최근 ${색}`} 지금={o.색 === 색}
                                  누르기={() => 얹기값('색', 색)} />
                          ))}
                          <span className="brk" />
                          <색입력 값={o.색} 이름="선 색" 로그={set로그}
                                    놓기={(v) => { 얹기값('색', v); 색기억(v); }} />
                        </줄>
                      </>
                    )}

                    {k === '그림' && (() => {
                      const g = typeof o.그림 === 'string' ? { 경로: o.그림 } : (o.그림 ?? {});
                      const 값놓기 = (열쇠, v) => 바꾸기((d) => {
                        const t = 얹기찾기(d);
                        if (!t) return false;
                        if (typeof t.그림 === 'string') t.그림 = { 경로: t.그림 };
                        if (v === '' || v == null) delete t.그림[열쇠]; else t.그림[열쇠] = v;
                        // 경로만 남으면 짧은 꼴로 되돌린다 · 안 보이는 값을 문안에 안 남긴다
                        if (Object.keys(t.그림).length === 1) t.그림 = t.그림.경로;
                      }, { 그리기: true });
                      return (
                        <>
                          <줄 이름="크기" 곁={`${o.폭} × ${o.높이}px · ${(o.폭 / o.높이).toFixed(2)}:1`}>
                            <수칸 열쇠="얹폭" 값={o.폭} 기본={1000} 로그={set로그}
                                  놓기={(n) => 얹기값('폭', n)} />
                            <수칸 열쇠="얹높이" 값={o.높이} 기본={563} 로그={set로그}
                                  놓기={(n) => 얹기값('높이', n)} />
                          </줄>
                          <줄 이름="맞춤"
                              곁={(g.맞춤 ?? '전체') === '전체' ? '다 보인다' : '채우고 자른다'}>
                            <span className="seg">
                              {맞춤들.map(([v, 이름]) => (
                                <button key={v} className={'chip' + ((g.맞춤 ?? '전체') === v ? ' on' : '')}
                                        onClick={() => 값놓기('맞춤', v === '전체' ? '' : v)}>{이름}</button>
                              ))}
                            </span>
                          </줄>
                          <줄 이름="설명" 곁="그림이 안 뜰 때 남는 글">
                            <입력 값={g.설명 ?? ''} 놓기={(v) => 값놓기('설명', v)} />
                          </줄>
                          <줄 이름="바꾸기" 곁={`${그림목록.length}개`}>
                            <button className={'chip' + (견본 ? ' on' : '')}
                                    onClick={() => set견본((v) => !v)}>
                              {견본 ? '견본 접기' : '견본 펴기'}
                            </button>
                          </줄>
                        </>
                      );
                    })()}

                    {k === '도형' && (
                      <>
                        <줄 이름="크기" 곁={`${o.폭} × ${o.높이}px`}>
                          <수칸 열쇠="얹폭" 값={o.폭} 기본={1090} 로그={set로그}
                                놓기={(n) => 얹기값('폭', n)} />
                          <수칸 열쇠="얹높이" 값={o.높이} 기본={1150} 로그={set로그}
                                놓기={(n) => 얹기값('높이', n)} />
                        </줄>

                        <div className="popln" />

                        <줄 이름="배경" 곁={이름표('배경', 도형배경들)}>
                          {도형배경들.map(([v, 이름, 색]) => (
                            <색칸 key={v || 'n'} 색={색} 이름={이름} 지금={(s2.배경 ?? '') === v}
                                  누르기={() => 얹기도형('배경', v)} />
                          ))}
                          {최근색.length > 0 && <span className="swsp" />}
                          {최근색.map((색) => (
                            <색칸 key={색} 색={색} 이름={`최근 ${색}`} 지금={s2.배경 === 색}
                                  누르기={() => 얹기도형('배경', 색)} />
                          ))}
                          <span className="brk" />
                          <색입력 값={s2.배경} 이름="배경" 로그={set로그}
                                    놓기={(v) => { 얹기도형('배경', v); 색기억(v); }} />
                        </줄>
                        <줄 이름="투명도">
                          <수칸 열쇠="투명도" 값={s2.투명도} 기본={100} 열림={!!s2.배경}
                                로그={set로그} 놓기={(n) => 얹기도형('투명도', n)} />
                        </줄>
                        <줄 이름="테두리" 곁={이름표('테두리', 도형테두리들)}>
                          {도형테두리들.map(([v, 이름, 색]) => (
                            <색칸 key={v || 'n'} 색={색} 이름={이름} 지금={(s2.테두리 ?? '') === v}
                                  누르기={() => 얹기도형('테두리', v)} />
                          ))}
                          <span className="brk" />
                          <색입력 값={s2.테두리} 이름="테두리" 로그={set로그}
                                    놓기={(v) => { 얹기도형('테두리', v); 색기억(v); }} />
                        </줄>
                        <줄 이름="굵기">
                          <수칸 열쇠="굵기" 값={s2.굵기} 기본={1} 열림={!!s2.테두리}
                                로그={set로그} 놓기={(n) => 얹기도형('굵기', n)} />
                        </줄>
                        <줄 이름="모서리">
                          <수칸 열쇠="모서리" 값={s2.모서리} 기본={10}
                                로그={set로그} 놓기={(n) => 얹기도형('모서리', n)} />
                        </줄>
                        <줄 이름="그림자">
                          <span className="seg">
                            {도형그림자들.map(([v, 이름]) => (
                              <button key={v || 'n'} className={'chip' + ((s2.그림자 ?? '') === v ? ' on' : '')}
                                      onClick={() => 얹기도형('그림자', v)}>{이름}</button>
                            ))}
                          </span>
                        </줄>
                      </>
                    )}

                    <줄 이름="얹기">
                      <button className="chip warn" onClick={() => 얹기빼기(얹기번호)}>− 얹기</button>
                    </줄>
                  </>
                )}
              </>
            );
          })()}
        </div>
      </aside>
    </div>
  );
}
