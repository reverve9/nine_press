/* 규격서대로만 읽는 임시 파서 — T3 의 과녁을 재는 자다. 커밋하지 않는다.
   _DEV/원고규격서.md §2 에 적힌 것 외에는 아무것도 안 받는다.
   규격에 없는 줄을 만나면 그 자리를 대고 멈춘다 — 그게 이 시험의 요점이다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const 자리크기 = { 그림: 6, 단계띠: 3, 지도: 8 };
const src = process.argv[2];
const 글 = fs.readFileSync(path.join(root, src), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');            // 주석 블록은 원고가 아니다

const 오류 = [];
const 페이지 = [];
let P = null, B = null, 문단줄 = [], 표줄 = [];

const 쪽 = () => P?.번호 ?? '?';
const 박스번호 = () => (P?.박스.length ?? 0);
const 탈 = (n, m) => 오류.push(`${쪽()}쪽${n != null ? ` · 박스 ${n}` : ''} · ${m}`);

const 문단닫기 = () => {
  if (!문단줄.length) return;
  const t = 문단줄.join('\n').trim();
  문단줄 = [];
  if (!t) return;
  if (!B) return 탈(null, `박스 밖에 글이 있다 · "${t.slice(0, 24)}…"`);
  B.내용.push({ 문단: t });
};
const 표닫기 = () => {
  if (!표줄.length) return;
  const 줄 = 표줄; 표줄 = [];
  const 칸 = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const 몸 = 줄.filter((l) => !/^\|[\s:-]+\|$/.test(l.replace(/-+/g, '-')));
  const 구분 = 줄.findIndex((l) => /^\|[\s|:-]+\|$/.test(l));
  if (구분 < 0) return 탈(박스번호(), '표에 헤더 가름 줄(| --- |)이 없다');
  const 헤더 = 칸(줄[0]);
  const 행 = 줄.slice(구분 + 1).map(칸);
  if (!행.length) return 탈(박스번호(), '표에 행이 없다');
  B.내용.push({ 표: { 헤더, 행 } });
  void 몸;
};
const 닫기 = () => { 문단닫기(); 표닫기(); };

for (const [n, raw] of 글.split('\n').entries()) {
  const l = raw.trimEnd();
  const 줄번 = n + 1;

  if (/^#\s/.test(l)) {                                   // 페이지
    닫기();
    const [번호, ...제] = l.replace(/^#\s+/, '').split('·').map((x) => x.trim());
    P = { 번호, 제목: 제.join(' · '), 박스: [] };
    페이지.push(P); B = null;
    continue;
  }
  if (/^##\s+박스\s*$/.test(l)) { 닫기(); B = { 내용: [] }; P?.박스.push(B); continue; }
  if (/^###\s/.test(l)) {
    닫기();
    if (!B) { 탈(null, `${줄번}줄 · 박스 밖에 제목이 있다`); continue; }
    B.내용.push({ 제목: l.replace(/^###\s+/, '').trim() }); continue;
  }
  if (/^##\s/.test(l)) { 탈(null, `${줄번}줄 · 「## 박스」 말고 다른 ## 을 썼다 · "${l}"`); continue; }

  const 열쇠 = l.match(/^(모드|레이아웃|요지|카피 메인|카피 서브)\s*:\s*(.*)$/);
  if (열쇠 && !B) {
    닫기();
    const [, k, v] = 열쇠;
    if (!P) { 탈(null, `${줄번}줄 · 페이지 밖에 열쇠 줄이 있다`); continue; }
    if (k === '카피 메인' || k === '카피 서브') {
      P.카피 = P.카피 ?? {}; P.카피[k.split(' ')[1]] = v;
    } else P[k] = v;
    continue;
  }

  if (!l.trim()) { 문단닫기(); 표닫기(); continue; }

  if (/^\|/.test(l)) { 문단닫기(); 표줄.push(l); continue; }
  표닫기();

  const 자리 = l.match(/^\[(그림|비움)\s*:\s*(.+)\]\s*$/);
  if (자리) {
    문단닫기();
    if (!B) { 탈(null, `${줄번}줄 · 박스 밖에 자리 표기가 있다`); continue; }
    const [, 갈래, 속] = 자리;
    const 무엇 = 갈래 === '그림' ? `그림 · ${속.trim()}` : 속.trim();
    const n2 = 갈래 === '그림' ? 자리크기.그림 : (자리크기[속.trim()] ?? null);
    if (n2 == null) { 탈(박스번호(), `[비움: ${속.trim()}] 의 기본 블록 수를 모른다 · 규격서 §2-4 에 없다`); continue; }
    B.내용.push({ 비움: [n2, 무엇] }); continue;
  }
  if (/^>\s/.test(l)) {
    문단닫기();
    if (!B) { 탈(null, `${줄번}줄 · 박스 밖에 출처가 있다`); continue; }
    B.내용.push({ 출처: l.replace(/^>\s+/, '').trim() }); continue;
  }
  if (/^[-*]\s/.test(l) || /^\d+\.\s/.test(l)) {
    문단닫기();
    if (!B) { 탈(null, `${줄번}줄 · 박스 밖에 목록이 있다`); continue; }
    const 번호꼴 = /^\d+\.\s/.test(l);
    const 열 = 번호꼴 ? '번호목록' : '목록';
    const 항 = l.replace(/^([-*]|\d+\.)\s+/, '').trim();
    const 끝 = B.내용.at(-1);
    if (끝 && 끝[열]) 끝[열].push(항); else B.내용.push({ [열]: [항] });
    continue;
  }
  문단줄.push(l);
}
닫기();

const doc = { 문서명: path.basename(src, '.md').replace(/^원고_/, ''), 페이지 };
fs.writeFileSync(path.join(root, '_DEV/scratch/원고시험.json'), JSON.stringify(doc, null, 2), 'utf8');

/* 렌더러 계약에 넣어 본다 — 계약 검증은 render() 를 부르고 catch 하는 것이다 */
const { render, _규격, 영역 } = await import(pathToFileURL(path.join(root, 'render/index.js')).href);
console.log(`${src}\n페이지 ${페이지.length} · 요소 ${페이지.flatMap((p) => p.박스.flatMap((b) => b.내용)).length}\n`);
console.log('쪽  레이아웃  칸 필요  박스  요소 갈래');
for (const p of 페이지) {
  let 필요 = '?';
  try { 필요 = 영역({ ...p, 박스: [] }).length; } catch { 필요 = '레이아웃을 모른다'; }
  const 갈래 = p.박스.map((b) => b.내용.map((e) => Object.keys(e)[0]).join('+')).join(' | ');
  const 맞나 = 필요 === p.박스.length ? '' : '   ← 칸 수가 안 맞는다';
  if (필요 !== p.박스.length) 오류.push(`${p.번호}쪽 · 레이아웃 ${p.레이아웃} 은 칸이 ${필요}개인데 박스가 ${p.박스.length}개다`);
  console.log(`${String(p.번호).padEnd(4)}${String(p.레이아웃).padEnd(9)}${String(필요).padStart(4)}${String(p.박스.length).padStart(6)}   ${갈래}${맞나}`);
}
try { render(doc, { css: '' }); console.log('\nrender() 통과 · 렌더러 계약 이상 없다'); }
catch (e) { 오류.push(`렌더러 · ${e.message}`); }

console.log(오류.length ? `\n걸린 것 ${오류.length}건\n  ${오류.join('\n  ')}` : '\n문법 · 계약 모두 통과');
void _규격;
