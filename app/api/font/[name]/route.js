// assets/fonts 를 그대로 내보낸다. public/ 에 복사본을 두지 않는다 —
// 복사본이 생기면 어느 쪽이 진짜인지 흐려진다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../../lib/docs.js';

export async function GET(_req, { params }) {
  const { name } = await params;
  if (!/^[A-Za-z0-9._-]+\.woff2$/.test(name)) {
    return new Response('잘못된 이름', { status: 400 });
  }
  const p = path.join(ROOT, 'assets/fonts', name);
  if (!fs.existsSync(p)) {
    return new Response('폰트 없음 — bash scripts/fonts.sh', { status: 404 });
  }
  return new Response(fs.readFileSync(p), {
    headers: {
      'content-type': 'font/woff2',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
