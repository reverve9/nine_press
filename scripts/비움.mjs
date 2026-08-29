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
}

console.log(`${src} · ${doc.문서명 ?? ''}`);
console.log(`판 2339 × 1654 · 키노트 슬라이드와 같은 좌표계\n`);
console.log(줄.length ? 줄.join('\n') : '  비운 자리가 없다');
console.log(`\n자리 ${자리수}개 중 비움 ${비운수}개`);
