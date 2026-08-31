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
/* 표는 여기서 안 만든다 — 「표」 팔레트가 만든다 · N-배경 b2.
   여기 있던 `{ 밀도 · 열:[{폭:'50%'}] }` 은 옛 12칸 트랙 시대 형식이라
   새 렌더러(표그리기)가 안 읽는다. 남겨 두면 못 쓰는 표가 생긴다. */
const 새덩이 = (유형) => (유형 === '문단' ? { 문단: '문단' } : { 목록: ['내용'] });

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
const 도형그림자들 = [['', '없음'], ['약', '약'], ['중', '중']];
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/* ── 표 칩 — N-배경 b2 ──────────────────────────────────
   렌더러의 표그리기() 가 읽는 열쇠만 여기서 만든다 · **머리 · 행 · 폭 · 선 · 칠 · 채움**.
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
/* 채움 슬롯 · N-배경 b5 — 세로도 가로와 같은 어휘를 쓴다.
     끔 · 균등(true) · 몫 [1,2,1] · % ["30%","70%"] · 공백 { "공백": n }
   공백은 칸 수에 안 든다. **남는 42 덩어리를 받는 자리**가 공백이다. */
const 채움갈래들 = [['끔', '끔'], ['균등', '균등'], ['몫', '몫'], ['%', '%']];
const 공백자리들 = [['없음', '없음'], ['위', '위'], ['아래', '아래'], ['위아래', '위아래']];
const 공백인가 = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const 슬롯값 = (v) => (공백인가(v) ? v.공백 : v);
const 채움갈래 = (v) => (!v ? '끔' : v === true ? '균등'
  : typeof 슬롯값(v[0]) === 'string' ? '%' : '몫');
const 채움기본 = (칸수, 갈래) => {
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
                 몫: [1, 20], 빈몫: [0, 20], 빈비율: [0, 100 - 비율하한] };

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

/* ── 떠 있는 속성 패널 ─────────────────────────────────────
   포토샵 · 인디자인 · 일러스트레이터의 팔레트 짜임 그대로다.

     · 판 위에 떠 있고 · 머리를 잡아 끌어 옮긴다
     · 머리를 두 번 누르면 접힌다 · 머리만 남는다
     · 겹치면 누른 것이 앞으로 온다
     · × 로 닫고 · 툴바 「패널」 에서 다시 켠다 · 자리는 기억한다

   속성을 툴바에 늘어놓지 않는 이유가 이것이다 — 개념마다 팔레트 하나를 두면
   글자 · 표 패널이 붙어도 툴바가 안 늘어나고 판도 안 줄어든다.
   여기 목록에 한 줄 더하면 패널이 하나 늘어난다.
   앞으로 · 글자(계층 · 강조 · 표기) · 면(골격 · 모드). 표는 붙었다 · N-배경 b2. */

