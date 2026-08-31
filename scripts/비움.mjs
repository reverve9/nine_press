// 비워 둔 자리의 좌표표 — 키노트 · 파워포인트에서 채울 때 쓴다
//
//   node scripts/비움.mjs <문안.json>
//   node scripts/비움.mjs <문안.json> --전체    비운 자리만이 아니라 자리 전부
//
// 판이 2339 × 1654 로 키노트 슬라이드와 **같은 좌표계**다.
// 여기 나오는 x · y · 폭 · 높이를 키노트 도형의 위치·크기에 그대로 넣으면 자리가 맞는다.
// (키노트 슬라이드 크기를 2339 × 1654 사용자 설정으로 두는 것이 전제다)
//
// 설계 근거는 _DEV/00_설계_나인프레스_v2.md §5-11.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 영역 } from '../render/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const 전체 = argv.includes('--전체');
const src = argv.find((a) => !a.startsWith('--'));

if (!src) {
  console.error('문안을 준다 · node scripts/비움.mjs content/_check/비움.json [--전체]');
  process.exit(2);
}

const doc = JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'));
const 줄 = [];
let 비운수 = 0;
let 자리수 = 0;

for (const p of doc.면 ?? []) {
  let rects;
  try {
    rects = 영역(p);
  } catch (e) {
    줄.push(`  면 ${p.번호 ?? '?'}  ✗ ${e.message}`);
    continue;
  }
  (p.자리 ?? []).forEach((자리, i) => {
    자리수++;
    const 빔 = !!자리?.비움;
    if (빔) 비운수++;
    if (!빔 && !전체) return;
    const r = rects[i];
    if (!r) return;
    const 메모 = typeof 자리?.비움 === 'string' ? 자리.비움 : (자리?.이름 ?? '');
    줄.push(
      `  면 ${String(p.번호 ?? '?').padStart(2)} · 자리 ${i}   ` +
      `x ${String(r.x).padStart(4)}  y ${String(r.y).padStart(4)}   ` +
      `${String(r.w).padStart(4)} × ${String(r.h).padStart(4)}` +
      (빔 ? '  ▪' : '   ') + (메모 ? ` ${메모}` : ''));
  });

  /* 요소 비움 — **자리를 반만 넘긴 것** · N-자유 c.
     자리 안쪽 원점에서 앞 요소들의 확정 높이와 간격을 더해 y 를 잡는다.
     앞에 문단 · 목록이 하나라도 있으면 줄 수를 미리 못 세므로 **y 를 안 적는다** —
     어림한 좌표를 주면 키노트에서 그대로 어긋난다. 그때는 자리 좌표만 적어 준다. */
  (p.자리 ?? []).forEach((자리, i) => {
    if (!Array.isArray(자리?.내용)) return;
    const r = rects[i];
    if (!r) return;
    const pad = 자리.여백 ?? doc.여백 ?? 33;
    let 요소들;
    try { 요소들 = 내용재기(자리, doc); } catch { return; }
    요소들.forEach(({ 열쇠, 값, y, h, 무엇 }) => {
      if (열쇠 !== '비움') return;
      비운수++;
      const 절대 = y == null ? null : r.y + pad + y;
      줄.push(
        `  면 ${String(p.번호 ?? '?').padStart(2)} · 자리 ${i} 안   ` +
        `x ${String(r.x + pad).padStart(4)}  ` +
        (절대 == null ? 'y    ?' : `y ${String(절대).padStart(4)}`) + `   ` +
        `${String(r.w - pad * 2).padStart(4)} × ${String(h).padStart(4)}  ▪` +
        (무엇 ? ` ${무엇}` : '') +
        (절대 == null ? '   (앞에 문단 · 목록이 있어 y 를 못 잰다)' : ''));
    });
  });
}

/* 자리 안 요소를 순서대로 재서 { 열쇠, y, h } 를 낸다.
   렌더러의 확정높이() · 간격정하기() 와 **같은 규칙이어야 한다.**
   불확정(문단 · 목록 · 번호목록)을 만나면 그 뒤부터 y 는 null 이다. */
function 내용재기(자리, doc) {
  const 머리 = new Set(['제목', '요약']);
  const 갈래 = (el) => ['제목', '요약', '문단', '목록', '번호목록', '표', '수치', '그림', '출처', '여백', '비움']
    .find((k) => el?.[k] != null);
  const 확정 = (el, k) => {
    if (k === '제목' || k === '요약' || k === '출처') return 42;
    if (k === '여백') return el.여백 * 42;
    if (k === '비움') return (Array.isArray(el.비움) ? el.비움[0] : el.비움) * 42;
    if (k === '수치') return Array.isArray(el.수치)
      ? 84 + (el.수치.some((c) => Array.isArray(c) && String(c[2] ?? '').trim()) ? 42 : 0) : null;
    if (k === '표') {
      const t = el.표;
      if (t?.높이 || !Array.isArray(t?.행)) return null;
      return 42 * (t.행.length + (t.머리 ? 1 : 0));
    }
    if (k === '그림') {
      const g = typeof el.그림 === 'string' ? {} : (el.그림 ?? {});
      return Number.isInteger(g.높이) ? g.높이 * 42 : null;
    }
    return null;
  };
  const out = [];
  let y = 0;
  자리.내용.forEach((el, j) => {
    const k = 갈래(el);
    const 앞 = j === 0 ? null : 갈래(자리.내용[j - 1]);
    let 간격 = 42;
    if (j === 0 || k === '여백' || 앞 === '여백' || k === '출처') 간격 = 0;
    else if (앞 === '제목' && k === '요약') 간격 = 0;
    const h = 확정(el, k);
    if (y != null) y += 간격;
    out.push({
      열쇠: k, 값: el[k], y, h,
      무엇: k === '비움' && Array.isArray(el.비움) ? (el.비움[1] ?? '') : '',
    });
    if (y != null) { if (h == null) y = null; else y += h; }
  });
  return out;
}

console.log(`${src} · ${doc.문서명 ?? ''}`);
console.log(`판 2339 × 1654 · 키노트 슬라이드와 같은 좌표계\n`);
console.log(줄.length ? 줄.join('\n') : '  비운 자리가 없다');
console.log(`\n자리 ${자리수}개 중 비움 ${비운수}개`);
