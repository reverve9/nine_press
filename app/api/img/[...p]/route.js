// assets/ 아래 그림을 그대로 내보낸다. public/ 에 복사본을 두지 않는다 —
// 복사본이 생기면 어느 쪽이 진짜인지 흐려진다. /api/font 와 같은 방식이다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../../lib/docs.js';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(_req, { params }) {
  const { p } = await params;
  const rel = (p ?? []).map(decodeURIComponent).join('/');
  // 상위로 빠져나가는 경로를 막는다
  const base = path.join(ROOT, 'assets');
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) {
    return new Response('잘못된 경로', { status: 400 });
  }
  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext]) return new Response('허용하지 않는 형식', { status: 400 });
  if (!fs.existsSync(file)) return new Response('그림 없음', { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: { 'content-type': MIME[ext], 'cache-control': 'no-store' },
  });
}
