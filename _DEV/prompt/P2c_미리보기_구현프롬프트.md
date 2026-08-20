# P2-c 구현 프롬프트 — 미리보기를 메모리 기준으로

작성 2026-08-19 · 대상 `/Volumes/BridgeNine/NINE_DEV/PROJECT/NINE_press`
선행 **P2-b 완료** · 커밋 `2f275bd`

---

## §0 역할

**끌어 놓으면 폭이 원위치로 돌아가는 결함을 닫는다.**

원인은 끌기가 아니다. `바꾸기(…, { 그리기: true })` 가 `판본키` 를 올려 iframe 을 다시 로드하는데, `/api/preview` 가 **디스크의 JSON** 을 읽는다. 저장하지 않은 변경은 화면에서 사라진다.

```
지금   화면 조작 → 메모리 doc 갱신 → iframe 재로드 → 서버가 디스크를 읽음 → 옛 값
후     화면 조작 → 메모리 doc 갱신 → iframe srcdoc 재계산 → 메모리 값
```

**제자리 편집만 티가 안 났다.** 그쪽은 `그리기` 를 안 켜서 DOM 이 그대로 남기 때문이다. 구조 편집 · 되돌리기도 같은 결함을 안고 있었다.

**이 프롬프트의 범위 밖을 건드리지 않는다.** 격자 토글(P2-d)에 미리 손대지 않는다.

---

## §1 작업 범위

### 1-1. `app/api/css/[name]/route.js` 신설

`srcdoc` 에 CSS 를 통째로 박으면 다시 그릴 때마다 43KB 를 파싱한다. **`<link>` 로 걸어 브라우저 캐시를 태운다.**

```js
// 판면 규칙을 미리보기 iframe 에 넘긴다. srcdoc 이 <link> 로 건다.
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { name } = await params;
  if (name !== 'fonts.css' && name !== 'page.css') {
    return new Response('없음', { status: 404 });
  }
  let css = fs.readFileSync(path.join(process.cwd(), 'rules', name), 'utf8');
  if (name === 'fonts.css') {
    // 폰트는 /api/font 로 돌린다 — 정적 중복을 만들지 않는다
    css = css.replaceAll("url('../assets/fonts/", "url('/api/font/");
  }
  return new Response(css, {
    headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' },
  });
}
```

**`no-store` 를 지킨다.** 규칙을 고치며 새로고침하는 작업이 막힌다.

### 1-2. `app/ui/Shell.jsx` — `src` 를 `srcdoc` 으로

**① `render` 를 들여온다**

```js
import { render } from '../../render/index.js';
```

렌더러는 순수 함수라 클라이언트에서 그대로 돈다. **`app/lib/docs.js` 를 들여오지 않는다** — `node:fs` 가 들어 있어 클라이언트 번들이 깨진다.

**② 판본 HTML 을 `판본키` 에만 묶는다**

```js
// 판본키가 오를 때만 다시 만든다.
// doc 에 직접 묶으면 글자 한 자 고칠 때마다 iframe 이 새로 로드되어
// 제자리 편집의 커서가 날아간다.
const 판본 = useMemo(() => {
  const d = 문서ref.current;
  if (!d?.면?.[i]) return '';
  return render({ ...d, 면: [d.면[i]] }, { cssBase: '/api/css', 도구: true }).replace(
    '</head>',
    `<style>
body{padding:0;margin:0;background:transparent;overflow:hidden}
.wrap{width:2340px;margin:0}
.sheet{width:2340px;height:1654px;margin:0;overflow:hidden}
.sheet .page{transform:none;box-shadow:none}
</style></head>`,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [판본키, i, slug]);
```

**`문서ref.current` 에서 읽는다.** `doc` 상태를 의존성에 넣으면 ①의 이유로 매번 다시 만든다.

**③ iframe 을 바꾼다**

```jsx
<iframe
  ref={틀}
  key={`${slug}-${i}-${판본키}`}
  srcDoc={판본}
  onLoad={재기}
  style={{ width: W, height: H, transform: `scale(${축척})`, transformOrigin: 'top left' }}
/>
```

`src` 를 지운다. `key` 는 그대로 둔다 — 새 문서에서 `d.body.dataset.집음` 가드가 확실히 풀린다.

**④ 면을 바꿀 때 `판본키` 를 올린다**