const 패널들 = [['도형', '도형'], ['표', '표']];
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
  /* 처음에는 오른쪽 위에 **나란히** 놓는다. 한 번 끌면 그 자리를 기억한다.
     계단으로 겹쳐 놓으면 둘째 패널 머리가 첫째 패널 몸을 덮어 값이 안 보였다 —
     패널이 하나일 때는 안 드러나던 자리다. 폭이 같으므로 한 칸씩 왼쪽으로 민다. */
  const 놓임 = p ? { left: p.x, top: p.y } : { right: 16 + 차례 * (패널폭 + 12), top: 62 };

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
      title="견본에 없는 색은 여섯 자리 hex 로 적는다"
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

    /* 표는 여기서 안 다룬다 · N-배경 b2.
       여기 있던 「행 · 묶음」 폼은 `행:{칸:[…]}` 과 `묶음` 을 읽던 옛 형식이다.
       새 렌더러는 `행:[[…]]` 만 읽고 · 열 · 선 · 칠 · 채움은 「표」 팔레트가 고친다. */
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
  const [패널, set패널] = useState({ 도형: true, 표: true });
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
      const 있는것 = ['제목', '요약', '문단', '목록', '번호목록', '표', '단계띠', '수치', '출처', '도형']
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
     이 패널이 맡는 것은 **틀**이다 · 열 · 행 · 머리행 · 선 · 폭 · 칠 · 채움.

     열과 행을 넣고 뺄 때 머리 · 모든 행 · 폭 · 칠 이 **함께** 움직여야 한다.
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
    채움맞추기(t);
  });
  const 표행빼기 = () => 표바꾸기((t) => {
    if (t.행.length <= 1) { set로그('마지막 행은 지우지 않는다 · 표를 지운다'); return false; }
    t.행.pop();
    if (t.칠?.행) { t.칠.행.pop(); 칠정리(t); }
    채움맞추기(t);
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
    채움맞추기(t, '앞');      // 머리행은 첫 칸이다
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
     12칸 트랙의 폭바꾸기() 가 「칸 합 12」를 지키던 방식 그대로다 */
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

  /* 채움 — 남는 높이를 칸들이 42 걸음으로 나눠 갖는다 · N-배경 b5.
     앞에 문단 · 목록이 있으면 줄 수를 못 세서 렌더러가 던진다.
     같은 말을 여기서 먼저 한다 — 판이 오류판으로 떨어지기 전에 막는 쪽이 낫다 */
  const 표칸수 = (t) => t.행.length + (t.머리 ? 1 : 0);

  /* 채움 배열은 **칸 수와 자리를 맞춰야 한다.** 행을 넣고 빼거나 머리행을 껐다 켜면
     슬롯도 같이 움직인다 — 안 맞추면 렌더러가 「채움에 칸이 N개다」로 던진다.
     머리행은 첫 칸이라 앞에서 · 행은 끝에서 넣고 뺀다. */
  const 채움맞추기 = (t, 어디 = '뒤') => {
    if (!Array.isArray(t.채움)) return;
    const 갈래 = 채움갈래(t.채움);
    const 위 = 공백인가(t.채움[0]) ? [t.채움[0]] : [];
    const 아래 = t.채움.length > 1 && 공백인가(t.채움[t.채움.length - 1])
      ? [t.채움[t.채움.length - 1]] : [];
    const 칸 = t.채움.filter((v) => !공백인가(v));
    const 칸수 = 표칸수(t);
    const 기본 = 갈래 === '%' ? 퍼센트글(0) : 1;
    while (칸.length < 칸수) (어디 === '앞' ? 칸.unshift(기본) : 칸.push(기본));
    while (칸.length > 칸수) (어디 === '앞' ? 칸.shift() : 칸.pop());
    let 새 = [...위, ...칸, ...아래];
    if (갈래 === '%') {
      // 마지막이 나머지를 받는다. 앞이 이미 100 을 넘겼으면 되돌릴 길이 없어 고르게 다시 깐다
      const w = 유효비율(새.map((v) => String(슬롯값(v))));
      새 = w.some((v) => v < 0)
        ? [...위, ...채움기본(칸수, '%'), ...아래]
        : 새.map((v, k) => (공백인가(v) ? { 공백: 퍼센트글(w[k]) } : 퍼센트글(w[k])));
    }
    t.채움 = 새;
  };
  const 표채움갈래 = (v) => 표바꾸기((t, z) => {
    const 지금 = 채움갈래(t.채움);
    if (v === 지금) return false;
    if (v === '끔') { delete t.채움; return; }
    const 막는것 = ['문단', '목록', '번호목록', '단계띠', '수치'].filter((k) => z[k] != null);
    if (막는것.length) {
      set로그(`채움은 앞에 ${막는것.join(' · ')} 가 있으면 못 준다 · 제목 · 요약만 둔다`);
      return false;
    }
    if (v === '균등') { t.채움 = true; return; }
    // 갈래를 옮길 때 값을 이어 나르지 않는다 — 몫 2 와 2% 는 뜻이 다르다.
    // 공백 자리는 지킨다. 그것이 이 갈래의 쓸모다
    const 자리 = 공백자리(t.채움);
    const 칸 = 채움기본(표칸수(t), v);
    t.채움 = [
      ...(자리 === '위' || 자리 === '위아래' ? [빈슬롯(v)] : []),
      ...칸,
      ...(자리 === '아래' || 자리 === '위아래' ? [빈슬롯(v)] : []),
    ];
  });

  /* 공백 자리 — 남는 42 덩어리를 위 · 아래로 몬다.
     균등에서 고르면 같은 높이의 몫으로 갈아 준다. 균등에는 공백을 끼울 자리가 없다 */
  const 표공백 = (자리) => 표바꾸기((t) => {
    const 갈래 = 채움갈래(t.채움);
    if (갈래 === '끔') { set로그('채움을 먼저 켠다'); return false; }
    if (공백자리(t.채움) === 자리) return false;
    const v = 갈래 === '%' ? '%' : '몫';
    const 칸 = 갈래 === '균등' ? 채움기본(표칸수(t), v)
      : t.채움.filter((x) => !공백인가(x));
    t.채움 = [
      ...(자리 === '위' || 자리 === '위아래' ? [빈슬롯(v)] : []),
      ...칸,
      ...(자리 === '아래' || 자리 === '위아래' ? [빈슬롯(v)] : []),
    ];
  });

  /* 슬롯 값 하나 — 몫이면 그 자리만 · % 면 이웃이 차액을 받는다(합 100).
     가로의 표비율() 과 같은 규칙이다 */
  const 표채움값 = (k, n) => 표바꾸기((t) => {
    const a = t.채움;
    if (!Array.isArray(a)) return false;
    if (채움갈래(a) !== '%') {
      if (슬롯값(a[k]) === n) return false;
      t.채움 = a.map((v, j) => (j === k ? (공백인가(v) ? { 공백: n } : n) : v));
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
    t.채움 = a.map((v, m) => (공백인가(v) ? { 공백: 퍼센트글(w[m]) } : 퍼센트글(w[m])));
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
                    {/* 표는 여기 없다 — 「표」 팔레트가 만든다 · N-배경 b2 */}
                    {['목록', '문단'].map((t) => (
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
                    key={`빔-${slug}-${i}-${자리번호}`}
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
          </main>

        {/* 뜨는 것들은 툴바 아래 층에 산다 — 이 층이 위치 기준이다.
           .stage 기준으로 두면 top:0 이 툴바를 덮고 · .view 기준으로 두면
           판을 키웠을 때 스크롤에 딸려 흘러간다. 층은 스크롤하지 않는다. */}
        <div className="floats">
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
                      <색입력 값={s.배경} 이름="배경" 로그={set로그}
                                놓기={(v) => { 도형바꾸기('배경', v); 색기억(v); }} />
                    </줄>
                    <줄 이름="투명도" 곁={s.배경 ? null : '배경이 없으면 안 먹는다'}>
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
                    <줄 이름="굵기" 곁={s.테두리 ? '세팅표는 1 이다' : '테두리가 없으면 안 먹는다'}>
                      <수칸 열쇠="굵기" 값={s.굵기} 기본={1} 열림={!!s.테두리}
                            로그={set로그} 놓기={(n) => 도형바꾸기('굵기', n)} />
                    </줄>
                    <줄 이름="모서리" 곁="세팅표는 10 이다">
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

          {/* ── 표 팔레트 · N-배경 b2 ────────────────────────────
              **틀만 여기서 고친다.** 칸 안 글자는 판면에서 그 칸을 눌러 고친다 —
              렌더러가 칸마다 data-p 를 붙여 두어 제자리 편집이 이미 닿는다.
              여기 값은 전부 render/index.js 의 표그리기() 가 읽는 열쇠와 같다. */}
          {패널.표 && (() => {
            const z = 자리번호 == null ? null : 현재?.자리?.[자리번호];
            const t = z?.표 ?? null;
            const 켬 = !!z && !z.비움;
            const n = 표열수(t);
            const 줄무늬 = !!t?.칠?.행?.some(Boolean);
            const 폭갈래 = !t?.폭 ? '균등' : 백분율폭(t.폭) ? '%' : '몫';
            // 마지막 열은 나머지를 받는다 — 적힌 값이 아니라 그려지는 값을 보인다
            const 비율 = 폭갈래 === '%' ? 유효비율(t.폭) : null;
            // 채움 · 세로 — 갈래 · 공백 자리 · 슬롯 읽기
            const 채움갈 = t ? 채움갈래(t.채움) : '끔';
            const 빈자리 = t ? 공백자리(t.채움) : '없음';
            const 채움비율 = 채움갈 === '%' ? 유효비율(t.채움.map((v) => String(슬롯값(v)))) : null;
            const 슬롯보기 = 채움갈 === '몫' || 채움갈 === '%'
              ? t.채움.map((v, k) => (공백인가(v) ? `빈 ${채움갈 === '%' ? 채움비율[k] + '%' : 슬롯값(v)}`
                  : String(채움갈 === '%' ? 채움비율[k] + '%' : 슬롯값(v))))
              : [];
            const 머리칠 = t?.칠?.머리 ?? '';
            return (
              <팔레트 이름="표" 열쇠="표" 차례={1}
                      자리={패널자리} set자리={set패널자리}
                      접힘={접힘} set접힘={set접힘}
                      z={앞뒤.indexOf('표')} 앞으로={() => 앞으로('표')}
                      끄기={() => set패널((p) => ({ ...p, 표: false }))}>
                {!켬 ? (
                  <p className="fphint">
                    {z?.비움 ? '비운 자리다 · 출력에 아무것도 안 나가므로 표도 못 놓는다'
                      : '판면에서 자리의 빈 곳을 눌러 고른다'}
                  </p>
                ) : !t ? (
                  <>
                    <button className="chip" onClick={표만들기}>+ 표</button>
                    <p className="fphint">
                      머리행 하나에 <b>2열 · 2행</b>으로 놓는다.
                      칸 글자는 <b>판면에서 그 칸을 눌러</b> 고친다.
                    </p>
                  </>
                ) : (
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
                              title="머리행 · 아래 선이 진해진다">
                        머리행
                      </button>
                    </줄>
                    <줄 이름="선" 곁="칸 사이에만 긋는다">
                      <span className="seg">
                        {표선들.map(([v, 이름]) => (
                          <button key={v} className={'chip' + ((t.선 ?? '가로') === v ? ' on' : '')}
                                  onClick={() => 표선(v)}>{이름}</button>
                        ))}
                      </span>
                    </줄>
                    {/* 폭 · 갈래 셋 — 균등 · 몫 · % · N-배경 b3.
                        몫은 안쪽 거터를 열이 먹고 · % 는 거터를 뺀 나머지를 나눈다.
                        같은 30% 라도 몫 흉내가 4px 넓다. 섞어 쓰지 않는다 */}
                    <줄 이름="폭"
                        곁={폭갈래 === '균등' ? `${n}열 균등`
                          : 폭갈래 === '몫' ? `${t.폭.join(' : ')} · 몫 1~${표열최대}`
                          : `${비율.join(' + ')} = 100 · 마지막이 나머지`}>
                      <span className="seg">
                        {표폭갈래들.map(([v, 이름]) => (
                          <button key={v} className={'chip' + (폭갈래 === v ? ' on' : '')}
                                  onClick={() => 표폭갈래(v)}
                                  title={v === '몫' ? '균등 트랙 몇 개를 먹느냐 · 안쪽 거터를 열이 먹는다'
                                    : v === '%' ? '거터를 뺀 나머지의 백분율 · 합 100'
                                    : '폭 열쇠를 지운다 · 열이 고르게 나뉜다'}>
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

                    <div className="popln" />

                    <줄 이름="머리 칠" 곁={t.머리 ? (도형배경들.find(([v]) => v === 머리칠)?.[1]
                          ?? (HEX6.test(머리칠) ? 머리칠 : null)) : '머리행이 없으면 안 먹는다'}>
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
                    <줄 이름="줄무늬" 곁="한 줄 걸러 블록배경">
                      <button className={'chip' + (줄무늬 ? ' on' : '')}
                              onClick={() => 표줄무늬(!줄무늬)}>줄무늬</button>
                    </줄>

                    <div className="popln" />

                    {/* 채움 · 세로 · N-배경 b5 — 가로(폭)와 같은 어휘다.
                        세로는 42 격자에 갇혀 한 칸이 4.76%p 다. 정확히 나누려면 몫을 쓴다 */}
                    <줄 이름="채움"
                        곁={채움갈 === '끔' ? '칸마다 한 줄 42'
                          : 채움갈 === '균등' ? '남는 높이를 고르게 · 남음은 위아래로'
                          : 슬롯보기.join(' · ')}>
                      <span className="seg">
                        {채움갈래들.map(([v, 이름]) => (
                          <button key={v} className={'chip' + (채움갈 === v ? ' on' : '')}
                                  onClick={() => 표채움갈래(v)}
                                  title={v === '끔' ? '칸마다 한 줄 42'
                                    : v === '균등' ? '남은 높이를 칸들이 고르게 나눈다'
                                    : v === '몫' ? '칸마다 몇 몫이냐 · 42 로 끊어 나눈다'
                                    : '백분율 · 42 로 끊기므로 한 칸이 4.76%p 다'}>
                            {이름}
                          </button>
                        ))}
                      </span>
                      {(채움갈 === '몫' || 채움갈 === '%') && <span className="brk" />}
                      {(채움갈 === '몫' || 채움갈 === '%') && t.채움.map((v, k) => (
                        <수칸 key={k}
                              열쇠={채움갈 === '%' ? (공백인가(v) ? '빈비율' : '비율')
                                : (공백인가(v) ? '빈몫' : '몫')}
                              값={채움갈 === '%' ? 채움비율[k] : 슬롯값(v)}
                              기본={채움갈 === '%' ? 채움비율[k] : 슬롯값(v)} 좁게
                              로그={set로그} 놓기={(n) => 표채움값(k, n)} />
                      ))}
                    </줄>
                    {채움갈 !== '끔' && (
                      <줄 이름="공백" 곁="남는 42 덩어리를 여기가 받는다">
                        <span className="seg">
                          {공백자리들.map(([v, 이름]) => (
                            <button key={v} className={'chip' + (빈자리 === v ? ' on' : '')}
                                    onClick={() => 표공백(v)}
                                    title={v === '없음' ? '남음을 위아래로 가른다 · 지금까지 그대로'
                                      : `남는 높이를 ${이름}에 몬다`}>
                              {이름}
                            </button>
                          ))}
                        </span>
                      </줄>
                    )}
                    <줄 이름="표" 곁="이 자리에서 없앤다">
                      <button className="chip warn" onClick={표없애기}>− 표</button>
                    </줄>
                    <p className="fphint">
                      칸 글자는 <b>판면에서 그 칸을 눌러</b> 고친다.
                      선은 <b>칸 사이</b>에만 놓인다 — 바깥 테두리는 <b>도형</b>이 두른다.
                    </p>
                  </>
                )}
              </팔레트>
            );
          })()}
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
        </div>
      </div>
    </div>
  );
}
