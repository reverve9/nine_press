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

export async function GET() {
  const base = path.join(ROOT, 'assets');
  const out = [];
  if (fs.existsSync(base)) 훑기(base, '', out);
  return Response.json({ 그림: out });
}
