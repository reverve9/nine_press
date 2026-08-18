// 사이드패널이 문서를 갈아탈 때 부른다
import { loadDoc } from '../../lib/docs.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get('doc');
  if (!slug) return Response.json({ error: 'doc 없음' }, { status: 400 });
  try {
    return Response.json(loadDoc(slug));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 404 });
  }
}
