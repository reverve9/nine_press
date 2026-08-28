// content JSON → out/html   (자기완결 HTML. CSS 를 파일 안에 박는다)
//
//   node scripts/build.js content/sokcho/실행계획서.json
//   node scripts/build.js content/sokcho/실행계획서.json --embed   폰트까지 base64
//   node scripts/build.js content/sokcho/실행계획서.json --link    개발용 <link>
//   node scripts/build.js content/sokcho/실행계획서.json --v3      봉인한 12칸 트랙 렌더러
//
// 기본이 자기완결인 이유 — <link> 로 걸면 파일을 옮기는 순간 판면이 통째로 날아간다.
// 옮긴 사람은 그게 CSS 경로 문제인지 알 수 없다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const src = argv.find((a) => !a.startsWith('--')) ?? 'content/sokcho/실행계획서.json';
const embed = argv.includes('--embed');
const link = argv.includes('--link');
const v3 = argv.includes('--v3');      // 봉인본 · render/_v3/봉인.md

const { render } = await import(v3 ? '../render/_v3/index.js' : '../render/index.js');

const doc = JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'));
const outDir = path.join(root, 'out/html');
fs.mkdirSync(outDir, { recursive: true });
const name = path.basename(src, '.json');
const file = path.join(outDir, `${name}.html`);

let css;
if (!link) {
  let fonts = fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8');
  const page = fs.readFileSync(path.join(root, v3 ? 'rules/_v3/page.css' : 'rules/page.css'), 'utf8');

  if (embed) {
    // 규칙에서 실제로 쓰는 굵기만 넣는다. 14종을 다 넣으면 19MB 가 된다
    const used = new Set(['400', ...(page.match(/font-weight:\s*(\d{3})/g) ?? [])
      .map((m) => m.match(/\d{3}/)[0])]);
    fonts = fonts
      .split('\n')
      .filter((l) => {
        const w = l.match(/font-weight:(\d{3})/);
        return !w || used.has(w[1]);
      })
      .join('\n');
    // woff2 를 base64 로 박는다. 파일 하나로 어디서든 같은 판면이 나온다
    fonts = fonts.replace(/url\('\.\.\/assets\/fonts\/([^']+)'\)/g, (m, f) => {
      const p = path.join(root, 'assets/fonts', f);
      if (!fs.existsSync(p)) return m;
      return `url('data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}')`;
    });
  } else {
    // rules/ 기준 경로를 out/html/ 기준으로 옮긴다
    fonts = fonts.replaceAll("url('../assets/fonts/", "url('../../assets/fonts/");
  }
  css = fonts + '\n' + page;
}

let html = render(doc, { css });

// 그림 — 폰트와 같은 방식. link 는 상대경로, 아니면 base64 로 박는다
if (link) {
  html = html.replaceAll('src="assets/', 'src="../../assets/');
} else {
  html = html.replace(/src="(assets\/[^"]+)"/g, (m, rel) => {
    const q = path.join(root, rel);
    if (!fs.existsSync(q)) return m;
    const ext = path.extname(q).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return `src="data:${mime};base64,${fs.readFileSync(q).toString('base64')}"`;
  });
}

fs.writeFileSync(file, html, 'utf8');

const kb = (fs.statSync(file).size / 1024).toFixed(0);
const mode = link ? '<link> 개발용' : embed ? '자기완결 · 폰트 내장' : '자기완결 · 폰트 상대경로';
console.log(`${file}\n  ${doc.면.length}면 · ${kb}KB · ${mode}${v3 ? ' · 봉인본 v3' : ''}`);
