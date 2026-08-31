'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 빌드, PDF, 문안저장, 문안불러오기 } from '../actions.js';
import { render } from '../../render/index.js';

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

/* ── 고친 DOM 을 원문 표기로 되돌린다 ──
   판면에서 그 자리에 타이핑하면 결과는 HTML 이다. 그대로 저장하면 문안의 원본이
   HTML 이 되어 버린다. `**굵게**` · {TBD} · {→05} · 줄바꿈으로 되돌린다.
   왕복은 scripts/roundtrip.mjs 가 전수 검사한다. */
function 원문(node) {
  let s = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { s += n.nodeValue; continue; }
    const 이름 = n.nodeName;
    if (이름 === 'BR') { s += '\n'; continue; }
    const cl = n.classList;
    if (cl?.contains('tbd')) { s += cl.contains('co') ? '{TBD협의}' : '{TBD}'; continue; }
    if (cl?.contains('ar')) {
      s += '{→' + n.textContent.replace(/^\s*→\s*/, '').replace(/^p\./, '').trim() + '}';
      continue;
    }
    if (이름 === 'B' || 이름 === 'STRONG') { s += '**' + 원문(n) + '**'; continue; }
    s += 원문(n);
  }
  return s;   // NBSP 는 그대로 둔다
}

/* 렌더러가 던진 오류를 판 자리에 그린다 — 화면을 죽이지 않는다.
   옛 12칸 트랙 문안 넷은 새 렌더러가 못 그린다. 골라도 앱이 살아 있어야 한다.
   그리는 법은 봉인본으로만 된다 · node scripts/build.js <문안> --v3 */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function 오류판(doc, i, e) {
  const 옛체계 = /구성에 띠가 없다|골격 "undefined"|옛 열쇠 "판면"/.test(e.message);
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
<h1>이 면은 못 그린다</h1>
<div class="m">${esc(e.message)}</div>
<p class="s">${esc(doc?.문서명 ?? '')} · ${i + 1}번째 면</p>
${옛체계 ? `<p><b>옛 12칸 트랙 문안이다.</b> 새 렌더러가 못 읽는다.<br>
봉인본으로만 그려진다 · <code>node scripts/build.js &lt;문안&gt; --v3</code></p>` : ''}
</div></body></html>`;
}

const 새면 = (번호) => ({
  번호, 제목: '새 면', 모드: '카피',
  카피: { 메인: '', 서브: '' }, 논지: '',
  골격: 'G2', 자리: [{ 제목: '자리' }, { 제목: '자리' }],
});

const 도형배경들 = [
  ['', '없음', null],
  ['블록배경', '블록배경 F4F6F8', '#F4F6F8'],
];
const 도형테두리들 = [['', '없음', null], ['선', '선 E4E8EC', '#E4E8EC'], ['강조', '강조 2D4D6E', '#2D4D6E']];
const 도형그림자들 = [['', '없음'], ['약', '약'], ['중', '중']];
// 단계띠 · N-배경 c — 칠은 도형과 같은 색 어휘를 쓴다
const 새띠 = () => ({ 현재: 0, 칸: [['1단계', '내용'], ['2단계', '내용'], ['3단계', '내용']] });
/* 그림 · N-그림 — 렌더러의 그림그리기() 가 받는 것과 같아야 한다.
   높이 갈래는 표와 같은 어휘다(§N-배경 b7). 다만 그림은 하나뿐이라 「몫」이 없다 —
   나눌 상대가 없어서 정수는 곧 블록 수다. */
const 맞춤들 = [['전체', '전체'], ['채우기', '채우기']];
const 그림높이갈래들 = [['채움', '채움'], ['블록', '블록'], ['%', '%']];
const 그림높이갈래 = (h) => (h == null || h === '채움' ? '채움'
  : Number.isInteger(h) ? '블록' : '%');
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/* ── 표 칩 — N-배경 b2 ──────────────────────────────────
   렌더러의 표그리기() 가 읽는 열쇠만 여기서 만든다 · **머리 · 행 · 폭 · 높이 · 선 · 칠**.
   칠은 도형 배경과 **같은 색 어휘**를 쓴다(배경이름) — 표 전용 색을 새로 만들지 않는다.

   실물 50건이 2 ~ 4열이고 9열 1건이 예외다 · 설계 §5-4.
   열 상한 8 은 렌더러의 「폭」 상한과 같은 값이다 — 여기서 막는 것은 편의고
   진짜 계약은 렌더러가 지킨다. */
const 표선들 = [['가로', '가로'], ['격자', '격자'], ['없음', '없음']];
const 표열최대 = 8;
/* 폭 갈래 셋 · N-배경 b3 — 렌더러의 표열() 이 받는 것과 같아야 한다.
     균등   폭 열쇠가 없다
     몫     [1, 2, 1]                  균등 트랙 몇 개를 먹느냐 · 안쪽 거터를 열이 먹는다
     %      ["25%","30%","15%","30%"]  거터를 뺀 나머지의 % · 합 100
   몫과 % 는 같은 물건이 아니다 — 30% 를 몫으로 흉내 내면 4px 넓다. 섞어 쓰지 않는다. */
const 표폭갈래들 = [['균등', '균등'], ['몫', '몫'], ['%', '%']];
const 비율하한 = 5;
const 백분율폭 = (폭) => Array.isArray(폭) && typeof 폭[0] === 'string';
const 퍼센트수 = (v) => Number(String(v).replace('%', ''));
const 퍼센트글 = (n) => `${n}%`;
/* 마지막 열이 나머지를 다 받는다 · 렌더러의 표열() 과 같은 규칙이다 · N-배경 b4.
   그래서 화면에 보이는 값도 **적힌 값이 아니라 그려지는 값**이어야 한다 —
   손으로 합 99 를 적어 둔 문안을 열면 마지막 칸이 그 1 을 먹은 값으로 뜬다. */
/* 높이 슬롯 · N-배경 b5 · b7 — **가로가 「폭」이면 세로는 「높이」다.**
     없음 · "채움" · 몫 [1,2,1] · % ["30%","70%"] · 공백 { "공백": n }
   「채움」은 열쇠가 아니라 높이에 주는 값이다. 공백은 칸 수에 안 들고
   **남는 42 덩어리를 받는 자리**다. */
const 높이갈래들 = [['줄', '줄'], ['채움', '채움'], ['몫', '몫'], ['%', '%']];
const 공백자리들 = [['없음', '없음'], ['위', '위'], ['아래', '아래'], ['위아래', '위아래']];
const 공백인가 = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const 슬롯값 = (v) => (공백인가(v) ? v.공백 : v);
const 높이갈래 = (v) => (!v ? '줄' : v === '채움' ? '채움'
  : typeof 슬롯값(v[0]) === 'string' ? '%' : '몫');
const 높이기본 = (칸수, 갈래) => {
  if (갈래 === '몫') return Array.from({ length: 칸수 }, () => 1);
  const 몫 = Math.floor(100 / 칸수);
  const w = Array.from({ length: 칸수 }, () => 몫);
  w[칸수 - 1] += 100 - 몫 * 칸수;              // 나머지는 마지막이 받는다
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
const 새표 = () => ({ 머리: ['구분', '내용'], 행: [['칸', '칸'], ['칸', '칸']] });
// 머리를 끄면 행 첫 줄이 칸 수를 나른다 — 렌더러의 셈과 같은 순서다
const 표열수 = (t) => t?.머리?.length ?? t?.행?.[0]?.length ?? 0;
/* 지금 칠이 줄무늬 그대로인가 — 한 줄 걸러 같은 색이고 행과 길이가 같은가.
   행을 넣을 때 무늬를 이어 칠할지 가르는 자리다. 손으로 칠한 표는 안 건드린다 */
const 줄무늬인가 = (t) => Array.isArray(t.칠?.행)
  && t.칠.행.length === t.행.length
  && t.칠.행.every((v, j) => (j % 2 ? v === 줄무늬색 : v == null));
// 아무 색도 안 남으면 「칠」 을 통째로 없앤다. 안 보이는 값을 문안에 남기지 않는다
const 칠정리 = (t) => {
  const c = t.칠;
  if (!c) return;
  if (Array.isArray(c.행) && !c.행.some(Boolean)) delete c.행;
  if (c.머리 == null && c.행 == null) delete t.칠;
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
                 폭: [1, 표열최대], 비율: [비율하한, 100 - 비율하한],
                 몫: [1, 20], 빈몫: [0, 20], 빈비율: [0, 100 - 비율하한],
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
function 입력({ 값, 놓기, 자리표 }) {
  const [글, set글] = useState(값 ?? '');
  useEffect(() => { set글(값 ?? ''); }, [값]);
  const 맞추기 = () => { const v = 글.trim(); if (v !== (값 ?? '')) 놓기(v); };
  return (
    <input className="barin" style={{ width: '100%' }} type="text"
           value={글} placeholder={자리표}
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
function 색칸({ 색, 이름, 지금, 누르기 }) {
  return (
    <button className={'sw' + (지금 ? ' on' : '') + (색 ? '' : ' none')}
            style={색 ? { background: 색 } : undefined}
            title={이름} onClick={누르기} />
  );
}

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
  const [외곽선, set외곽선] = useState(false);  // 자리 · 밴드 외곽선 · rules/page.css .wrap.dbg
  // 배율 · null 이면 창에 맞춘다. 숫자면 그 배율로 못박는다.
  // 키노트와 견주려면 못박아야 한다 — 키노트 50% 와 여기 50% 가 같은 크기다
  const [배율, set배율] = useState(null);
  // 고른 자리 번호
  const [자리번호, set자리번호] = useState(null);
  // 오른쪽 도크 · 지금 연 탭
  const [탭, set탭] = useState('도형');
  /* assets/ 아래 그림 목록 · 한 번만 받는다. 파일을 새로 넣으면 새로고침한다 —
     문안 파일과 같은 규칙이다(밖에서 고치면 다시 읽어야 한다 · v8 §9 ⑦) */
  const [그림목록, set그림목록] = useState([]);
  useEffect(() => {
    fetch('/api/img')
      .then((r) => r.json())
      .then((j) => set그림목록(Array.isArray(j?.그림) ? j.그림 : []))
      .catch(() => { /* 못 받으면 빈 목록이다. 경로를 손으로 적을 수 있다 */ });
  }, []);

  /* 최근 쓴 색 — 견본에 없는 색은 hex 로 적어야 하는데 같은 색을 여러 자리에 줄 때
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
  const 면ref = useRef(0);
  const 시각ref = useRef(0);
  const 자ref = useRef(false);
  const 외곽선ref = useRef(false);
  const 스택 = useRef([]);        // 되돌리기 — 문서 스냅샷
  const 앞스택 = useRef([]);      // 다시 하기

  const 불러오기 = useCallback(async (s) => {
    const r = await 문안불러오기(s);
    if (!r.ok) return set로그(r.사유);
    스택.current = []; 앞스택.current = []; set되돌림(0);
    문서ref.current = r.doc;   // 판본 useMemo 가 이 렌더에서 바로 읽는다
    setDoc(r.doc); setMtime(r.mtime); setI(0);
    set자(!!r.doc.기준선);   // 문안이 "기준선": true 면 켠 채로 연다
    // 외곽선은 문안에서 안 읽는다 — 검사용이라 문서에 남을 물건이 아니다.
    // 문안에 남는 자리 테두리는 "구분선" 이고 그건 렌더러가 판면에 그린다
    set외곽선(false);
    set더러움(false); set판본키((n) => n + 1);
  }, []);

  useEffect(() => { if (slug) 불러오기(slug); }, [slug, 불러오기]);
  useEffect(() => { 문서ref.current = doc; }, [doc]);
  useEffect(() => { 면ref.current = i; }, [i]);
  useEffect(() => { 시각ref.current = mtime; }, [mtime]);
  useEffect(() => { 자ref.current = 자; }, [자]);
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

  /* 고른 자리에 테두리를 입힌다 */
  useEffect(() => {
    const d = 틀.current?.contentDocument;
    d?.querySelectorAll('[data-자리]').forEach((el) =>
      el.classList.toggle('pick', Number(el.getAttribute('data-자리')) === 자리번호));
  }, [자리번호, 판본키]);

  /* 면을 옮기거나 문안을 갈면 고르기를 푼다 */
  useEffect(() => { set자리번호(null); }, [i, slug]);

  /* 고른 자리를 비우거나 되돌린다.
     비움은 내용과 함께 못 산다 — 렌더러가 오류를 던진다. 그래서 내용이 있으면 막는다. */
  const 자리비움 = (값) => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (!z) return false;
    if (값) {
      // 도형도 함께 못 산다 — 비움은 「출력에 아무것도 안 나간다」가 계약이다.
      // 목록은 렌더러(블록())가 막는 것과 **같아야 한다**. 표가 빠져 있어
      // 표가 있는 자리를 비우면 렌더러가 던지고 판이 오류판으로 떨어졌다
      const 있는것 = ['제목', '요약', '문단', '목록', '번호목록', '표', '단계띠', '수치', '그림', '출처', '도형']
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

  /* 고른 자리의 도형을 고친다 — 배경 · 테두리 · 모서리 · 그림자 · 투명도 · 글자 반전.
     빈 값을 주면 그 열쇠를 지우고 · 남는 열쇠가 없으면 "도형" 을 통째로 없앤다.
     안 보이는 값을 문안에 남기지 않는다 — 렌더러가 도형 문자열을 안 내는 것과 같은 규칙이다. */
  const 도형바꾸기 = (열쇠, 값) => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (!z) return false;
    if (z.비움) { set로그('비운 자리에는 도형을 못 준다 · 비움을 먼저 푼다'); return false; }
    const s = { ...(z.도형 ?? {}) };
    if (값 === '' || 값 == null) delete s[열쇠]; else s[열쇠] = 값;
    if (Object.keys(s).length) z.도형 = s; else delete z.도형;
  }, { 그리기: true });

  /* ── 표 · N-배경 b2 ────────────────────────────────────
     **칸 안 글자는 여기서 안 고친다** — 판면에서 그 칸을 눌러 고친다.
     렌더러가 칸마다 `data-p:["자리",i,"표","머리",c]` 를 붙여 두었다.
     이 패널이 맡는 것은 **틀**이다 · 열 · 행 · 머리행 · 선 · 폭 · 높이 · 칠.

     열과 행을 넣고 뺄 때 머리 · 모든 행 · 폭 · 높이 · 칠 이 **함께** 움직여야 한다.
     하나라도 어긋나면 렌더러가 「행마다 칸 수가 같다」에서 던진다. */
  const 표바꾸기 = (fn) => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (!z?.표) return false;
    return fn(z.표, z);
  }, { 그리기: true });

  const 표만들기 = () => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (!z || z.표) return false;
    if (z.비움) { set로그('비운 자리에는 표를 못 놓는다 · 비움을 먼저 푼다'); return false; }
    z.표 = 새표();
  }, { 그리기: true });
  const 표없애기 = () => 표바꾸기((t, z) => { delete z.표; });

  const 표열넣기 = () => 표바꾸기((t) => {
    const n = 표열수(t);
    if (n >= 표열최대) { set로그(`열은 ${표열최대} 까지다`); return false; }
    if (t.머리) t.머리.push('');
    t.행.forEach((r) => r.push(''));
    if (백분율폭(t.폭)) {
      /* % 는 합이 언제나 100 이다. 새 열 몫을 떼고 나머지를 그 비율대로 줄인다 —
         비율은 지키고 합만 맞춘다. **새 열이 마지막이므로 나머지를 그것이 받는다** */
      const 새몫 = Math.max(비율하한, Math.round(100 / (n + 1)));
      const 준 = 유효비율(t.폭).map((v) => Math.max(1, Math.round(v * (100 - 새몫) / 100)));
      t.폭 = [...준, 100 - 준.reduce((a, b) => a + b, 0)].map(퍼센트글);
    } else if (t.폭) t.폭.push(1);
  });
  const 표열빼기 = () => 표바꾸기((t) => {
    if (표열수(t) <= 1) { set로그('마지막 열은 지우지 않는다 · 표를 지운다'); return false; }
    if (t.머리) t.머리.pop();
    t.행.forEach((r) => r.pop());
    if (백분율폭(t.폭)) {
      t.폭.pop();
      t.폭 = 유효비율(t.폭).map(퍼센트글);      // 뺀 몫은 마지막 열이 받는다 · 합 100
    } else if (t.폭) t.폭.pop();
  });
  const 표행넣기 = () => 표바꾸기((t) => {
    // 지금 칠이 줄무늬 그대로면 무늬를 이어 칠한다.
    // 손으로 칠한 행은 안 건드리고 자리만 맞춘다 — 칠.행 은 행과 길이가 같아야 한다
    const 무늬 = 줄무늬인가(t);
    t.행.push(Array.from({ length: 표열수(t) }, () => ''));
    if (t.칠?.행) t.칠.행.push(무늬 && (t.행.length - 1) % 2 ? 줄무늬색 : null);
    높이맞추기(t);
  });
  const 표행빼기 = () => 표바꾸기((t) => {
    if (t.행.length <= 1) { set로그('마지막 행은 지우지 않는다 · 표를 지운다'); return false; }
    t.행.pop();
    if (t.칠?.행) { t.칠.행.pop(); 칠정리(t); }
    높이맞추기(t);
  });

  /* 머리행 — 켜면 빈 머리를 세우고 · 끄면 머리와 머리 칠을 같이 지운다.
     지운 글자는 ⌘Z 로 돌아온다 */
  const 표머리 = (켬) => 표바꾸기((t) => {
    if (켬) {
      if (t.머리) return false;
      t.머리 = Array.from({ length: 표열수(t) }, () => '');
    } else {
      if (!t.머리) return false;
      delete t.머리;
      if (t.칠) { delete t.칠.머리; 칠정리(t); }
    }
    높이맞추기(t, '앞');      // 머리행은 첫 칸이다
  });

  // 「가로」는 렌더러의 기본값이다. 기본과 같은 값을 문안에 남기지 않는다
  const 표선 = (v) => 표바꾸기((t) => { if (v === '가로') delete t.선; else t.선 = v; });

  /* 폭 갈래를 바꾼다 · 균등 · 몫 · % · N-배경 b3.
     갈래를 옮길 때는 값을 이어 나르지 않는다 — 몫 2 와 2% 는 뜻이 다르다.
     균등에서 시작하는 것이 언제나 읽히는 값이다 */
  const 표폭갈래 = (갈래) => 표바꾸기((t) => {
    const n = 표열수(t);
    const 지금 = !t.폭 ? '균등' : 백분율폭(t.폭) ? '%' : '몫';
    if (갈래 === 지금) return false;
    if (갈래 === '균등') { delete t.폭; return; }
    if (갈래 === '몫') { t.폭 = Array.from({ length: n }, () => 1); return; }
    const 몫 = Math.floor(100 / n);
    const w = Array.from({ length: n }, () => 몫);
    w[n - 1] += 100 - 몫 * n;                  // 나머지는 마지막 열이 받는다 · 합 100
    t.폭 = w.map(퍼센트글);
  });

  /* 몫 — 균등 트랙을 몇 개 먹느냐다. 열마다 따로 적는다 */
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

  const 표칠머리 = (v) => 표바꾸기((t) => {
    // 머리행이 없으면 칠할 자리가 없다 — 안 보이는 열쇠를 문안에 남기지 않는다
    if (!t.머리) { set로그('머리행이 없다 · 머리행을 먼저 켠다'); return false; }
    const c = { ...(t.칠 ?? {}) };
    if (v === '' || v == null) delete c.머리; else c.머리 = v;
    t.칠 = c; 칠정리(t);
  });
  // 줄무늬 — 한 줄 걸러 칠한다. 행마다 색을 따로 주는 자리는 아직 없다
  const 표줄무늬 = (켬) => 표바꾸기((t) => {
    const c = { ...(t.칠 ?? {}) };
    if (켬) c.행 = t.행.map((_, j) => (j % 2 ? 줄무늬색 : null));
    else delete c.행;
    t.칠 = c; 칠정리(t);
  });

  /* 높이 — 남는 높이를 칸들이 42 걸음으로 나눠 갖는다 · N-배경 b5 · b7.
     앞에 문단 · 목록이 있으면 줄 수를 못 세서 렌더러가 던진다.
     같은 말을 여기서 먼저 한다 — 판이 오류판으로 떨어지기 전에 막는 쪽이 낫다 */
  const 표칸수 = (t) => t.행.length + (t.머리 ? 1 : 0);

  /* 높이 배열은 **칸 수와 자리를 맞춰야 한다.** 행을 넣고 빼거나 머리행을 껐다 켜면
     슬롯도 같이 움직인다 — 안 맞추면 렌더러가 「높이에 칸이 N개다」로 던진다.
     머리행은 첫 칸이라 앞에서 · 행은 끝에서 넣고 뺀다. */
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
    const 막는것 = ['문단', '목록', '번호목록', '단계띠', '수치'].filter((k) => z[k] != null);
    if (막는것.length) {
      set로그(`높이는 앞에 ${막는것.join(' · ')} 가 있으면 못 준다 · 제목 · 요약만 둔다`);
      return false;
    }
    if (v === '채움') { t.높이 = '채움'; return; }
    // 갈래를 옮길 때 값을 이어 나르지 않는다 — 몫 2 와 2% 는 뜻이 다르다.
    // 공백 자리는 지킨다. 그것이 이 갈래의 쓸모다
    const 자리 = 공백자리(t.높이);
    const 칸 = 높이기본(표칸수(t), v);
    t.높이 = [
      ...(자리 === '위' || 자리 === '위아래' ? [빈슬롯(v)] : []),
      ...칸,
      ...(자리 === '아래' || 자리 === '위아래' ? [빈슬롯(v)] : []),
    ];
  });

  /* 공백 자리 — 남는 42 덩어리를 위 · 아래로 몬다.
     균등에서 고르면 같은 높이의 몫으로 갈아 준다. 균등에는 공백을 끼울 자리가 없다 */
  const 표공백 = (자리) => 표바꾸기((t) => {
    const 갈래 = 높이갈래(t.높이);
    if (갈래 === '줄') { set로그('높이를 먼저 준다 · 채움 · 몫 · % 중 하나'); return false; }
    if (공백자리(t.높이) === 자리) return false;
    const v = 갈래 === '%' ? '%' : '몫';
    const 칸 = 갈래 === '채움' ? 높이기본(표칸수(t), v)
      : t.높이.filter((x) => !공백인가(x));
    t.높이 = [
      ...(자리 === '위' || 자리 === '위아래' ? [빈슬롯(v)] : []),
      ...칸,
      ...(자리 === '아래' || 자리 === '위아래' ? [빈슬롯(v)] : []),
    ];
  });

  /* 슬롯 값 하나 — 몫이면 그 자리만 · % 면 이웃이 차액을 받는다(합 100).
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

  const 면 = doc?.면 ?? [];
  const 현재 = 면[i];

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

  /* ── 면 ── */
  const 번호매기기 = (d) => d.면.forEach((p, k) => { p.번호 = String(k + 1).padStart(2, '0'); });
  const 면넣기 = () => 바꾸기((d) => { d.면.splice(i + 1, 0, 새면('00')); 번호매기기(d); }, { 그리기: true });
  const 면복제 = () => 바꾸기((d) => { d.면.splice(i + 1, 0, structuredClone(d.면[i])); 번호매기기(d); }, { 그리기: true });
  const 면빼기 = () => 바꾸기((d) => {
    if (d.면.length <= 1) { set로그('마지막 면은 지우지 않는다'); return false; }
    d.면.splice(i, 1); 번호매기기(d);
    setI(Math.max(0, i - 1));
  }, { 그리기: true });
  const 면옮기기 = (dir) => 바꾸기((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.면.length) return false;
    [d.면[i], d.면[j]] = [d.면[j], d.면[i]];
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

  /* 판본이 그려지면 ① 제자리 편집을 붙이고 ② 넘침을 잰다 */
  function 재기() {
    const el = 틀.current;
    if (!el) return;

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
          // 자리 — 한 번 누르면 고른다. 지날 때 옅은 테, 고르면 진한 테
          '[data-자리]{cursor:default}' +
          '[data-자리]:hover{outline:2px solid rgba(230,129,0,.35);outline-offset:2px}' +
          '[data-자리].pick{outline:3px solid #E68100;outline-offset:3px}' +
          '[data-자리].pick [data-p]:hover{background:rgba(230,129,0,.10)}';
        d.head.appendChild(st);
        d.execCommand?.('defaultParagraphSeparator', false, 'br');

        /* 한 번 누르면 자리를 고르고 · 두 번 누르면 글자로 들어간다.
           키노트 · 피그마와 같다. 한 번에 글자가 열리면 표 칸이 자리를 덮어
           자리를 고를 방법이 없어진다 */
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
          바꾸기((dd) => { 쓰기(dd.면[면ref.current], JSON.parse(t.dataset.p), 뒤); },
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

        d.addEventListener('paste', (e) => {
          if (!e.target.closest?.('[data-p]')?.isContentEditable) return;
          e.preventDefault();
          d.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        });

        d.addEventListener('click', (e) => {
          if (e.target.isContentEditable) return;
          const 자리 = e.target.closest?.('[data-자리]');
          if (자리) set자리번호(Number(자리.getAttribute('data-자리')));
          else if (!e.target.closest?.('[data-p]')) set자리번호(null);
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
        /* 자리(.bx)마다 넘쳤는지 잰다. 옛 12칸 시절 `.b · .col · .foot .pt` 를
           보고 있어서 골격 체계에서는 아무것도 안 재고 있었다 */
        const 넘침 = [];
        let 여유 = null;
        sh.querySelectorAll('.bx').forEach((el2, n) => {
          const 넘 = el2.scrollHeight - el2.clientHeight;
          if (넘 > 1) { 넘침.push({ 이름: `자리 ${n + 1}`, 값: Math.round(넘) }); return; }
          const 남 = Math.round(el2.clientHeight - el2.scrollHeight);
          if (여유 == null || 남 < 여유) 여유 = 남;
        });
        set검사({ 넘침, 여유: 여유 ?? 0 });
      } catch { /* 못 잰다 */ }
    }, 700);
  }

  /* ── 단계띠 · N-배경 c ── */
  const 띠바꾸기 = (fn) => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (!z?.단계띠) return false;
    return fn(z.단계띠, z);
  }, { 그리기: true });

  const 띠만들기 = () => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (!z || z.단계띠) return false;
    if (z.비움) { set로그('비운 자리에는 못 놓는다'); return false; }
    z.단계띠 = 새띠();
  }, { 그리기: true });
  const 띠없애기 = () => 띠바꾸기((t, z) => { delete z.단계띠; });

  const 띠칸넣기 = () => 띠바꾸기((t) => {
    if (t.칸.length >= 6) { set로그('칸은 여섯까지다'); return false; }
    t.칸.push([`${t.칸.length + 1}단계`, '내용']);
  });
  const 띠칸빼기 = () => 띠바꾸기((t) => {
    if (t.칸.length <= 1) { set로그('마지막 칸은 지우지 않는다 · 단계띠를 지운다'); return false; }
    t.칸.pop();
    if (t.현재 != null && t.현재 >= t.칸.length) t.현재 = t.칸.length - 1;
  });
  const 띠현재 = (j) => 띠바꾸기((t) => {
    if ((t.현재 ?? null) === j) return false;
    if (j == null) delete t.현재; else t.현재 = j;
  });
  // 빈 값을 주면 열쇠를 지운다 · 도형바꾸기와 같은 규칙
  const 띠값 = (열쇠, 값) => 띠바꾸기((t) => {
    if (값 === '' || 값 == null) delete t[열쇠]; else t[열쇠] = 값;
  });

  /* ── 그림 · N-그림 ──
     문안에는 **객체 꼴로만 쓴다.** 짧은 꼴(경로 문자열)은 렌더러가 읽어 주지만
     도구가 높이 · 맞춤을 얹는 순간 객체가 되어야 하므로 여기서는 한 꼴로 통일한다.
     읽기는 두 꼴 다 받는다 — 손으로 짧게 적은 문안을 열어도 탭이 뜬다. */
  const 그림읽기 = (z) => (typeof z?.그림 === 'string' ? { 경로: z.그림 } : z?.그림 ?? null);
  const 그림바꾸기 = (fn) => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (z?.그림 == null) return false;
    if (typeof z.그림 === 'string') z.그림 = { 경로: z.그림 };   // 짧은 꼴을 펴 놓는다
    return fn(z.그림, z);
  }, { 그리기: true });

  const 그림놓기 = (경로) => 바꾸기((d) => {
    const z = d.면[i]?.자리?.[자리번호];
    if (!z) return false;
    if (z.비움) { set로그('비운 자리에는 그림을 못 놓는다 · 비움을 먼저 푼다'); return false; }
    if (typeof z.그림 === 'string') z.그림 = { 경로: z.그림 };
    if (z.그림) { if (z.그림.경로 === 경로) return false; z.그림.경로 = 경로; return; }
    /* 새로 놓을 때 높이를 정해 준다 — 기본값 「채움」은 앞에 문단 · 목록 · 표가 있으면
       렌더러가 던진다. 그 자리에서 오류판으로 떨어지지 않게 미리 블록 수로 앉힌다.
       비어 있는 자리면 채움 그대로 둔다 · 그게 가장 흔한 쓰임이다 */
    const 앞것 = ['문단', '목록', '번호목록', '표', '단계띠', '수치'].some((k) => z[k] != null);
    z.그림 = 앞것 ? { 경로, 높이: 6 } : { 경로 };
  }, { 그리기: true });
  const 그림없애기 = () => 그림바꾸기((g, z) => { delete z.그림; });

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
  const 면그리기 = useCallback((d, n) => {
    if (!d?.면?.[n]) return '';
    let html;
    try {
      html = render({ ...d, 면: [d.면[n]] }, { cssBase: '/api/css', 도구: true });
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
  const 판본 = useMemo(() => 면그리기(문서ref.current, i), [판본키, i, slug]);

  /* 면 미리보기 — 면마다 iframe 하나. render 가 결정적이라 안 바뀐 면은
     같은 문자열이 나오고 · React 가 srcdoc 을 안 건드려 그 iframe 은 다시 안 뜬다 */
  const 썸네일 = useMemo(() => (doc?.면 ?? []).map((_, n) => 면그리기(doc, n)), [doc, 면그리기]);
  const 썸폭 = 168;

  const 고른 = 자리번호 == null ? null : 현재?.자리?.[자리번호];

  return (
    <div className="shell">
      <header className="top">
        <span className="brand">nine_press</span>
        <select className="pick" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {docs.map((d) => (
            <option key={d.slug} value={d.slug}>{d.사업} / {d.이름}</option>
          ))}
        </select>
        <span className="undo">
          <button disabled={!되돌림} onClick={되돌리기} title="⌘Z">↺</button>
          <button disabled={!앞스택.current.length} onClick={다시하기} title="⌘⇧Z">↻</button>
        </span>
        <span className="bsp" />
        <button className={'chip' + (자 ? ' on' : '')} onClick={() => set자((v) => !v)}
                title="기준선 42 · ⌘\">기준선</button>
        <button className={'chip' + (외곽선 ? ' on' : '')} onClick={() => set외곽선((v) => !v)}
                title="자리 외곽선">외곽선</button>
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
        <div className="pgs">
          {면.map((pg, n) => (
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
          <button className="chip" onClick={() => 면옮기기(-1)} disabled={i === 0}>↑</button>
          <button className="chip" onClick={() => 면옮기기(1)} disabled={i >= 면.length - 1}>↓</button>
          <button className="chip" onClick={면넣기}>+</button>
          <button className="chip" onClick={면복제}>복제</button>
          <button className="chip warn" onClick={면빼기}>−</button>
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
          </div>
        ) : (
          <p className="empty">면이 없다</p>
        )}
      </main>

      <aside className="dock">
        <div className="dkhd">
          {!고른 ? <span className="dim">자리를 고른다</span> : (
            <>
              <i>{현재?.골격 ?? '구성'}</i>
              자리 <b>{자리번호 + 1}</b> / {현재?.자리?.length}
              <span className="bfill" />
              <button className={'chip' + (고른.비움 ? ' on' : '')}
                      onClick={() => 자리비움(!고른.비움)}>비움</button>
            </>
          )}
        </div>
        {고른?.비움 && (
          <div className="dkln">
            <input
              className="barin" style={{ width: '100%' }}
              placeholder="무엇으로 채울지"
              key={`빔-${slug}-${i}-${자리번호}`}
              defaultValue={typeof 고른.비움 === 'string' ? 고른.비움 : ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if ((typeof 고른.비움 === 'string' ? 고른.비움 : '') !== v) 자리비움(v || true);
              }}
            />
          </div>
        )}

        <div className="tabs">
          {['도형', '표', '단계띠', '그림'].map((v) => (
            <button key={v} className={'tab' + (탭 === v ? ' on' : '')}
                    onClick={() => set탭(v)}>{v}</button>
          ))}
        </div>

        <div className="dkbd">
          {탭 === '도형' && (() => {
            const z = 고른;
            const s = z?.도형 ?? {};
            const 켬 = !!z && !z.비움;
            if (!켬) return <p className="dim">{z?.비움 ? '비운 자리' : '자리를 고른다'}</p>;
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

          {탭 === '표' && (() => {
            const z = 고른;
            const t = z?.표 ?? null;
            const 켬 = !!z && !z.비움;
            const n = 표열수(t);
            const 줄무늬 = !!t?.칠?.행?.some(Boolean);
            const 머리칠 = t?.칠?.머리 ?? '';
            const 폭갈래 = !t?.폭 ? '균등' : 백분율폭(t.폭) ? '%' : '몫';
            const 비율 = 폭갈래 === '%' ? 유효비율(t.폭) : null;
            const 높이갈 = t ? 높이갈래(t.높이) : '줄';
            const 빈자리 = t ? 공백자리(t.높이) : '없음';
            const 높이비율 = 높이갈 === '%' ? 유효비율(t.높이.map((v) => String(슬롯값(v)))) : null;
            const 슬롯보기 = 높이갈 === '몫' || 높이갈 === '%'
              ? t.높이.map((v, k) => (공백인가(v) ? `빈 ${높이갈 === '%' ? 높이비율[k] + '%' : 슬롯값(v)}`
                  : String(높이갈 === '%' ? 높이비율[k] + '%' : 슬롯값(v))))
              : [];
            if (!켬) return <p className="dim">{z?.비움 ? '비운 자리' : '자리를 고른다'}</p>;
            if (!t) return <button className="chip" onClick={표만들기}>+ 표</button>;
            return (
              <>
              <줄 이름="열" 곁={`${n}열`}>
                <span className="seg">
                  <button className="chip" onClick={표열빼기} title="끝 열을 뺀다">−</button>
                  <button className="chip" onClick={표열넣기} title="끝에 열을 넣는다">+</button>
                </span>
              </줄>
              <줄 이름="행" 곁={`${t.행.length}행${t.머리 ? ' + 머리' : ''}`}>
                <span className="seg">
                  <button className="chip" onClick={표행빼기} title="끝 행을 뺀다">−</button>
                  <button className="chip" onClick={표행넣기} title="끝에 행을 넣는다">+</button>
                </span>
                <button className={'chip' + (t.머리 ? ' on' : '')}
                        onClick={() => 표머리(!t.머리)}
                        title="머리행">
                  머리행
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
                    : 폭갈래 === '몫' ? t.폭.join(' : ') : `${비율.join(' + ')} = 100`}>
                <span className="seg">
                  {표폭갈래들.map(([v, 이름]) => (
                    <button key={v} className={'chip' + (폭갈래 === v ? ' on' : '')}
                            onClick={() => 표폭갈래(v)}>
                      {이름}
                    </button>
                  ))}
                </span>
                {폭갈래 !== '균등' && <span className="brk" />}
                {폭갈래 === '몫' && Array.from({ length: n }, (_, c) => (
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
                {(높이갈 === '몫' || 높이갈 === '%') && <span className="brk" />}
                {(높이갈 === '몫' || 높이갈 === '%') && t.높이.map((v, k) => (
                  <수칸 key={k}
                        열쇠={높이갈 === '%' ? (공백인가(v) ? '빈비율' : '비율')
                          : (공백인가(v) ? '빈몫' : '몫')}
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

              <줄 이름="머리 칠"
                  곁={도형배경들.find(([v]) => v === 머리칠)?.[1]
                    ?? (HEX6.test(머리칠) ? 머리칠 : null)}>
                {도형배경들.map(([v, 이름, 색]) => (
                  <색칸 key={v || 'n'} 색={색} 이름={이름}
                        지금={머리칠 === v}
                        누르기={() => 표칠머리(v)} />
                ))}
                {최근색.length > 0 && <span className="swsp" />}
                {최근색.map((색) => (
                  <색칸 key={색} 색={색} 이름={`최근 ${색}`}
                        지금={머리칠 === 색}
                        누르기={() => 표칠머리(색)} />
                ))}
                <span className="brk" />
                <색입력 값={머리칠} 이름="머리 칠" 로그={set로그}
                          놓기={(v) => { 표칠머리(v); 색기억(v); }} />
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

          {탭 === '단계띠' && (() => {
            const z = 고른;
            const t = z?.단계띠 ?? null;
            const 켬 = !!z && !z.비움;
            if (!켬) return <p className="dim">{z?.비움 ? '비운 자리' : '자리를 고른다'}</p>;
            if (!t) return <button className="chip" onClick={띠만들기}>+ 단계띠</button>;
            const 색줄 = (열쇠) => (
              <>
                {도형배경들.map(([v, 이름, 색]) => (
                  <색칸 key={v || 'n'} 색={색} 이름={이름}
                        지금={(t[열쇠] ?? '') === v}
                        누르기={() => 띠값(열쇠, v)} />
                ))}
                {최근색.length > 0 && <span className="swsp" />}
                {최근색.map((색) => (
                  <색칸 key={색} 색={색} 이름={`최근 ${색}`}
                        지금={t[열쇠] === 색}
                        누르기={() => 띠값(열쇠, 색)} />
                ))}
                <span className="brk" />
                <색입력 값={t[열쇠]} 이름={열쇠} 로그={set로그}
                          놓기={(v) => { 띠값(열쇠, v); 색기억(v); }} />
              </>
            );
            const 이름표 = (열쇠) => 도형배경들.find(([v]) => v === (t[열쇠] ?? ''))?.[1]
              ?? (HEX6.test(t[열쇠] ?? '') ? t[열쇠] : null);
            return (
              <>
                <줄 이름="칸" 곁={`${t.칸.length}칸`}>
                  <span className="seg">
                    <button className="chip" onClick={띠칸빼기}>−</button>
                    <button className="chip" onClick={띠칸넣기}>+</button>
                  </span>
                </줄>
                <줄 이름="현재">
                  <span className="seg">
                    <button className={'chip' + (t.현재 == null ? ' on' : '')}
                            onClick={() => 띠현재(null)}>없음</button>
                    {t.칸.map((_, j) => (
                      <button key={j} className={'chip' + (t.현재 === j ? ' on' : '')}
                              onClick={() => 띠현재(j)}>{j + 1}</button>
                    ))}
                  </span>
                </줄>

                <div className="popln" />

                <줄 이름="칠" 곁={이름표('칠')}>{색줄('칠')}</줄>
                <줄 이름="현재칠" 곁={이름표('현재칠')}>{색줄('현재칠')}</줄>
                <줄 이름="모서리">
                  <수칸 열쇠="모서리" 값={t.모서리} 기본={10}
                        로그={set로그} 놓기={(n) => 띠값('모서리', n)} />
                </줄>

                <div className="popln" />

                <줄 이름="글자">
                  <button className={'chip' + (t.글자 === '반전' ? ' on' : '')}
                          onClick={() => 띠값('글자', t.글자 === '반전' ? '' : '반전')}>반전</button>
                  <button className={'chip' + (t.현재글자 === '반전' ? ' on' : '')}
                          onClick={() => 띠값('현재글자', t.현재글자 === '반전' ? '' : '반전')}>현재만</button>
                </줄>
                <줄 이름="단계띠">
                  <button className="chip warn" onClick={띠없애기}>− 단계띠</button>
                </줄>
              </>
            );
          })()}

          {탭 === '그림' && (() => {
            const z = 고른;
            const g = 그림읽기(z);
            const 켬 = !!z && !z.비움;
            if (!켬) return <p className="dim">{z?.비움 ? '비운 자리' : '자리를 고른다'}</p>;
            /* 그림이 없으면 목록만 낸다 — 고르는 것이 곧 놓는 것이다.
               「+ 그림」 버튼을 따로 두면 경로 없는 그림이 한 박자 생겨 렌더러가 던진다 */
            if (!g) {
              if (!그림목록.length) return (
                <p className="dim">assets/ 아래에 그림이 없다 · 파일을 넣고 새로고침한다</p>
              );
              return (
                <줄 이름="그림" 곁={`${그림목록.length}개`}>
                  <span className="imgs">
                    {그림목록.map((it) => (
                      <button key={it.경로} className="imgc" title={it.경로}
                              onClick={() => 그림놓기(it.경로)}>
                        <img src={`/api/img/${it.경로.slice('assets/'.length)}`} alt="" />
                        <em>{it.이름}</em>
                      </button>
                    ))}
                  </span>
                </줄>
              );
            }
            const 갈래 = 그림높이갈래(g.높이);
            return (
              <>
                <줄 이름="그림" 곁={g.경로}>
                  <span className="imgs">
                    {그림목록.map((it) => (
                      <button key={it.경로}
                              className={'imgc' + (g.경로 === it.경로 ? ' on' : '')}
                              title={it.경로}
                              onClick={() => 그림놓기(it.경로)}>
                        <img src={`/api/img/${it.경로.slice('assets/'.length)}`} alt="" />
                        <em>{it.이름}</em>
                      </button>
                    ))}
                  </span>
                </줄>

                <div className="popln" />

                <줄 이름="높이"
                    곁={갈래 === '채움' ? '남은 높이를 다 먹는다'
                      : 갈래 === '블록' ? `42 × ${g.높이} = ${g.높이 * 42}px` : null}>
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
                <줄 이름="그림">
                  <button className="chip warn" onClick={그림없애기}>− 그림</button>
                </줄>
              </>
            );
          })()}
        </div>
      </aside>
    </div>
  );
}
