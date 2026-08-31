// assets/ 아래 그림 목록. 도크 [그림] 탭이 고를 것을 여기서 받는다.
// 개발 도구 전용이다 — 산출 HTML 은 build.js 가 경로를 직접 바꿔 문다.
//
// 돌려주는 경로는 **문안에 그대로 적히는 꼴**이다 · "assets/캡처/D1_구조도.svg".
// 렌더러의 그림경로() 가 받는 것과 같아야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../lib/docs.js';

const 확장 = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']);
const 건너뛸 = new Set(['fonts']);   // 글꼴은 그림이 아니다

function 훑기(dir, 상대, out) {
  for (const f of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, 'ko'))) {
    if (f.startsWith('.')) continue;
    const p = path.join(dir, f);
    const rel = 상대 ? `${상대}/${f}` : f;
    if (fs.statSync(p).isDirectory()) {
      if (건너뛸.has(f)) continue;
      훑기(p, rel, out);
      continue;
    }
    if (!확장.has(path.extname(f).toLowerCase())) continue;
    out.push({ 경로: `assets/${rel}`, 이름: f, 크기: fs.statSync(p).size });
  }
}

/* ── 올리기 · N-자유 d ────────────────────────────────────
   **지금까지는 `assets/` 에 손으로 먼저 넣어야 했다.** Finder 에서 판으로 바로 끌 수 있게
   쓰는 길을 낸다. 정한 것 다섯 · 여기가 유일한 쓰기 지점이다.

   ① 쓰는 자리는 `assets/올린것/` 하나다. 손으로 고른 `assets/캡처/` 와 안 섞는다 —
      어느 것이 도구가 받아 온 것인지 나중에 가려야 한다
   ② **덮어쓰지 않는다.** 이름이 겹치면 뒤에 -2 · -3 을 붙인다.
      덮으면 그 파일을 물고 있던 다른 면이 소리 없이 바뀐다
   ③ 이름을 다듬는다 · **공백 · 따옴표를 못 쓴다** — 렌더러의 그림경로() 가 막는 문자다.
      macOS 가 NFD 로 주는 자모를 NFC 로 모은다(v8 §9 ② 의 그 함정이다)
   ④ 8MB 까지. `build.js` 가 자기완결 HTML 에 base64 로 심으므로 파일 하나가 판 전체를 불린다
   ⑤ 확장자는 GET 과 같은 목록이다

   **`assets/` 는 git 에 들어간다.** 끌어다 놓을 때마다 레포가 커진다 · HANDOFF §7. */

const 상한 = 8 * 1024 * 1024;
const 올린곳 = '올린것';

function 이름다듬기(원래) {
  const base = path.basename(원래).normalize('NFC');
  const ext = path.extname(base).toLowerCase();
  const 몸 = base.slice(0, base.length - ext.length)
    .replace(/[\s"'<>\\/]+/g, '_')     // 렌더러가 막는 문자 · 경로 구분자
    .replace(/^[._]+/, '')              // 숨김 파일 · 앞 밑줄
    .replace(/_{2,}/g, '_')
    .slice(0, 60);
  return { 몸: 몸 || '그림', ext };
}

export async function POST(req) {
  let form;
  try { form = await req.formData(); } catch { return Response.json({ 사유: '폼을 못 읽는다' }, { status: 400 }); }
  const f = form.get('파일');
  if (!f || typeof f.arrayBuffer !== 'function') {
    return Response.json({ 사유: '파일이 없다' }, { status: 400 });
  }
  const { 몸, ext } = 이름다듬기(f.name ?? '그림');
  if (!확장.has(ext)) {
    return Response.json({ 사유: `${ext || '확장자 없음'} 은 못 받는다 · ${[...확장].join(' ')} 만 된다` }, { status: 400 });
  }
  if (f.size > 상한) {
    return Response.json({ 사유: `${(f.size / 1024 / 1024).toFixed(1)}MB · 8MB 까지만 받는다` }, { status: 400 });
  }
  const dir = path.join(ROOT, 'assets', 올린곳);
  fs.mkdirSync(dir, { recursive: true });
  // 겹치면 뒤에 번호를 붙인다 · 덮지 않는다
  let 이름 = `${몸}${ext}`;
  for (let n = 2; fs.existsSync(path.join(dir, 이름)); n++) 이름 = `${몸}-${n}${ext}`;
  fs.writeFileSync(path.join(dir, 이름), Buffer.from(await f.arrayBuffer()));
  return Response.json({ 경로: `assets/${올린곳}/${이름}`, 이름 });
}

export async function GET() {
  const base = path.join(ROOT, 'assets');
  const out = [];
  if (fs.existsSync(base)) 훑기(base, '', out);
  return Response.json({ 그림: out });
}
