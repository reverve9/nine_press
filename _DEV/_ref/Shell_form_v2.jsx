'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 빌드, PDF, 문안저장, 문안불러오기 } from '../actions.js';

const W = 2340;
const H = 1654;

/* ── 경로 유틸 — ['행',0,'열',0,'블록',1,'라벨'] ── */
const 읽기 = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
function 쓰기(o, p, v) {
  const 부모 = p.slice(0, -1).reduce((a, k) => a[k], o);
  부모[p[p.length - 1]] = v;
}

/* ── 고친 DOM 을 원문 표기로 되돌린다 ──
   판면에서 그 자리에 타이핑하면 결과는 HTML 이다. 그대로 저장하면 문안의 원본이
   HTML 이 되어 버린다. 다시 `**굵게**` · {TBD} · {→05} · 줄바꿈으로 되돌린다.
   왕복은 roundtrip.mjs 가 전수 검사한다. */
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
    s += 원문(n);            // 알 수 없는 껍데기는 벗긴다
  }
  return s;   // NBSP 는 그대로 둔다 — 보통 공백으로 바꾸면 자간이 달라진다
}

/* ── 폼은 구조만 다룬다.  글자는 판면에서 그 자리에 고친다 ── */
const 줄여 = (s, n = 34) => {
  const t = String(s ?? '').replace(/\*\*/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : (t || '(빈 줄)');
};

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

    for (const key of ['목록', '번호목록']) {
      if (!it[key]) continue;
      out.push({ 종류: '갈피', 이름: key });
      it[key].forEach((s, k) =>
        out.push({ 종류: '줄', 이름: `${k + 1}`, 미리: 줄여(s), 배열: [...ib, key], 자리: k }));
      out.push({ 종류: '추가', 이름: '줄 추가', 배열: [...ib, key], 새값: '' });
    }

    if (it.문단 != null) {
      out.push({ 종류: '갈피', 이름: '문단' });
      out.push({ 종류: '알림', 이름: 줄여(it.문단, 40) });
    }

    if (it.표) {
      const t = it.표;
      const tb = [...ib, '표'];
      const 칸수 = t.머리?.length
        ?? (Array.isArray(t.행?.[0]) ? t.행[0].length : t.행?.[0]?.칸?.length) ?? 2;

      out.push({ 종류: '갈피', 이름: '표' });
      (t.행 ?? []).forEach((r, k) => {
        const 칸 = Array.isArray(r) ? r : r.칸;
        out.push({ 종류: '줄', 이름: `${k + 1}행`, 미리: 줄여(칸.join(' · ')), 배열: [...tb, '행'], 자리: k });
      });
      out.push({ 종류: '추가', 이름: '행 추가', 배열: [...tb, '행'],
                 새값: Array.from({ length: 칸수 }, () => '') });

      (t.묶음 ?? []).forEach((g, gi) => {
        out.push({ 종류: '갈피', 이름: `묶음 · ${줄여(g.이름, 14)}` });
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
  const [표적, set표적] = useState(null);          // {ri,ci,bi} · 'head' · null
  const [더러움, set더러움] = useState(false);
  const [로그, set로그] = useState('');
  const [바쁨, set바쁨] = useState(false);
  const [축척, set축척] = useState(0.3);
  const [판본키, set판본키] = useState(0);
  const [검사, set검사] = useState(null);
  const 판 = useRef(null);
  const 틀 = useRef(null);
  const 문서ref = useRef(null);
  const 면ref = useRef(0);
  const 시각ref = useRef(0);

  const 불러오기 = useCallback(async (s) => {
    const r = await 문안불러오기(s);
    if (!r.ok) return set로그(r.사유);
    setDoc(r.doc); setMtime(r.mtime); setI(0); set표적(null);
    set더러움(false); set판본키((n) => n + 1);
  }, []);

  useEffect(() => { if (slug) 불러오기(slug); }, [slug, 불러오기]);
  useEffect(() => { 문서ref.current = doc; }, [doc]);
  useEffect(() => { 면ref.current = i; }, [i]);
  useEffect(() => { 시각ref.current = mtime; }, [mtime]);

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

  const 표적이름 = useMemo(() => {
    if (!현재 || !표적) return '';
    if (표적 === 'head') return '면 머리 · 실무 확인';
    const b = 현재.행?.[표적.ri]?.열?.[표적.ci]?.블록?.[표적.bi];
    return b?.라벨 ?? b?.이름 ?? '(이름 없음)';
  }, [현재, 표적]);

  const 구조 = useMemo(
    () => (현재 && 표적 ? 구조칸들(현재, 표적) : []),
    [현재, 표적],
  );

  function 줄넣기(배열, 새값) {
    const d = structuredClone(문서ref.current);
    let a = 읽기(d.면[면ref.current], 배열);
    if (!Array.isArray(a)) { 쓰기(d.면[면ref.current], 배열, []); a = 읽기(d.면[면ref.current], 배열); }
    a.push(structuredClone(새값));
    문서ref.current = d; setDoc(d); set더러움(true);
  }
  function 줄빼기(배열, 자리) {
    const d = structuredClone(문서ref.current);
    const a = 읽기(d.면[면ref.current], 배열);
    if (a.length <= 1) return set로그('마지막 줄은 지우지 않는다');
    a.splice(자리, 1);
    문서ref.current = d; setDoc(d); set더러움(true);
  }

  async function 저장() {
    set바쁨(true); set로그('저장 …');
    // iframe 안 이벤트에서도 불리므로 state 가 아니라 ref 를 본다
    const r = await 문안저장(slug, 시각ref.current, 문서ref.current);
    if (r.ok) { setMtime(r.mtime); set더러움(false); set로그('저장됨'); set판본키((n) => n + 1); }
    else set로그(r.사유);
    set바쁨(false);
  }

  async function 실행(fn) {
    set바쁨(true); set로그('…');
    const r = await fn();
    set로그(r.log || (r.ok ? '완료' : '실패'));
    set바쁨(false);
  }

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
            'outline:calc(2*var(--u)) solid #E68100;outline-offset:calc(1.5*var(--u))}';
        d.head.appendChild(st);
        d.execCommand?.('defaultParagraphSeparator', false, 'br');

        d.addEventListener('mousedown', (e) => {
          const t = e.target.closest?.('[data-p]');
          if (!t || t.isContentEditable) return;
          t.dataset.전 = 원문(t);
          t.dataset.전html = t.innerHTML;
          t.contentEditable = 'true';
          setTimeout(() => t.focus(), 0);
        });

        d.addEventListener('focusout', (e) => {
          const t = e.target.closest?.('[data-p]');
          if (!t || !t.isContentEditable) return;
          t.contentEditable = 'false';
          const 뒤 = 원문(t);
          if (뒤 === t.dataset.전) return;
          const dd = structuredClone(문서ref.current);
          쓰기(dd.면[면ref.current], JSON.parse(t.dataset.p), 뒤);
          문서ref.current = dd; setDoc(dd); set더러움(true);
        }, true);

        d.addEventListener('keydown', (e) => {
          const t = e.target.closest?.('[data-p]');
          if (e.key === 'Escape' && t?.isContentEditable) {
            t.innerHTML = t.dataset.전html ?? t.innerHTML;
            t.blur();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey && t?.isContentEditable) {
            e.preventDefault();
            d.execCommand('insertLineBreak');
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); t?.blur(); 저장(); }
        });

        // 붙여넣기는 글자만 — 다른 데서 딸려오는 서식을 막는다
        d.addEventListener('paste', (e) => {
          if (!e.target.closest?.('[data-p]')?.isContentEditable) return;
          e.preventDefault();
          d.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        });

        // 글자가 아닌 곳을 누르면 그 블록의 줄·행을 손보는 자리로
        d.addEventListener('click', (e) => {
          if (e.target.closest?.('[data-p]')) return;
          const t = e.target.closest?.('[data-b]');
          if (!t) return;
          const v = t.getAttribute('data-b');
          if (v === 'head') return set표적('head');
          const [ri, ci, bi] = v.split('-').map(Number);
          set표적({ ri, ci, bi });
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
      } catch { /* 다른 출처면 못 잰다 */ }
    }, 700);
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">nine_press</div>

        <select className="pick" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {docs.map((d) => (
            <option key={d.slug} value={d.slug}>{d.사업} / {d.이름}</option>
          ))}
        </select>

        {표적 ? (
          <>
            <button className="back" onClick={() => set표적(null)}>← 면 목록</button>
            <div className="lbl">{표적이름}</div>
            <div className="list form">
              {구조.map((f, k) => {
                if (f.종류 === '갈피') return <div key={k} className="grp">{f.이름}</div>;
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
            </div>
            <p className="note">글자는 <b>판면에서 그 자리에</b> 고친다.<br />여기서는 줄과 행만 더하고 뺀다.</p>
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
            <p className="note">판면에서 글자를 눌러 고친다.<br />빈 곳을 누르면 줄·행을 손본다.</p>
          </>
        )}

        <div className="foot">
          <button className="save" disabled={바쁨 || !더러움} onClick={저장}>
            {더러움 ? '저장  ⌘S' : '저장됨'}
          </button>
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
              src={`/api/preview?doc=${encodeURIComponent(slug)}&i=${i}`}
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
