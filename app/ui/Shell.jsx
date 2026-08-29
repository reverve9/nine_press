'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 빌드, PDF, 문안저장, 문안불러오기 } from '../actions.js';
import { render } from '../../render/index.js';

// 판면 픽셀 — render/index.js 의 판 · rules/page.css 의 --판W/--판H 와 같은 값이어야 한다.
// 2340 으로 1px 넓게 잡혀 있어 미리보기 오른쪽에 투명 띠 1px 이 남았다.
const W = 2339;
const H = 1654;

/* ── 경로 유틸 ──
   NBSP 를 공백으로 친다 — contenteditable 이 다 지우고 남기는 것이 이것이다. */
const 읽기 = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
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
  const 옛체계 = /구성에 띠가 없다|골격 "undefined"/.test(e.message);
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

const 줄여 = (s, n = 30) => {
  const t = String(s ?? '').replace(/\*\*/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : (t || '(빈 줄)');
};

const 새면 = (번호) => ({
  번호, 제목: '새 면', 메타: '',
  행: [{ 열: [{ 폭: 4, 블록: [{ 라벨: '새 블록', 내용: [{ 목록: ['내용'] }] }] }] }],
  실무확인: ['실무 확인'],
});
const 새블록 = () => ({ 라벨: '새 블록', 내용: [{ 목록: ['내용'] }] });
const 새덩이 = (유형) =>
  유형 === '문단' ? { 문단: '문단' }
  : 유형 === '표' ? { 표: { 밀도: 'cp', 열: [{ 폭: '50%' }, { 폭: '50%' }], 머리: ['머리', '머리'], 행: [['칸', '칸']] } }
  : { 목록: ['내용'] };

const 배경들 = [['', '없음'], ['or', '주황'], ['fill', '회색'], ['nv', '남색']];

/* ── 도형 칩 — N-배경 a1 ──────────────────────────────────
   값은 render/index.js 의 도형() 이 받는 것과 같아야 한다.
   이름 셋(블록배경 · 선 · 강조) 밖의 색은 hex 로 준다. 여기 hex 는 전부
   키노트 세팅 §5 색표에 있는 값이다 — 없는 색을 새로 만들지 않는다(N2 §2⑤).
   그 밖의 색이 필요하면 「배경 hex」 칸에 #RRGGBB 로 직접 적는다. */
/* 배경 견본은 둘뿐이다. **키노트 세팅 §5 가 배경색으로 지정한 것은 「블록 배경」 하나다** —
   네이비 · 강조는 §5 에서 글자색이지 배경색이 아니다. 박아 두면 배경으로 쓰라는 뜻이 된다.
   그 밖의 색은 hex 로 한 번 적으면 「최근」 에 남아 그 다음부터는 눌러 쓴다. */
const 도형배경들 = [
  ['', '없음', null],
  ['블록배경', '블록배경 F4F6F8', '#F4F6F8'],
];
const 도형테두리들 = [['', '없음', null], ['선', '선 E4E8EC', '#E4E8EC'], ['강조', '강조 2D4D6E', '#2D4D6E']];
const 도형모서리들 = [[0, '0'], [10, '10'], [24, '24']];
const 도형그림자들 = [['', '없음'], ['약', '약'], ['중', '중']];
const 도형투명도들 = [[100, '100'], [60, '60'], [40, '40']];
const 도형굵기들 = [[1, '1'], [2, '2'], [3, '3']];
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/* 칩에 없는 값은 직접 적는다. 범위는 렌더러의 도형() 과 같아야 한다 —
   여기서 막는 것은 편의고 · 진짜 계약은 렌더러가 지킨다.
   자주 쓰는 값만 칩으로 두고 나머지는 이 칸으로 받는다. */
const 수범위 = { 모서리: [0, 40], 투명도: [0, 100], 굵기: [1, 6] };

function 수칸({ 열쇠, 값, 기본, 놓기, 로그, 열림 = true }) {
  const [아래, 위] = 수범위[열쇠];
  const 지금 = 값 ?? 기본;
  return (
    <input
      className="barin numin" type="text" inputMode="numeric"
      key={`${열쇠}-${지금}`} defaultValue={지금} disabled={!열림}
      title={`${아래} ~ ${위} 사이 정수를 적고 Enter`}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onBlur={(e) => {
        const t = e.target.value.trim();
        const n = Number(t);
        if (t === '' || !Number.isInteger(n) || n < 아래 || n > 위) {
          e.target.value = 지금;
          return 로그(`${열쇠} "${t}" · ${아래} ~ ${위} 사이 정수로 적는다`);
        }
        if (n !== 지금) 놓기(n);
      }}
    />
  );
}

/* ── 떠 있는 속성 패널 ─────────────────────────────────────
   포토샵 · 인디자인 · 일러스트레이터의 팔레트 짜임 그대로다.

     · 판 위에 떠 있고 · 머리를 잡아 끌어 옮긴다
     · 머리를 두 번 누르면 접힌다 · 머리만 남는다
     · 겹치면 누른 것이 앞으로 온다
     · × 로 닫고 · 툴바 「패널」 에서 다시 켠다 · 자리는 기억한다

   속성을 툴바에 늘어놓지 않는 이유가 이것이다 — 개념마다 팔레트 하나를 두면
   글자 · 표 패널이 붙어도 툴바가 안 늘어나고 판도 안 줄어든다.
   여기 목록에 한 줄 더하면 패널이 하나 늘어난다.
   앞으로 · 글자(계층 · 강조 · 표기) · 표(열 · 머리행 · 행 높이) · 면(골격 · 모드). */

const 패널들 = [['도형', '도형']];
const 패널폭 = 280;

function 팔레트({ 이름, 열쇠, 자리, set자리, 접힘, set접힘, 차례, z, 앞으로, 끄기, children }) {
  const 몸 = useRef(null);
  const 접 = !!접힘[열쇠];
  const 접기 = () => set접힘((f) => ({ ...f, [열쇠]: !접 }));

  /* 머리를 잡아 끈다. 무대(.stage) 안을 벗어나지 않는다 —
     머리가 밖으로 나가면 다시 잡을 방법이 없어진다. */
  const 잡기 = (e) => {
    if (e.button !== 0) return;
    const el = 몸.current;
    const 무대 = el?.offsetParent;
    if (!무대) return;
    const r = el.getBoundingClientRect();
    const s = 무대.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    앞으로();
    const 움직 = (ev) => {
      const x = Math.min(Math.max(ev.clientX - dx - s.left, 0), Math.max(0, s.width - r.width));
      const y = Math.min(Math.max(ev.clientY - dy - s.top, 0), Math.max(0, s.height - 34));
      set자리((p) => ({ ...p, [열쇠]: { x: Math.round(x), y: Math.round(y) } }));
    };
    const 놓기 = () => {
      document.removeEventListener('mousemove', 움직);
      document.removeEventListener('mouseup', 놓기);
      document.body.classList.remove('끄는중');
    };
    document.addEventListener('mousemove', 움직);
    document.addEventListener('mouseup', 놓기);
    document.body.classList.add('끄는중');
    e.preventDefault();
  };

  const p = 자리[열쇠];
  // 처음에는 오른쪽 위에 계단으로 놓는다. 한 번 끌면 그 자리를 기억한다
  const 놓임 = p ? { left: p.x, top: p.y } : { right: 16, top: 16 + 차례 * 34 };

  return (
    <section className={'fp' + (접 ? ' fold' : '')} ref={몸}
             style={{ ...놓임, width: 패널폭, zIndex: 20 + z }}
             onMouseDown={앞으로}>
      <header className="fphd" onMouseDown={잡기} onDoubleClick={접기}>
        <button className="fpb" onMouseDown={(e) => e.stopPropagation()} onClick={접기}
                title={접 ? '편다' : '접는다'}>{접 ? '▸' : '▾'}</button>
        <span className="fpnm">{이름}</span>
        <button className="fpb fpx" onMouseDown={(e) => e.stopPropagation()} onClick={끄기}
                title="닫는다 · 툴바에서 다시 켠다">×</button>
      </header>
      {!접 && <div className="fpbd">{children}</div>}
    </section>
  );
}

/* 패널 한 칸 — 이름표를 값 **위**에 둔다.
   왼쪽에 이름표를 세우면 이름 길이만큼 값이 밀려 칸마다 시작점이 어긋난다.
   위로 올리면 값이 전부 같은 x 에서 시작해 세로로 줄이 선다. */
function 줄({ 이름, 곁, children }) {
  return (
    <div className="fld">
      <span className="fldnm">{이름}{곁 ? <em>{곁}</em> : null}</span>
      <span className="fldv">{children}</span>
    </div>
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

/* ── 구조 폼 항목 뽑기 ── */
function 구조칸들(면, 표적) {
  const out = [];
  if (표적 === 'head') {
    out.push({ 종류: '갈피', 이름: '실무 확인' });
    (면.실무확인 ?? []).forEach((s, k) =>
      out.push({ 종류: '줄', 이름: `${k + 1}`, 미리: 줄여(s), 배열: ['실무확인'], 자리: k }));
    out.push({ 종류: '추가', 이름: '줄 추가', 배열: ['실무확인'], 새값: '' });
    return out;
  }

  const { ri, ci, bi } = 표적;
  const b = 면.행?.[ri]?.열?.[ci]?.블록?.[bi];
  if (!b) return out;
  const base = ['행', ri, '열', ci, '블록', bi];

  (b.내용 ?? []).forEach((it, ii) => {
    const ib = [...base, '내용', ii];
    const 덩이 = { 배열: [...base, '내용'], 자리: ii };

    for (const key of ['목록', '번호목록']) {
      if (!it[key]) continue;
      out.push({ 종류: '갈피', 이름: key, 덩이 });
      it[key].forEach((s, k) =>
        out.push({ 종류: '줄', 이름: `${k + 1}`, 미리: 줄여(s), 배열: [...ib, key], 자리: k }));
      out.push({ 종류: '추가', 이름: '줄 추가', 배열: [...ib, key], 새값: '' });
    }

    if (it.문단 != null) {
      out.push({ 종류: '갈피', 이름: '문단', 덩이 });
      out.push({ 종류: '알림', 이름: 줄여(it.문단, 38) });
    }

    if (it.표) {
      const t = it.표;
      const tb = [...ib, '표'];
      const 칸수 = t.머리?.length
        ?? (Array.isArray(t.행?.[0]) ? t.행[0].length : t.행?.[0]?.칸?.length) ?? 2;
      out.push({ 종류: '갈피', 이름: `표 · ${칸수}열`, 덩이 });
      (t.행 ?? []).forEach((r, k) => {
        const 칸 = Array.isArray(r) ? r : r.칸;
        out.push({ 종류: '줄', 이름: `${k + 1}행`, 미리: 줄여(칸.join(' · ')), 배열: [...tb, '행'], 자리: k });
      });
      out.push({ 종류: '추가', 이름: '행 추가', 배열: [...tb, '행'],
                 새값: Array.from({ length: 칸수 }, () => '') });
      (t.묶음 ?? []).forEach((g, gi) => {
        out.push({ 종류: '갈피', 이름: `묶음 · ${줄여(g.이름, 12)}` });
        (g.항목 ?? []).forEach((r, k) =>
          out.push({ 종류: '줄', 이름: `${k + 1}`,
                     미리: 줄여(Array.isArray(r) ? r.join(' · ') : r),
                     배열: [...tb, '묶음', gi, '항목'], 자리: k }));
        out.push({ 종류: '추가', 이름: '줄 추가', 배열: [...tb, '묶음', gi, '항목'],
                   새값: Array.isArray(g.항목?.[0]) ? g.항목[0].map(() => '') : '' });
      });
    }
  });
  return out;
}

export default function Shell({ docs, first }) {
  const [slug, setSlug] = useState(first?.slug ?? '');
  const [doc, setDoc] = useState(first?.doc ?? null);
  const [mtime, setMtime] = useState(0);
  const [i, setI] = useState(0);
  const [표적, set표적] = useState(null);
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
  // 고른 자리 번호 · 골격 체계의 자리다(옛 12칸 트랙의 표적과 별개)
  const [자리번호, set자리번호] = useState(null);
  // 떠 있는 속성 패널 — 켠 것 · 접은 것 · 끌어다 놓은 자리 · 앞뒤 차례
  const [패널, set패널] = useState({ 도형: true });
  const [접힘, set접힘] = useState({});
  const [패널자리, set패널자리] = useState({});
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
  const [앞뒤, set앞뒤] = useState(패널들.map(([k]) => k));
  const 앞으로 = useCallback((열쇠) => {
    set앞뒤((a) => (a[a.length - 1] === 열쇠 ? a : [...a.filter((k) => k !== 열쇠), 열쇠]));
  }, []);

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
    setDoc(r.doc); setMtime(r.mtime); setI(0); set표적(null);
    set자(!!r.doc.기준선);           // 문안이 "기준선": true 면 켠 채로 연다
    set외곽선(r.doc.판면 === 'dbg'); // 문안이 "판면": "dbg" 면 켠 채로 연다
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
      // 도형도 함께 못 산다 — 비움은 「출력에 아무것도 안 나간다」가 계약이다
      const 있는것 = ['제목', '요약', '문단', '목록', '번호목록', '단계띠', '수치', '출처', '도형']
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

  /* ── 줄·행 ── */
  const 줄넣기 = (배열, 새값) => 바꾸기((d) => {
    let a = 읽기(d.면[면ref.current], 배열);
    if (!Array.isArray(a)) { 쓰기(d.면[면ref.current], 배열, []); a = 읽기(d.면[면ref.current], 배열); }
    a.push(structuredClone(새값));
  }, { 그리기: true });

  const 줄빼기 = (배열, 자리) => 바꾸기((d) => {
    const a = 읽기(d.면[면ref.current], 배열);
    if (a.length <= 1) { set로그('마지막 줄은 지우지 않는다'); return false; }
    a.splice(자리, 1);
  }, { 그리기: true });

  /* ── 면 ── */
  const 번호매기기 = (d) => d.면.forEach((p, k) => { p.번호 = String(k + 1).padStart(2, '0'); });
  const 면넣기 = () => 바꾸기((d) => { d.면.splice(i + 1, 0, 새면('00')); 번호매기기(d); }, { 그리기: true });
  const 면복제 = () => 바꾸기((d) => { d.면.splice(i + 1, 0, structuredClone(d.면[i])); 번호매기기(d); }, { 그리기: true });
  const 면빼기 = () => 바꾸기((d) => {
    if (d.면.length <= 1) { set로그('마지막 면은 지우지 않는다'); return false; }
    d.면.splice(i, 1); 번호매기기(d);
    setI(Math.max(0, i - 1)); set표적(null);
  }, { 그리기: true });
  const 면옮기기 = (dir) => 바꾸기((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.면.length) return false;
    [d.면[i], d.면[j]] = [d.면[j], d.면[i]];
    번호매기기(d); setI(j); set표적(null);
  }, { 그리기: true });

  /* ── 행 · 열 · 블록 · 덩이 ── */
  const P = 표적 && 표적 !== 'head' ? 표적 : null;
  const 폭합 = (행) => (행?.열 ?? []).reduce((a, c) => a + (c.폭 ?? 4), 0);

  const 행넣기 = () => 바꾸기((d) => {
    d.면[i].행.splice((P?.ri ?? d.면[i].행.length - 1) + 1, 0,
      { 열: [{ 폭: 12, 블록: [새블록()] }] });
  }, { 그리기: true });
  const 행빼기 = () => 바꾸기((d) => {
    if (!P || d.면[i].행.length <= 1) { set로그('마지막 행은 지우지 않는다'); return false; }
    d.면[i].행.splice(P.ri, 1); set표적(null);
  }, { 그리기: true });

  // 합 12 는 언제나 지킨다. 열을 넣고 빼고 폭을 바꿀 때 이웃이 그만큼 받는다
  const 이웃 = (행, ci) => (ci + 1 < 행.열.length ? ci + 1 : ci - 1);

  const 열넣기 = () => 바꾸기((d) => {
    const 행 = d.면[i].행[P.ri];
    const 칸 = 행.열[P.ci].폭 ?? 4;
    if (칸 < 6) { set로그('열을 넣으려면 지금 열이 6칸 이상이어야 한다'); return false; }
    행.열[P.ci].폭 = 칸 - 3;
    행.열.splice(P.ci + 1, 0, { 폭: 3, 블록: [새블록()] });
  }, { 그리기: true });
  const 열빼기 = () => 바꾸기((d) => {
    const 행 = d.면[i].행[P.ri];
    if (행.열.length <= 1) { set로그('마지막 열은 지우지 않는다'); return false; }
    const j = 이웃(행, P.ci);
    행.열[j].폭 = (행.열[j].폭 ?? 4) + (행.열[P.ci].폭 ?? 4);
    행.열.splice(P.ci, 1); set표적(null);
  }, { 그리기: true });
  const 폭바꾸기 = (w) => 바꾸기((d) => {
    const 행 = d.면[i].행[P.ri];
    const 차 = w - (행.열[P.ci].폭 ?? 4);
    if (!차) return false;
    const j = 이웃(행, P.ci);
    if (j < 0 || (행.열[j].폭 ?? 4) - 차 < 3) { set로그('칸 합은 12 를 지킨다'); return false; }
    행.열[j].폭 = (행.열[j].폭 ?? 4) - 차;
    행.열[P.ci].폭 = w;
  }, { 그리기: true });

  const 블록넣기 = () => 바꾸기((d) => {
    d.면[i].행[P.ri].열[P.ci].블록.splice(P.bi + 1, 0, 새블록());
  }, { 그리기: true });
  const 블록빼기 = () => 바꾸기((d) => {
    const bs = d.면[i].행[P.ri].열[P.ci].블록;
    if (bs.length <= 1) { set로그('열의 마지막 블록은 지우지 않는다 — 열을 지운다'); return false; }
    bs.splice(P.bi, 1); set표적(null);
  }, { 그리기: true });
  const 배경바꾸기 = (v) => 바꾸기((d) => {
    const b = d.면[i].행[P.ri].열[P.ci].블록[P.bi];
    if (v) b.배경 = v; else delete b.배경;
  }, { 그리기: true });

  const 덩이넣기 = (유형) => 바꾸기((d) => {
    d.면[i].행[P.ri].열[P.ci].블록[P.bi].내용.push(새덩이(유형));
  }, { 그리기: true });
  const 덩이빼기 = (배열, 자리) => 바꾸기((d) => {
    const a = 읽기(d.면[면ref.current], 배열);
    if (a.length <= 1) { set로그('마지막 덩이는 지우지 않는다 — 블록을 지운다'); return false; }
    a.splice(자리, 1);
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
          '[data-p]{cursor:text}' +
          '[data-p]:hover{background:rgba(230,129,0,.12)}' +
          '[data-p][contenteditable="true"]{background:#fff;' +
            'outline:calc(2*var(--u)) solid #E68100;outline-offset:calc(1.5*var(--u))}' +
          // TBD 배지와 면 연결 표기는 글자가 아니라 표기다. 통째로 다룬다
          '[data-p] .tbd, [data-p] .ar{user-select:all}' +
          // 열 경계 손잡이 (P2) — 거터 위에 얹는다. 산출 HTML 에는 없다
          '.row{position:relative}' +
          '.rz{position:absolute;top:0;bottom:0;width:calc(14.879*var(--u));' +
            'margin-left:calc(-7.44*var(--u));cursor:col-resize;z-index:50}' +
          '.rz:hover,.rz.on{background:rgba(230,129,0,.22)}' +
          // 고른 자리 — 편집기에서만 보인다
          '[data-자리]{cursor:default}' +
          '[data-자리].pick{outline:3px solid #E68100;outline-offset:3px}';
          // 기준선 자는 여기서 만들지 않는다 — rules/page.css 의 .wrap.bl 이 그린다.
          // 옛 12칸 트랙 격자(.gridov)는 걷어냈다. 걸음 92.73975 도 .row 도 이제 없다.
        d.head.appendChild(st);
        d.execCommand?.('defaultParagraphSeparator', false, 'br');

        d.addEventListener('mousedown', (e) => {
          const t = e.target.closest?.('[data-p]');
          if (!t || t.isContentEditable) return;
          t.dataset.전 = 원문(t);
          t.dataset.전html = t.innerHTML;
          t.contentEditable = 'true';
          // 배지 안에 커서가 들어가지 않게 — 지울 땐 통째로, 넣을 땐 {TBD} 를 타이핑
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
          if (e.target.closest?.('[data-p]')) return;
          // 골격 체계 — 자리를 고른다. 빈 곳을 누르면 고르기를 푼다
          const 자리 = e.target.closest?.('[data-자리]');
          if (자리 || d.querySelector('[data-자리]')) {
            set자리번호(자리 ? Number(자리.getAttribute('data-자리')) : null);
            return;
          }
          const t = e.target.closest?.('[data-b]');
          if (!t) return;
          const v = t.getAttribute('data-b');
          if (v === 'head') return set표적('head');
          const [ri, ci, bi] = v.split('-').map(Number);
          set표적({ ri, ci, bi });
        });

        /* ── 열 경계 끌기 ──
           끄는 동안은 인라인 --w 만 바꿔 미리 보인다. 데이터는 놓을 때 한 번 쓴다.
           그래야 되돌리기 스택에 한 칸만 쌓인다. */
        const cs = d.defaultView.getComputedStyle(d.documentElement);
        const uu = parseFloat(cs.getPropertyValue('--u')) || 1.949;
        // iframe 요소에 걸린 scale 은 내부 문서 좌표계를 바꾸지 않는다.
        // preview/route.js 가 .sheet .page{transform:none} 으로 --view 를 껐으므로
        // 여기서 잡히는 clientX 는 이미 판면 px 이다. 나누지 않는다.
        const 칸너비 = 92.73975 * uu;   // 한 칸 걸음 = 판면 180.75px · 축척 30% 에서 화면 약 54px

        // 도구 모드에서만. 산출 HTML 에는 [data-b] 가 없다
        if (d.querySelector('.page [data-b]')) {
          d.querySelectorAll('.page .row').forEach((row) => {
            const 칸 = [...row.children].filter((x) => !x.classList.contains('rz'));
            if (칸.length < 2) return;
            for (let k = 0; k < 칸.length - 1; k++) {
              const 거터 = 칸[k + 1].offsetLeft - (칸[k].offsetLeft + 칸[k].offsetWidth);
              const h = d.createElement('div');
              h.className = 'rz';
              h.dataset.rz = String(k);
              h.style.left = (칸[k].offsetLeft + 칸[k].offsetWidth + 거터 / 2) + 'px';
              row.appendChild(h);
            }
          });
        }

        // srcdoc 이 갈리면 문서가 새로 만들어져 클래스가 날아간다. 다시 입힌다.
        // 문안에 "기준선": true 가 있으면 render 가 이미 .bl 을 붙여 놓지만
        // 패널이 정본이다 — 켬이든 끔이든 자ref 가 이긴다.
        const w = d.querySelector('.wrap');
        w?.classList.toggle('bl', 자ref.current);
        w?.classList.toggle('dbg', 외곽선ref.current);

        let 끌 = null;
        const 끝내기 = () => {
          끌.h.classList.remove('on');
          d.body.style.userSelect = '';
          끌 = null;
        };

        d.addEventListener('mousedown', (e) => {
          const h = e.target.closest?.('.rz');
          if (!h) return;
          const row = h.closest('.row');
          const 칸 = [...row.children].filter((x) => !x.classList.contains('rz'));
          const ci = Number(h.dataset.rz);
          const 왼 = 칸[ci], 오 = 칸[ci + 1];
          const b = row.querySelector('[data-b]')?.getAttribute('data-b');
          if (!왼 || !오 || !b) return;
          끌 = {
            h, 왼, 오, ci, ri: Number(b.split('-')[0]),
            시작: e.clientX, 이동: 0,
            왼칸: Number(왼.style.getPropertyValue('--w')) || 4,
            오칸: Number(오.style.getPropertyValue('--w')) || 4,
          };
          h.classList.add('on');
          d.body.style.userSelect = 'none';
        });

        d.addEventListener('mousemove', (e) => {
          if (!끌) return;
          let 이동 = Math.round((e.clientX - 끌.시작) / 칸너비);
          // 두 열 모두 하한 3칸. 어기는 값은 조용히 자른다
          이동 = Math.max(3 - 끌.왼칸, Math.min(끌.오칸 - 3, 이동));
          if (이동 === 끌.이동) return;
          끌.이동 = 이동;
          끌.왼.style.setProperty('--w', String(끌.왼칸 + 이동));
          끌.오.style.setProperty('--w', String(끌.오칸 - 이동));
        });

        d.addEventListener('mouseup', () => {
          if (!끌) return;
          const { ri, ci, 이동, 왼칸, 오칸 } = 끌;
          끝내기();
          if (!이동) return;
          바꾸기((dd) => {
            const 행 = dd.면[면ref.current].행[ri];
            행.열[ci].폭 = 왼칸 + 이동;
            행.열[ci + 1].폭 = 오칸 - 이동;
          }, { 그리기: true });
        });

        d.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape' || !끌) return;
          끌.왼.style.setProperty('--w', String(끌.왼칸));
          끌.오.style.setProperty('--w', String(끌.오칸));
          끝내기();
        });
      }
    } catch { /* 다른 출처면 못 붙인다 */ }

    setTimeout(() => {
      try {
        const d = el.contentDocument;
        const sh = d?.querySelector('.sheet');
        if (!sh) return;
        const 넘침 = [];
        sh.querySelectorAll('.b, .col, .foot .pt').forEach((e) => {
          const v = e.scrollHeight - e.clientHeight;
          if (v > 1) 넘침.push({ 이름: e.querySelector('.bl')?.textContent?.trim() || e.className, 값: Math.round(v) });
        });
        const bs = [...sh.querySelectorAll('.bd .b')];
        const 끝 = bs.length ? Math.max(...bs.map((e) => e.getBoundingClientRect().bottom)) : 0;
        const ft = sh.querySelector('.foot');
        const bd = sh.querySelector('.bd');
        const 여유 = Math.round(((ft ?? bd)?.getBoundingClientRect()[ft ? 'top' : 'bottom'] ?? 0) - 끝);
        set검사({ 넘침, 여유 });
      } catch { /* 못 잰다 */ }
    }, 700);
  }

  const 표적이름 = useMemo(() => {
    if (!현재 || !표적) return '';
    if (표적 === 'head') return '면 머리 · 실무 확인';
    const b = 현재.행?.[표적.ri]?.열?.[표적.ci]?.블록?.[표적.bi];
    return b?.라벨 ?? b?.이름 ?? '(이름 없음)';
  }, [현재, 표적]);

  const 구조 = useMemo(() => (현재 && 표적 ? 구조칸들(현재, 표적) : []), [현재, 표적]);
  const 블록 = P ? 현재?.행?.[P.ri]?.열?.[P.ci]?.블록?.[P.bi] : null;
  const 열폭 = P ? (현재?.행?.[P.ri]?.열?.[P.ci]?.폭 ?? 4) : 4;
  const 칸합 = P ? 폭합(현재?.행?.[P.ri]) : 0;

  // 판본키가 오를 때만 다시 만든다.
  // doc 에 직접 묶으면 글자 한 자 고칠 때마다 iframe 이 새로 로드되어
  // 제자리 편집의 커서가 날아간다.
  const 판본 = useMemo(() => {
    const d = 문서ref.current;
    if (!d?.면?.[i]) return '';
    let html;
    try {
      html = render({ ...d, 면: [d.면[i]] }, { cssBase: '/api/css', 도구: true });
    } catch (e) {
      // 렌더러는 계약을 어기면 오류를 던진다(자리 개수 · 모르는 골격 · 옛 열쇠).
      // 그 오류를 그대로 터뜨리면 화면이 통째로 죽어 「빌드 에러」처럼 보인다.
      // 판 자리에 메시지를 그려 무엇이 잘못됐는지 보이게 한다.
      return 오류판(d, i, e);
    }
    return html
      // 그림은 /api/img 로 돌린다 — 정적 중복을 만들지 않는다
      .replaceAll('src="assets/', 'src="/api/img/')
      .replace(
      '</head>',
      `<style>
body{padding:0;margin:0;background:transparent;overflow:hidden}
.wrap{width:${W}px;margin:0}
.sheet{width:${W}px;height:${H}px;margin:0;overflow:hidden}
.sheet .page{transform:none;box-shadow:none}
</style></head>`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [판본키, i, slug]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          nine_press
          <span className="undo">
            <button disabled={!되돌림} onClick={되돌리기} title="되돌리기 ⌘Z">↺</button>
            <button disabled={!앞스택.current.length} onClick={다시하기} title="다시 ⌘⇧Z">↻</button>
          </span>
        </div>

        <select className="pick" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {docs.map((d) => (
            <option key={d.slug} value={d.slug}>{d.사업} / {d.이름}</option>
          ))}
        </select>

        <div className="ctl">
          <div className="ctlrow">
            <button className={'chip' + (자 ? ' on' : '')} onClick={() => set자((v) => !v)}
                    title="기준선 자 42px · ⌘\">
              기준선
            </button>
            <button className={'chip' + (외곽선 ? ' on' : '')} onClick={() => set외곽선((v) => !v)}
                    title="자리 · 밴드 · 안전영역 외곽선">
              블록
            </button>
          </div>
          {/* 배율은 판 위로 옮겼다 · 아래 .zoom */}
        </div>

        {/* 고른 자리의 세부 편집은 사이드패널이 아니라 판 위 툴바에 있다 · 아래 .bar */}

        {표적 ? (
          <>
            <button className="back" onClick={() => set표적(null)}>← 면 목록</button>
            <div className="lbl">{표적이름}</div>

            {P && (
              <div className="ctl">
                <div className="ctlrow">
                  <span className="ck">칸 수 {열폭} / {칸합}</span>
                  {[3, 4, 5, 6, 7, 8, 12].map((w) => (
                    <button key={w} className={'chip' + (열폭 === w ? ' on' : '')}
                            onClick={() => 폭바꾸기(w)}>{w}</button>
                  ))}
                </div>
                <div className="ctlrow">
                  <span className="ck">배경</span>
                  {배경들.map(([v, 이름]) => (
                    <button key={v || 'n'} className={'chip' + ((블록?.배경 ?? '') === v ? ' on' : '')}
                            onClick={() => 배경바꾸기(v)}>{이름}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="list form">
              {구조.map((f, k) => {
                if (f.종류 === '갈피')
                  return (
                    <div key={k} className="grp">
                      {f.이름}
                      {f.덩이 && (
                        <button className="delln" title="이 덩이 삭제"
                                onClick={() => 덩이빼기(f.덩이.배열, f.덩이.자리)}>−</button>
                      )}
                    </div>
                  );
                if (f.종류 === '알림') return <div key={k} className="hint">{f.이름}</div>;
                if (f.종류 === '추가')
                  return (
                    <button key={k} className="addln" onClick={() => 줄넣기(f.배열, f.새값)}>
                      + {f.이름}
                    </button>
                  );
                return (
                  <div key={k} className="ln">
                    <span className="lnno">{f.이름}</span>
                    <span className="lntx">{f.미리}</span>
                    <button className="delln" title="이 줄 삭제" onClick={() => 줄빼기(f.배열, f.자리)}>−</button>
                  </div>
                );
              })}

              {P && (
                <>
                  <div className="grp">덩이 추가</div>
                  <div className="ctlrow">
                    {['목록', '문단', '표'].map((t) => (
                      <button key={t} className="chip" onClick={() => 덩이넣기(t)}>+ {t}</button>
                    ))}
                  </div>
                  <div className="grp">구조</div>
                  <div className="ctlrow wrap">
                    <button className="chip" onClick={블록넣기}>+ 블록</button>
                    <button className="chip" onClick={열넣기}>+ 열</button>
                    <button className="chip" onClick={행넣기}>+ 행</button>
                  </div>
                  <div className="ctlrow wrap">
                    <button className="chip warn" onClick={블록빼기}>− 블록</button>
                    <button className="chip warn" onClick={열빼기}>− 열</button>
                    <button className="chip warn" onClick={행빼기}>− 행</button>
                  </div>
                </>
              )}
            </div>
            <p className="note">
              글자는 <b>판면에서 그 자리에</b> 고친다.<br />
              배지는 <b>{'{TBD}'}</b> · <b>{'{TBD협의}'}</b> 로 타이핑,<br />
              면 연결은 <b>{'{→05}'}</b>, 굵게는 <b>⌘B</b>.
            </p>
          </>
        ) : (
          <>
            <div className="lbl">면 {면.length}</div>
            <nav className="list">
              {면.map((p, n) => (
                <button key={n} className={'row' + (n === i ? ' on' : '')} onClick={() => setI(n)}>
                  <span className="no">{p.번호}</span>
                  <span className="tt">{p.제목}</span>
                </button>
              ))}
            </nav>
            <div className="ctlrow wrap pg">
              <button className="chip" onClick={() => 면옮기기(-1)} disabled={i === 0}>↑</button>
              <button className="chip" onClick={() => 면옮기기(1)} disabled={i >= 면.length - 1}>↓</button>
              <button className="chip" onClick={면넣기}>+ 면</button>
              <button className="chip" onClick={면복제}>복제</button>
              <button className="chip warn" onClick={면빼기}>− 면</button>
            </div>
            <p className="note">
              판면에서 글자를 눌러 고친다. 빈 곳을 누르면 구조를 손본다.<br />
              배지 <b>{'{TBD}'}</b> · 면 연결 <b>{'{→05}'}</b> · 굵게 <b>⌘B</b> · 줄바꿈 <b>Enter</b>
            </p>
          </>
        )}

        <div className="foot">
          <button className="save" disabled={바쁨 || !더러움} onClick={저장}>
            {더러움 ? '저장  ⌘S' : '저장됨'}
          </button>
          {충돌 && (
            <div className="btns" style={{ marginBottom: 10 }}>
              <button className="thin" style={{ margin: 0 }} disabled={바쁨}
                      onClick={() => 불러오기(slug)}>버리고 다시 불러오기</button>
              <button className="thin" style={{ margin: 0 }} disabled={바쁨}
                      onClick={덮어쓰기}>덮어쓰기</button>
            </div>
          )}
          {검사 && (
            <div className={'chk' + (검사.넘침.length ? ' bad' : '')}>
              {검사.넘침.length
                ? 검사.넘침.map((o, k) => <div key={k}>넘침 · {o.이름} · {o.값}px</div>)
                : <div>넘침 없음 · 여유 {검사.여유}px</div>}
            </div>
          )}
          <div className="btns">
            <button disabled={바쁨 || !slug} onClick={() => 실행(() => 빌드(slug))}>빌드</button>
            <button disabled={바쁨 || !slug} onClick={() => 실행(() => PDF(slug))}>PDF</button>
          </div>
          <button className="thin" disabled={바쁨 || !slug} onClick={() => 실행(() => 빌드(slug, true))}>
            빌드 · 폰트 내장
          </button>
          {로그 && <pre className="log">{로그}</pre>}
        </div>
      </aside>

      {/* ── 판 자리 = 툴바 한 줄 + 판 ────────────────────────────────
          갈래를 셋으로 갈랐다. 인디자인 · 일러스트레이터가 쓰는 짜임이다.

            왼쪽 사이드패널   문서 · 보기 · 이동      무엇을 여는가
            가운데 판 + 툴바   고른 것 · 빠른 손질     무엇을 고르고 있는가
            오른쪽 속성 도크   고른 것의 속성 패널     그것을 어떻게 고치는가

          툴바는 **한 줄로 고정**이다. 속성을 여기 늘어놓으면 스무 개가 넘어
          무엇이 무엇에 붙은 값인지 안 보인다. 속성은 전부 도크로 보낸다.
          앞으로 글자 · 표 패널이 붙어도 툴바는 안 늘어난다. */}
      <div className="stage">
        <div className="bar">
          {(() => {
            const z = 자리번호 == null ? null : 현재?.자리?.[자리번호];
            if (!z) return (
              <span className="barh dim">
                판면에서 <b>빈 곳</b>을 누르면 자리를 고른다 · <b>글자</b>를 누르면 그 자리에서 고친다
              </span>
            );
            const 빔 = !!z.비움;
            return (
              <>
                <span className="barh">
                  <i>{현재?.골격 ?? '구성'}</i>
                  자리 <b>{자리번호 + 1}</b> / {현재?.자리?.length}
                </span>
                <span className="barsp" />
                <button className={'chip' + (빔 ? ' on' : '')}
                        onClick={() => 자리비움(!빔)}
                        title="비우면 출력에 아무것도 안 나간다 · 키노트에서 채운다">
                  비움
                </button>
                {빔 && (
                  <input
                    className="barin" style={{ flex: '1 1 240px', maxWidth: 420 }}
                    placeholder="무엇으로 채울지 적는다 · 예 : 지도 · 키노트에서"
                    defaultValue={typeof z.비움 === 'string' ? z.비움 : ''}
                    key={`빔-${판본키}-${자리번호}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if ((typeof z.비움 === 'string' ? z.비움 : '') !== v) 자리비움(v || true);
                    }}
                  />
                )}
              </>
            );
          })()}

          {/* 패널 켜고 끄기 — 포토샵 「창」 메뉴 자리다. 켠 것만 판 위에 뜬다 */}
          <span className="barfill" />
          <span className="ck">패널</span>
          <span className="seg">
            {패널들.map(([열쇠, 이름]) => (
              <button key={열쇠} className={'chip' + (패널[열쇠] ? ' on' : '')}
                      onClick={() => set패널((p) => ({ ...p, [열쇠]: !p[열쇠] }))}
                      title={`${이름} 패널을 켜고 끈다`}>
                {이름}
              </button>
            ))}
          </span>
        </div>
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
            <p className="empty">면이 없습니다.</p>
          )}
          {/* 배율 — 판 위에 얹는다. 사이드패널이 아니라 보는 자리 옆에 둔다.
              못박으면 키노트와 같은 %로 견줄 수 있다. 판은 2339 × 1654 로 같다 */}
          <div className="zoom">
            <button className={'chip' + (배율 == null ? ' on' : '')} onClick={() => set배율(null)}
                    title="창에 맞춘다">맞춤</button>
            {[0.25, 0.5, 1].map((v) => (
              <button key={v} className={'chip' + (배율 === v ? ' on' : '')}
                      onClick={() => set배율(v)}
                      title={`판 2339 × 1654 의 ${v * 100}% · 키노트 ${v * 100}% 와 같은 크기`}>
                {v * 100}%
              </button>
            ))}
            {/* 사용자 지정 — 키노트에서 쓰는 %를 그대로 적어 넣는다 */}
            <input
              className="barin zin" type="text" inputMode="numeric"
              placeholder="%" key={`zoom-${배율}`}
              defaultValue={배율 == null ? '' : Math.round(배율 * 100)}
              title="10 ~ 400 사이 % 를 적고 Enter"
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) return set배율(null);
                const n = Number(v.replace('%', ''));
                if (!Number.isFinite(n) || n < 10 || n > 400) {
                  e.target.value = 배율 == null ? '' : Math.round(배율 * 100);
                  return set로그(`배율 "${v}" · 10 ~ 400 사이 숫자로 적는다`);
                }
                set배율(n / 100);
              }}
            />
            <span className="znow">{배율 == null ? '맞춤 ' : ''}{Math.round(축척 * 100)}%</span>
          </div>
        </main>

        {/* 떠 있는 속성 패널 — 어도비 팔레트 짜임 · 머리를 잡아 끌고 · 두 번 누르면 접힌다.
           고른 것이 패널과 안 맞아도 패널은 안 사라진다. 무엇을 고르라고만 적는다 —
           패널이 없어졌다 나타났다 하면 어디에 있었는지 못 찾는다. */}
        {패널.도형 && (() => {
          const z = 자리번호 == null ? null : 현재?.자리?.[자리번호];
          const s = z?.도형 ?? {};
          const 켬 = !!z && !z.비움;
          return (
            <팔레트 이름="도형" 열쇠="도형" 차례={0}
                    자리={패널자리} set자리={set패널자리}
                    접힘={접힘} set접힘={set접힘}
                    z={앞뒤.indexOf('도형')} 앞으로={() => 앞으로('도형')}
                    끄기={() => set패널((p) => ({ ...p, 도형: false }))}>
              {!켬 ? (
                <p className="fphint">
                  {z?.비움 ? '비운 자리다 · 출력에 아무것도 안 나가므로 도형도 못 준다'
                    : '판면에서 자리의 빈 곳을 눌러 고른다'}
                </p>
              ) : (
                <>
                  <줄 이름="배경"
                      곁={도형배경들.find(([v]) => v === (s.배경 ?? ''))?.[1]
                        ?? (HEX6.test(s.배경 ?? '') ? s.배경 : null)}>
                    {도형배경들.map(([v, 이름, 색]) => (
                      <색칸 key={v || 'n'} 색={색} 이름={이름}
                            지금={(s.배경 ?? '') === v}
                            누르기={() => 도형바꾸기('배경', v)} />
                    ))}
                    {/* 최근 쓴 색이 견본과 한 줄에 선다 — 실제로 고르는 자리가 여기다 */}
                    {최근색.length > 0 && <span className="swsp" />}
                    {최근색.map((색) => (
                      <색칸 key={색} 색={색} 이름={`최근 ${색}`}
                            지금={s.배경 === 색}
                            누르기={() => 도형바꾸기('배경', 색)} />
                    ))}
                    {/* 견본에 없는 색은 아래 칸에 적는다. 적으면 위 「최근」 에 붙는다 */}
                    <span className="brk" />
                    <input
                      className="barin hexin"
                      placeholder="#RRGGBB 로 적으면 위에 남는다"
                      defaultValue={HEX6.test(s.배경 ?? '') ? s.배경 : ''}
                      key={`bg-${판본키}-${자리번호}`}
                      style={{ width: '100%' }}
                      title="견본에 없는 색은 여섯 자리 hex 로 적는다"
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v) return;
                        if (!HEX6.test(v)) return set로그(`배경 "${v}" · #RRGGBB 여섯 자리로 적는다`);
                        if (v === s.배경) return;
                        도형바꾸기('배경', v);
                        색기억(v);
                      }}
                    />
                  </줄>
                  <줄 이름="투명도" 곁={s.배경 ? null : '배경이 없으면 안 먹는다'}>
                    <span className="seg">
                      {도형투명도들.map(([v, 이름]) => (
                        <button key={v}
                                className={'chip' + ((s.투명도 ?? 100) === v ? ' on' : '')}
                                disabled={!s.배경}
                                title="배경에만 건다"
                                onClick={() => 도형바꾸기('투명도', v)}>{이름}</button>
                      ))}
                    </span>
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
                    <input
                      className="barin hexin"
                      placeholder="#RRGGBB 로 적으면 위에 남는다"
                      defaultValue={HEX6.test(s.테두리 ?? '') ? s.테두리 : ''}
                      key={`bd-${판본키}-${자리번호}`}
                      style={{ width: '100%' }}
                      title="견본에 없는 색은 여섯 자리 hex 로 적는다"
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v) return;
                        if (!HEX6.test(v)) return set로그(`테두리 "${v}" · #RRGGBB 여섯 자리로 적는다`);
                        if (v === s.테두리) return;
                        도형바꾸기('테두리', v);
                        색기억(v);
                      }}
                    />
                  </줄>
                  <줄 이름="굵기" 곁={s.테두리 ? null : '테두리가 없으면 안 먹는다'}>
                    <span className="seg">
                      {도형굵기들.map(([v, 이름]) => (
                        <button key={v}
                                className={'chip' + ((s.굵기 ?? 1) === v ? ' on' : '')}
                                disabled={!s.테두리}
                                title="키노트 세팅 §5 도형표는 1 이다"
                                onClick={() => 도형바꾸기('굵기', v)}>{이름}</button>
                      ))}
                    </span>
                    <수칸 열쇠="굵기" 값={s.굵기} 기본={1} 열림={!!s.테두리}
                          로그={set로그} 놓기={(n) => 도형바꾸기('굵기', n)} />
                  </줄>
                  <줄 이름="모서리">
                    <span className="seg">
                      {도형모서리들.map(([v, 이름]) => (
                        <button key={v}
                                className={'chip' + ((s.모서리 ?? 10) === v ? ' on' : '')}
                                onClick={() => 도형바꾸기('모서리', v)}>{이름}</button>
                      ))}
                    </span>
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

                  <줄 이름="글자" 곁="어두운 배경에서만">
                    <button className={'chip' + (s.글자 === '반전' ? ' on' : '')}
                            onClick={() => 도형바꾸기('글자', s.글자 === '반전' ? '' : '반전')}
                            title="어두운 배경 위에서 자리 안 글자를 통째로 뒤집는다">
                      반전
                    </button>
                  </줄>
                  <p className="fphint">
                    반전은 <b>명시로만</b> 켠다 · 밝기를 계산해 자동으로 정하지 않는다.
                    다 비우면 문안에서 <b>도형</b> 열쇠가 통째로 사라진다.
                  </p>
                </>
              )}
            </팔레트>
          );
        })()}
      </div>
    </div>
  );
}
