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

/* ── 블록 하나에서 편집 칸을 뽑는다.  구조(행·열·블록)는 건드리지 않는다 ── */
function 칸들(면, ri, ci, bi) {
  const b = 면.행[ri].열[ci].블록[bi];
  const base = ['행', ri, '열', ci, '블록', bi];
  const out = [{ 종류: '글', 이름: '라벨', 경로: [...base, '라벨'], 값: b.라벨 ?? '' }];

  (b.내용 ?? []).forEach((it, ii) => {
    const ib = [...base, '내용', ii];

    for (const key of ['목록', '번호목록']) {
      if (!it[key]) continue;
      it[key].forEach((s, li) =>
        out.push({ 종류: '글', 이름: `${key} ${li + 1}`, 경로: [...ib, key, li], 값: s,
                   배열: [...ib, key], 자리: li }));
      out.push({ 종류: '줄추가', 이름: `${key} 줄 추가`, 배열: [...ib, key], 새값: '' });
    }

    if (it.문단 != null)
      out.push({ 종류: '문단', 이름: '문단', 경로: [...ib, '문단'], 값: it.문단 });

    if (it.표) {
      const t = it.표;
      const tb = [...ib, '표'];
      const 칸수 = t.머리?.length
        ?? (Array.isArray(t.행?.[0]) ? t.행[0].length : t.행?.[0]?.칸?.length) ?? 2;

      (t.머리 ?? []).forEach((s, k) =>
        out.push({ 종류: '글', 이름: `머리 ${k + 1}`, 경로: [...tb, '머리', k], 값: s }));

      (t.행 ?? []).forEach((r, k) => {
        const 배열행 = Array.isArray(r);
        const rp = 배열행 ? [...tb, '행', k] : [...tb, '행', k, '칸'];
        (배열행 ? r : r.칸).forEach((s, c) =>
          out.push({ 종류: '글', 이름: `${k + 1}행 ${c + 1}`, 경로: [...rp, c], 값: s,
                     배열: c === 0 ? [...tb, '행'] : null, 자리: k }));
      });
      out.push({ 종류: '줄추가', 이름: '표 행 추가', 배열: [...tb, '행'],
                 새값: Array.from({ length: 칸수 }, () => '') });

      (t.묶음 ?? []).forEach((g, gi) => {
        out.push({ 종류: '글', 이름: `묶음 ${gi + 1} 이름`, 경로: [...tb, '묶음', gi, '이름'], 값: g.이름 });
        (g.항목 ?? []).forEach((r, k) => {
          const 여럿 = Array.isArray(r);
          if (여럿) r.forEach((s, c) =>
            out.push({ 종류: '글', 이름: `묶음 ${gi + 1} · ${k + 1}행 ${c + 1}`,
                       경로: [...tb, '묶음', gi, '항목', k, c], 값: s,
                       배열: c === 0 ? [...tb, '묶음', gi, '항목'] : null, 자리: k }));
          else out.push({ 종류: '글', 이름: `묶음 ${gi + 1} · ${k + 1}행`,
                          경로: [...tb, '묶음', gi, '항목', k], 값: r,
                          배열: [...tb, '묶음', gi, '항목'], 자리: k });
        });
        out.push({ 종류: '줄추가', 이름: `묶음 ${gi + 1} 줄 추가`, 배열: [...tb, '묶음', gi, '항목'], 새값: '' });
      });

      (t.합계 ?? []).forEach((s, c) =>
        out.push({ 종류: '글', 이름: `합계 ${c + 1}`, 경로: [...tb, '합계', c], 값: s }));
    }
  });
  return out;
}

/* ── 면 머리 — 제목 · 메타 · 실무 확인 ── */
function 면칸들(면) {
  const out = [
    { 종류: '글', 이름: '제목', 경로: ['제목'], 값: 면.제목 ?? '' },
    { 종류: '글', 이름: '메타', 경로: ['메타'], 값: 면.메타 ?? '' },
  ];
  (면.실무확인 ?? []).forEach((s, k) =>
    out.push({ 종류: '문단', 이름: `실무 확인 ${k + 1}`, 경로: ['실무확인', k], 값: s,
               배열: ['실무확인'], 자리: k }));
  out.push({ 종류: '줄추가', 이름: '실무 확인 줄 추가', 배열: ['실무확인'], 새값: '' });
  return out;
}

