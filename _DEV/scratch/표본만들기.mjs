/* 표본.txt 를 만든다 — 결정적이어야 한다 · T0 보정 v1 ①
     1  실행계획서 → 홍보전략브리프 순서로 문단 본문만 모은다
     2  표기를 벗긴다   ** 쌍 제거 · {…} 토큰 통째 제거 · 줄바꿈 → 공백
     3  공백 하나로 이어 붙이고 · 앞에서 정확히 1056자 자른다            */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const 차례 = ['content/sokcho/실행계획서.json', 'content/gangneung/홍보전략브리프.json'];

const 문단들 = (f) => {
  const d = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const out = [];
  for (const p of d.면 ?? [])
    for (const 행 of p.행 ?? [])
      for (const 열 of 행.열 ?? [])
        for (const b of 열.블록 ?? [])
          for (const el of b.내용 ?? [])
            if (el?.문단 != null) (Array.isArray(el.문단) ? el.문단 : [el.문단])
              .forEach((s) => { if (typeof s === 'string') out.push(s); });
  return out;
};

const 벗기기 = (s) => s
  .replace(/\{[^}]*\}/g, ' ')   // {→03} · {TBD} · {TBD협의}
  .replace(/\*\*/g, '')         // 굵게 표기
  .replace(/\s+/g, ' ')         // 줄바꿈 · 이중 공백
  .trim();

const 조각 = 차례.flatMap(문단들).map(벗기기).filter(Boolean);
const 전체 = 조각.join(' ');
const 표본 = 전체.slice(0, 1056);

fs.writeFileSync(path.join(root, 'content/_check/표본.txt'), 표본, 'utf8');
console.log(`문단 ${조각.length}개 · 벗긴 뒤 ${전체.length}자 → 표본 ${표본.length}자`);
console.log(`남은 토큰 ${(표본.match(/[{}]|\*\*/g) ?? []).length}개 · 줄바꿈 ${(표본.match(/\n/g) ?? []).length}개`);
console.log(`\n앞 100자\n  ${표본.slice(0, 100)}`);
console.log(`끝 60자\n  …${표본.slice(-60)}`);
