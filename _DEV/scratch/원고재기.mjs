/* 시험 원고가 예산에 드는지 잰다 — 넘친 칸을 줄 단위로 낸다. 커밋하지 않는다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { render, 영역, _규격 } = await import(pathToFileURL(path.join(root, 'render/index.js')).href);
const doc = JSON.parse(fs.readFileSync(path.join(root, '_DEV/scratch/원고시험.json'), 'utf8'));
const pad = _규격.안여백기본, 블록 = 42;

const css =
  fs.readFileSync(path.join(root, 'rules/fonts.css'), 'utf8')
    .replaceAll('../assets/fonts/', pathToFileURL(path.join(root, 'assets/fonts/')).href) +
  '\n' + fs.readFileSync(path.join(root, 'rules/page.css'), 'utf8');
const tmp = path.join(root, 'out/html/_원고시험.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, render(doc, { css }), 'utf8');

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(tmp).href);
await p.addStyleTag({ content: '.sheet .page{transform:none!important}' });
await p.waitForTimeout(700);
const 잰것 = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('.sheet').forEach((sh, 면) => {
    sh.querySelectorAll('.bx').forEach((bx, i) => {
      const cs = getComputedStyle(bx);
      const 안 = bx.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      let 아래 = 0;
      [...bx.children].forEach((el) => {
        if (el.classList.contains('emp') || el.classList.contains('plus')) return;
        const r = el.getBoundingClientRect();
        아래 = Math.max(아래, r.bottom - bx.getBoundingClientRect().top - parseFloat(cs.paddingTop));
      });
      out.push({ 면: 면 + 1, 박스: i, 안높이: Math.round(안), 쓴높이: Math.round(아래) });
    });
  });
  return out;
});
await b.close();

console.log('쪽  레이아웃  박스  예산 줄  쓴 줄  남은 줄   판정');
let 넘친것 = 0, 빠듯 = 0;
doc.페이지.forEach((pg, n) => {
  const r = 영역({ ...pg, 박스: [] });
  pg.박스.forEach((_, i) => {
    const m = 잰것.find((x) => x.면 === n + 1 && x.박스 === i);
    const 예산 = Math.floor((r[i].h - pad * 2) / 블록);
    const 쓴 = Math.ceil(m.쓴높이 / 블록);
    const 남 = 예산 - 쓴;
    if (남 < 0) 넘친것++; else if (남 <= 1) 빠듯++;
    console.log(
      `${String(pg.번호).padEnd(4)}${String(pg.레이아웃).padEnd(9)}${String(i + 1).padStart(3)}` +
      `${String(예산).padStart(8)}${String(쓴).padStart(7)}${String(남).padStart(8)}   ` +
      (남 < 0 ? `넘쳤다 · ${-남}줄 줄인다` : 남 <= 1 ? '빠듯' : ''));
  });
});
const 칸 = 잰것.length;
console.log(`\n칸 ${칸}개 · 넘침 ${넘친것} · 빠듯(0~1줄) ${빠듯} · 여유 ${칸 - 넘친것 - 빠듯}`);
fs.writeFileSync(path.join(root, '_DEV/scratch/실측.json'),
  JSON.stringify(잰것.map((x) => ({ ...x, 쓴줄: Math.ceil(x.쓴높이 / 블록) })), null, 1), 'utf8');
