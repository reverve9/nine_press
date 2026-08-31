/* 원고만 보고 줄 수를 미리 세어 보고 · 브라우저 실측과 맞대 본다.
   맞으면 T3 이 「예산 N줄 · 실제 M줄」을 브라우저 없이 낼 수 있다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { 영역, _규격 } = await import(pathToFileURL(path.join(root, 'render/index.js')).href);
const doc = JSON.parse(fs.readFileSync(path.join(root, '_DEV/scratch/원고시험.json'), 'utf8'));
const 예산 = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pad = _규격.안여백기본, 블록 = 42;
const 한줄 = new Map(예산.칸.map((c) => [c.안폭, c.한줄]));

/* 요소 하나가 먹는 줄 — 렌더러 확정높이() 와 간격정하기() 를 원고 어휘로 옮긴 것 */
const 글자 = (s) => String(s).replace(/\*\*/g, '').length;
const 요소줄 = (e, w) => {
  if (e.제목 != null || e.출처 != null) return 1;
  if (e.목록) return e.목록.length;
  if (e.번호목록) return e.번호목록.length;
  if (e.표) return e.표.행.length + (e.표.헤더 ? 1 : 0);
  if (e.비움) return e.비움[0];
  if (e.문단 != null) return Math.ceil(글자(e.문단) / 한줄.get(w));
  return 0;
};

console.log('쪽  박스  안폭   예산   센 줄  실측  차   요소');
const 실측 = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let 틀린것 = 0, 칸수 = 0;
doc.페이지.forEach((pg, n) => {
  const r = 영역({ ...pg, 박스: [] });
  pg.박스.forEach((b, i) => {
    const w = r[i].w - pad * 2;
    const 총 = Math.floor((r[i].h - pad * 2) / 블록);
    const 몸 = b.내용.reduce((a, e) => a + 요소줄(e, w), 0);
    const 간격 = b.내용.length - 1 - b.내용.filter((e) => e.출처 != null).length;
    const 센것 = 몸 + Math.max(0, 간격);
    const m = 실측.find((x) => x.면 === n + 1 && x.박스 === i);
    const 차 = 센것 - m.쓴줄;
    칸수++; if (차 !== 0) 틀린것++;
    console.log(
      `${String(pg.번호).padEnd(4)}${String(i + 1).padStart(3)}${String(w).padStart(7)}` +
      `${String(총).padStart(6)}${String(센것).padStart(7)}${String(m.쓴줄).padStart(6)}` +
      `${(차 > 0 ? '+' : '') + 차}`.padStart(5) +
      `   ${b.내용.map((e) => Object.keys(e)[0]).join('+')}`);
  });
});
console.log(`\n칸 ${칸수}개 · 센 줄이 실측과 어긋난 칸 ${틀린것}개`);