지금은 `i` 가 바뀌면 `src` 가 바뀌어 다시 로드됐다. `srcdoc` 으로 가면 `판본` 이 `i` 에도 묶여 있으므로 그대로 동작하지만, **`key` 에 `i` 가 있어 이미 재생성된다.** 추가 조치는 없다. 확인만 한다.

### 1-3. `app/api/preview/route.js` 삭제

쓰는 곳이 없어진다. `app/lib/docs.js` 의 `previewCss` · `onePage` 도 부르는 데가 없어지면 함께 지운다. **`loadDoc` · `saveDoc` · `docMtime` · `docPath` · `listDocs` 는 남긴다** — `app/api/doc/route.js` 와 `app/page.jsx` 가 쓴다.

지우기 전에 확인한다.

```
grep -rn "api/preview\|previewCss\|onePage" app/ scripts/ render/
```

---

## §2 금지 사항

| | |
|---|---|
| ① | **`render/index.js` 를 건드리지 않는다.** 순수 함수인 채로 두는 것이 이 전환의 전제다 |
| ② | **`rules/page.css` 를 건드리지 않는다** |
| ③ | **`content/**` 를 건드리지 않는다** |
| ④ | **격자 토글을 만들지 않는다.** P2-d 다 |
| ⑤ | 끌기 · 칩 · 열넣기 · 열빼기 로직을 건드리지 않는다. 이번 결함은 그쪽이 아니다 |
| ⑥ | `next build` 를 돌리지 않는다 |
| ⑦ | `git` 명령을 직접 쓰지 않는다. **`sh scripts/save.sh "메시지" <경로들>`** 만 쓴다 |

---

## §3 착수 전 확정 사항

| | 확정값 |
|---|---|
| Q1 · 어느 방법인가 | **`srcdoc` · 브라우저에서 렌더.** 서버 왕복 0 · 되돌리기도 즉시 반영 |
| Q2 · CSS 를 어떻게 넘기는가 | **`<link>` + `/api/css/[name]`.** srcdoc 에 박지 않는다 |
| Q3 · 편집할 때마다 저장하는가 | **아니다.** 저장은 `⌘S` 그대로 |
| Q4 · `판본` 의 의존성 | **`[판본키, i, slug]` 만.** `doc` 을 넣지 않는다 |
| Q5 · `/api/preview` | **지운다.** 쓰는 곳이 없어진다 |
| Q6 · 산출 빌드 경로 | **그대로.** `scripts/build.js` 는 이 전환과 무관하다 |

---

## §4 커밋

```
sh scripts/save.sh "P2-c · 미리보기를 메모리 기준 srcdoc 으로" app/ui/Shell.jsx app/api
```

---

## §5 관문 — 통과 못 하면 보고하고 멈춘다

### 5-1. 왕복

```
node scripts/roundtrip.mjs content/sokcho/실행계획서.json
node scripts/roundtrip.mjs content/sokcho/사업장운영시뮬레이션.json
```

**`검사 1040개 · 불일치 0개` · `검사 600개 · 불일치 0개`.** 렌더러를 안 건드리므로 값이 그대로여야 한다.

### 5-2. 산출 빌드가 멀쩡한가

```
node scripts/build.js content/sokcho/실행계획서.json --link
node scripts/build.js content/sokcho/사업장운영시뮬레이션.json --link
node scripts/build.js content/_check/폭조절.json --link
```

**셋 다 면 수와 크기가 찍혀야 한다.** 23면 · 8면 · 3면.

### 5-3. 남은 참조

```
grep -rn "api/preview\|previewCss\|onePage" app/ scripts/ render/
```

**한 줄도 안 나와야 한다.**

### 5-4. 눈 검사는 사용자가 한다

dev 서버에 붙지 않는다.

---

## §6 핸드오프 예상 출력

| | |
|---|---|
| ① | 변경 · 신설 · 삭제 파일 목록 |
| ② | `git show --stat` |
| ③ | `roundtrip` 두 문서의 마지막 줄 |
| ④ | `build.js` 세 문서의 출력 줄 |
| ⑤ | §5-3 grep 결과 |
| ⑥ | `docs.js` 에서 지운 함수 이름 |
| ⑦ | 예상과 다른 것이 있으면 **고치지 말고 보고한다** |

---

## §7 다음 블록 예고

**P2-d · 격자 토글** — 본문 영역에 12칸 세로 띠를 깔고 켜고 끈다. 왼쪽 판 버튼과 단축키.
**이번 턴에 미리 손대지 않는다.**
