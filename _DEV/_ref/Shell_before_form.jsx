'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { 빌드, PDF } from '../actions.js';

const W = 2340;
const H = 1654;

export default function Shell({ docs, first }) {
  const [slug, setSlug] = useState(first?.slug ?? '');
  const [doc, setDoc] = useState(first?.doc ?? null);
  const [i, setI] = useState(0);
  const [모드, set모드] = useState('면'); // 면 | 블록
  const [로그, set로그] = useState('');
  const [바쁨, set바쁨] = useState(false);
  const [축척, set축척] = useState(0.3);
  const 판 = useRef(null);

  // 문서 전환
  useEffect(() => {
    if (!slug) return;
    let 취소 = false;
    fetch(`/api/doc?doc=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (취소) return;
        setDoc(d);
        setI(0);
        set모드('면');
      })
      .catch(() => {});
    return () => { 취소 = true; };
  }, [slug]);

  // 판본을 창에 맞춘다
  useEffect(() => {
    const el = 판.current;
    if (!el) return;
    const 맞춤 = () => {
      const { width, height } = el.getBoundingClientRect();
      const v = Math.min((width - 48) / W, (height - 72) / H);
      set축척(Math.max(0.08, v));
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
    const out = [];
    (현재.행 ?? []).forEach((r, ri) =>
      (r.열 ?? []).forEach((c, ci) =>
        (c.블록 ?? []).forEach((b, bi) =>
          out.push({ 키: `${ri}-${ci}-${bi}`, 이름: b.이름 ?? b.라벨 ?? b.제목 ?? '(이름 없음)', 열: ci + 1 }),
        ),
      ),
    );
    if (현재.실무확인?.length) out.push({ 키: 'foot', 이름: '실무 확인', 열: '전폭' });
    return out;
  }, [현재]);

  async function 실행(fn) {
    set바쁨(true);
    set로그('…');
    const r = await fn();
    set로그(r.log || (r.ok ? '완료' : '실패'));
    set바쁨(false);
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

        {모드 === '면' ? (
          <>
            <div className="lbl">면 {면.length}</div>
            <nav className="list">
              {면.map((p, n) => (
                <button
                  key={n}
                  className={'row' + (n === i ? ' on' : '')}
                  onClick={() => setI(n)}
                  onDoubleClick={() => set모드('블록')}
                >
                  <span className="no">{p.번호}</span>
                  <span className="tt">{p.제목}</span>
                </button>
              ))}
            </nav>
            <button className="drill" onClick={() => set모드('블록')} disabled={!현재}>
              블록 보기 →
            </button>
          </>
        ) : (
          <>
            <button className="back" onClick={() => set모드('면')}>← 면 목록</button>
            <div className="lbl">{현재?.번호} · 블록 {블록들.length}</div>
            <nav className="list">
              {블록들.map((b) => (
                <div key={b.키} className="row blk">
                  <span className="col">{b.열}</span>
                  <span className="tt">{b.이름}</span>
                </div>
              ))}
            </nav>
            <p className="note">블록 폼은 다음 단계.<br />지금은 JSON 을 직접 고친다.</p>
          </>
        )}

        <div className="foot">
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
              key={`${slug}-${i}`}
              src={`/api/preview?doc=${encodeURIComponent(slug)}&i=${i}`}
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
