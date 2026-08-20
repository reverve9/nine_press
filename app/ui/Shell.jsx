'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 빌드, PDF, 문안저장, 문안불러오기 } from '../actions.js';
import { render } from '../../render/index.js';

const W = 2340;
const H = 1654;

/* ── 경로 유틸 ── */
const 읽기 = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
function 쓰기(o, p, v) {
  const 부모 = p.slice(0, -1).reduce((a, k) => a[k], o);
  부모[p[p.length - 1]] = v;
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
  const [격자, set격자] = useState(false);

  const 판 = useRef(null);
  const 틀 = useRef(null);
  const 문서ref = useRef(null);
  const 면ref = useRef(0);
  const 시각ref = useRef(0);
  const 격자ref = useRef(false);
  const 스택 = useRef([]);        // 되돌리기 — 문서 스냅샷
  const 앞스택 = useRef([]);      // 다시 하기

  const 불러오기 = useCallback(async (s) => {
    const r = await 문안불러오기(s);
    if (!r.ok) return set로그(r.사유);
    스택.current = []; 앞스택.current = []; set되돌림(0);
    문서ref.current = r.doc;   // 판본 useMemo 가 이 렌더에서 바로 읽는다
    setDoc(r.doc); setMtime(r.mtime); setI(0); set표적(null);
    set더러움(false); set판본키((n) => n + 1);
  }, []);

  useEffect(() => { if (slug) 불러오기(slug); }, [slug, 불러오기]);
  useEffect(() => { 문서ref.current = doc; }, [doc]);
  useEffect(() => { 면ref.current = i; }, [i]);
  useEffect(() => { 시각ref.current = mtime; }, [mtime]);
  useEffect(() => { 격자ref.current = 격자; }, [격자]);

  /* 켜고 끌 때 iframe 문서에 바로 입힌다 */
  useEffect(() => {
    const d = 틀.current?.contentDocument;
    if (d) d.documentElement.classList.toggle('gridon', 격자);
  }, [격자]);

  useEffect(() => {
    const el = 판.current;
    if (!el) return;
    const 맞춤 = () => {
      const { width, height } = el.getBoundingClientRect();
      set축척(Math.max(0.08, Math.min((width - 48) / W, (height - 72) / H)));
    };
    맞춤();
    const ro = new ResizeObserver(맞춤);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      if (e.key === '\\') { e.preventDefault(); set격자((v) => !v); }
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
          // 격자 — 자홍. 판면이 안 쓰는 색이라 판면 요소로 오인되지 않는다.
          // 선을 3px 로 둔다 — 축척 30% 에서 화면 0.9px 이다. 1px 이면 사라진다
          '.gridov{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:40;display:none}' +
          'html.gridon .gridov{display:block}' +
          '.gridov .c{position:absolute;top:0;bottom:0;background:rgba(200,0,120,.07)}' +
          '.gridov .v{position:absolute;top:0;bottom:0;width:3px;background:rgba(200,0,120,.5)}' +
          '.gridov .h{position:absolute;left:0;right:0;height:3px;background:rgba(200,0,120,.5)}' +
          '.gridov .r{position:absolute;left:0;right:0;height:2px;background:rgba(200,0,120,.28)}';
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
          바꾸기((dd) => 쓰기(dd.면[면ref.current], JSON.parse(t.dataset.p), 뒤));
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
            if (e.key === '\\') { e.preventDefault(); set격자((v) => !v); }
          }
        });

        d.addEventListener('paste', (e) => {
          if (!e.target.closest?.('[data-p]')?.isContentEditable) return;
          e.preventDefault();
          d.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        });

        d.addEventListener('click', (e) => {
          if (e.target.closest?.('[data-p]')) return;
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

        // 격자 — 도구 전용. 판면에는 아무 영향이 없다.
        //   .c 12칸 세로 띠   .v 좌우 여백   .h 본문 상하   .r 행 경계
        // 페이지 전면에 깔아 헤더 · 쪽번호 자리와의 세로 정렬까지 본다.
        const page = d.querySelector('.page');
        const bd = d.querySelector('.page .bd');
        if (page && !page.querySelector('.gridov')) {
          const ov = d.createElement('div');
          ov.className = 'gridov';
          if (bd) {
            const L = bd.offsetLeft, W = bd.offsetWidth;
            const T = bd.offsetTop,  H = bd.offsetHeight;
            const 걸음 = 92.73975 * uu;              // 180.75px
            const 칸폭 = (92.73975 - 14.879) * uu;   // 151.75px
            for (let k = 0; k < 12; k++) {
              const c = d.createElement('i');
              c.className = 'c';
              c.style.left = (L + k * 걸음) + 'px';
              c.style.width = 칸폭 + 'px';
              ov.appendChild(c);
            }
            for (const x of [L, L + W]) {
              const v = d.createElement('i');
              v.className = 'v';
              v.style.left = (x - 1.5) + 'px';
              ov.appendChild(v);
            }
            for (const y of [T, T + H]) {
              const h = d.createElement('i');
              h.className = 'h';
              h.style.top = (y - 1.5) + 'px';
              ov.appendChild(h);
            }
          }
          page.appendChild(ov);
        }

        // 행 경계는 콘텐츠가 정하므로 폰트가 앉은 뒤에 잰다.
        // 행 하나에 위·아래 두 줄이 그어져 그 사이가 행 간격(29px)으로 보인다.
        const 행선 = () => {
          const ov = d.querySelector('.gridov');
          const bd2 = d.querySelector('.page .bd');
          if (!ov || !bd2) return;
          ov.querySelectorAll('.r').forEach((x) => x.remove());
          bd2.querySelectorAll(':scope > .row, :scope > .foot').forEach((el) => {
            for (const y of [el.offsetTop, el.offsetTop + el.offsetHeight]) {
              const r = d.createElement('i');
              r.className = 'r';
              r.style.top = (bd2.offsetTop + y - 1) + 'px';
              ov.appendChild(r);
            }
          });
        };
        (d.fonts?.ready ?? Promise.resolve()).then(행선);
        // srcdoc 이 갈리면 문서가 새로 만들어져 클래스가 날아간다. 다시 입힌다
        d.documentElement.classList.toggle('gridon', 격자ref.current);

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
    return render({ ...d, 면: [d.면[i]] }, { cssBase: '/api/css', 도구: true })
      // 그림은 /api/img 로 돌린다 — 정적 중복을 만들지 않는다
      .replaceAll('src="assets/', 'src="/api/img/')
      .replace(
      '</head>',
      `<style>
body{padding:0;margin:0;background:transparent;overflow:hidden}
.wrap{width:2340px;margin:0}
.sheet{width:2340px;height:1654px;margin:0;overflow:hidden}
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
            <span className="ck">격자</span>
            <button className={'chip' + (격자 ? ' on' : '')} onClick={() => set격자((v) => !v)}>
              {격자 ? '켬' : '끔'}
            </button>
          </div>
        </div>

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
        <div className="scale">{Math.round(축척 * 100)}%</div>
      </main>
    </div>
  );
}
