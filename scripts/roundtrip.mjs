// 제자리 편집 왕복 검사 — 문안 → 렌더 → DOM → 원문 복원 → 문안 대조
//
//   node scripts/roundtrip.mjs <문안.json>
//   node scripts/roundtrip.mjs <문안.json> --v3   봉인한 12칸 트랙 렌더러
//
// 판면 규칙이나 inline 표기를 고칠 때마다 돌린다.
// 하나라도 어긋나면 판면에서 그 박스에 고쳤을 때 문안이 깨진다는 뜻이다.
// (playwright 브라우저가 깔려 있어야 한다: npx playwright install chromium)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const v3 = argv.includes('--v3');      // 봉인본 · render/_v3/봉인.md
const src = argv.find((a) => !a.startsWith('--')) ?? 'content/sokcho/실행계획서.json';

const { render } = await import(v3 ? '../render/_v3/index.js' : '../render/index.js');
/* 되읽기는 `render/inline.js` 가 정본이다 · inline() 의 역함수라 거기 산다.
   여기서 사본을 들고 있다가 실제로 갈라졌다 — 구간 표기를 inline() 에만 넣었더니
   이 검사가 17건 틀렸다 · N-글자 d. 브라우저 안으로는 못 가져가니 소스로 넣는다.
   **봉인본(--v3)도 같은 것을 쓴다** — 구간 표기는 v3 이 안 내므로 그 가지가 안 열린다. */
const { 원문 } = await import('../render/inline.js');
const doc = JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'));

const css =
  fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8')
    .replaceAll('../assets/fonts/', pathToFileURL(path.join(root, 'assets/fonts/')).href) +
  '\n' + fs.readFileSync(path.join(root, v3 ? 'rules/_v3/page.css' : 'rules/page.css'), 'utf8');

const tmp = path.join(root, 'out/html/_roundtrip.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, render(doc, { css, 도구: true }), 'utf8');

const 읽기 = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
/* 봉인본(--v3)은 옛 말을 쓴다 · 「면」이다. 새 렌더러만 「페이지」다 · N-자유 e.
   봉인본은 영구 보존이라 문안도 렌더러도 안 고친다 — 여기서만 갈라 읽는다 */
const 페이지들 = doc.페이지 ?? doc.면 ?? [];

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });

const 결과 = await p.evaluate((소스) => {
  // 이름 붙은 함수 식이라 제 이름으로 재귀한다
  const 원문 = eval(`(${소스})`);
  const out = [];
  document.querySelectorAll('.sheet').forEach((sh, pi) => {
    sh.querySelectorAll('[data-p]').forEach((el) =>
      out.push({ pi, path: JSON.parse(el.getAttribute('data-p')), got: 원문(el) }));
  });
  return out;
}, 원문.toString());
await b.close();
fs.rmSync(tmp, { force: true });

let 틀림 = 0;
for (const r of 결과) {
  const want = 읽기(페이지들[r.pi], r.path);
  if (want === r.got) continue;
  틀림++;
  if (틀림 <= 12) {
    console.log(`✗ 페이지${페이지들[r.pi].번호} ${JSON.stringify(r.path)}`);
    console.log(`   원본: ${JSON.stringify(want)}`);
    console.log(`   복원: ${JSON.stringify(r.got)}`);
  }
}
console.log(`\n검사 ${결과.length}개 · 불일치 ${틀림}개`);
process.exit(틀림 ? 1 : 0);