export default function Shell({ docs, first }) {
  const [slug, setSlug] = useState(first?.slug ?? '');
  const [doc, setDoc] = useState(first?.doc ?? null);
  const [mtime, setMtime] = useState(0);
  const [i, setI] = useState(0);
  const [모드, set모드] = useState('면');          // 면 | 블록 | 편집
  const [표적, set표적] = useState(null);          // {ri,ci,bi} 또는 'head'
  const [더러움, set더러움] = useState(false);
  const [로그, set로그] = useState('');
  const [바쁨, set바쁨] = useState(false);
  const [축척, set축척] = useState(0.3);
  const [판본키, set판본키] = useState(0);
  const [검사, set검사] = useState(null);
  const 판 = useRef(null);
  const 틀 = useRef(null);

  const 불러오기 = useCallback(async (s) => {
    const r = await 문안불러오기(s);
    if (!r.ok) return set로그(r.사유);
    setDoc(r.doc); setMtime(r.mtime); setI(0); set모드('면'); set표적(null);
    set더러움(false); set판본키((n) => n + 1);
  }, []);

  useEffect(() => { if (slug) 불러오기(slug); }, [slug, 불러오기]);

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

  const 블록들 = useMemo(() => {
    if (!현재) return [];
    const out = [{ 키: 'head', 이름: '제목 · 메타 · 실무 확인', 열: '면' }];
    (현재.행 ?? []).forEach((r, ri) =>
      (r.열 ?? []).forEach((c, ci) =>
        (c.블록 ?? []).forEach((b, bi) =>
          out.push({ 키: `${ri}-${ci}-${bi}`, ri, ci, bi,
                     이름: b.라벨 ?? b.이름 ?? '(이름 없음)', 열: `${ci + 1}열` }))));
    return out;
  }, [현재]);

  const 편집칸 = useMemo(() => {
    if (모드 !== '편집' || !현재 || !표적) return [];
    return 표적 === 'head' ? 면칸들(현재) : 칸들(현재, 표적.ri, 표적.ci, 표적.bi);
  }, [모드, 현재, 표적, 판본키, 더러움]);

  function 고침(경로, 값) {
    const d = structuredClone(doc);
    쓰기(d.면[i], 경로, 값);
    setDoc(d); set더러움(true);
  }
  function 줄넣기(배열, 새값) {
    const d = structuredClone(doc);
    let a = 읽기(d.면[i], 배열);
    if (!Array.isArray(a)) { 쓰기(d.면[i], 배열, []); a = 읽기(d.면[i], 배열); }  // 실무확인이 아예 없던 면
    a.push(structuredClone(새값));
    setDoc(d); set더러움(true);
  }
  function 줄빼기(배열, 자리) {
    const d = structuredClone(doc);
    const a = 읽기(d.면[i], 배열);
    if (a.length <= 1) return set로그('마지막 줄은 지우지 않는다');
    a.splice(자리, 1);
    setDoc(d); set더러움(true);
  }

  async function 저장() {
    set바쁨(true); set로그('저장 …');
    const r = await 문안저장(slug, mtime, doc);
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

  /* 판본이 그려지면 ① 클릭을 받고 ② 넘침을 잰다 */
  function 재기() {
    const el = 틀.current;
    if (!el) return;

    // ① 판면에서 블록을 누르면 그 블록 폼으로 간다 — data-b 는 렌더러가 심는다
    try {
      const d = el.contentDocument;
      if (d && !d.body.dataset.집음) {
        d.body.dataset.집음 = '1';
        const st = d.createElement('style');
        st.textContent =
          '[data-b]{cursor:pointer}' +
          '[data-b]:hover{outline:calc(2.5*var(--u)) solid #E68100;outline-offset:calc(2*var(--u))}';
        d.head.appendChild(st);
        d.addEventListener('click', (e) => {
          const t = e.target.closest?.('[data-b]');
          if (!t) return;
          const v = t.getAttribute('data-b');
          if (v === 'head') { set표적('head'); set모드('편집'); return; }
          const [ri, ci, bi] = v.split('-').map(Number);
          set표적({ ri, ci, bi }); set모드('편집');
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

        {모드 === '면' && (
          <>
            <div className="lbl">면 {면.length}</div>
            <nav className="list">
              {면.map((p, n) => (
                <button key={n} className={'row' + (n === i ? ' on' : '')}
                        onClick={() => setI(n)} onDoubleClick={() => set모드('블록')}>
                  <span className="no">{p.번호}</span>
                  <span className="tt">{p.제목}</span>
                </button>
              ))}
            </nav>
            <button className="drill" onClick={() => set모드('블록')} disabled={!현재}>
              블록 보기 →
            </button>
          </>
        )}

        {모드 === '블록' && (
          <>
            <button className="back" onClick={() => set모드('면')}>← 면 목록</button>
            <div className="lbl">{현재?.번호} · 블록 {블록들.length - 1}</div>
            <nav className="list">
              {블록들.map((b) => (
                <button key={b.키} className="row"
                        onClick={() => { set표적(b.키 === 'head' ? 'head' : { ri: b.ri, ci: b.ci, bi: b.bi }); set모드('편집'); }}>
                  <span className="col">{b.열}</span>
                  <span className="tt">{b.이름}</span>
                </button>
              ))}
            </nav>
            <p className="note">블록을 누르면 그 안의 글을 고친다.<br />행 · 열 · 블록 추가는 JSON 에서.</p>
          </>
        )}

        {모드 === '편집' && (
          <>
            <button className="back" onClick={() => set모드('블록')}>← 블록 목록</button>
            <div className="lbl">
              {표적 === 'head' ? '면 머리' : 블록들.find((b) => b.ri === 표적?.ri && b.ci === 표적?.ci && b.bi === 표적?.bi)?.이름}
            </div>
            <div className="list form">
              {편집칸.map((f, k) =>
                f.종류 === '줄추가' ? (
                  <button key={k} className="addln" onClick={() => 줄넣기(f.배열, f.새값)}>+ {f.이름}</button>
                ) : (
                  <label key={k} className="fld">
                    <span className="fn">
                      {f.이름}
                      {f.배열 && (
                        <button className="delln" title="이 줄 삭제"
                                onClick={(e) => { e.preventDefault(); 줄빼기(f.배열, f.자리); }}>−</button>
                      )}
                    </span>
                    <textarea
                      rows={f.종류 === '문단' ? 3 : 1}
                      value={f.값 ?? ''}
                      onChange={(e) => 고침(f.경로, e.target.value)}
                    />
                  </label>
                ),
              )}
            </div>
            <button className="save" disabled={바쁨 || !더러움} onClick={저장}>
              {더러움 ? '저장' : '저장됨'}
            </button>
          </>
        )}

        <div className="foot">
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
