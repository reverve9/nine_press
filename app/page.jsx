import Shell from './ui/Shell.jsx';
import { listDocs, loadDoc, firstDoc } from './lib/docs.js';

export const dynamic = 'force-dynamic';

export default function Page() {
  const docs = listDocs();
  const 첫 = firstDoc(docs);
  const first = 첫 ? { slug: 첫.slug, doc: loadDoc(첫.slug) } : null;

  if (!docs.length) {
    return (
      <div style={{ padding: 48, font: '15px/1.8 ui-sans-serif' }}>
        <b>content/ 가 비어 있습니다.</b>
        <p>content/&lt;사업&gt;/&lt;문서&gt;.json 을 두면 여기 나타납니다.</p>
      </div>
    );
  }
  return <Shell docs={docs} first={first} />;
}
