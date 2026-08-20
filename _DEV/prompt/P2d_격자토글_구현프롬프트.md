# P2-d 구현 프롬프트 — 격자 토글 · 문서 교체 지연

작성 2026-08-19 · 대상 `/Volumes/BridgeNine/NINE_DEV/PROJECT/NINE_press`
선행 **P2-c 완료** · 커밋 `ea107bd`

---

## §0 역할

둘을 닫는다.

| | |
|---|---|
| ① | **12칸 격자를 켜고 끈다.** 눈으로 칸을 보면서 끌 수 있어야 한다 |
| ② | **문서를 바꿔 고를 때 판본이 한 박자 늦는 것** — P2-c 에서 보고된 ⓑ |

**이 프롬프트의 범위 밖을 건드리지 않는다.**

---

## §1 작업 범위

### 1-1. 문서 교체 지연 — 한 줄

`불러오기()` 의 `setDoc(r.doc);` **앞**에 넣는다.

```js
문서ref.current = r.doc;   // 판본 useMemo 가 이 렌더에서 바로 읽는다
```

**근거** — `판본` 은 `문서ref.current` 를 읽는데 그 ref 는 `useEffect` 로 갱신되어 렌더보다 늦다. `바꾸기()` 는 `setDoc` 보다 먼저 ref 를 쓰므로(175행) 편집·되돌리기·끌기는 맞았고, `불러오기()` 만 어긋났다. 보고한 진단 그대로다.

### 1-2. 격자 — `재기()` 가 주입하는 `<style>` 에 더한다

```css
.gridov{position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:40;display:none}
html.gridon .gridov{display:block}
.gridov i{position:absolute;top:0;bottom:0;
  background:rgba(200,0,120,.07);
  border-left:1px solid rgba(200,0,120,.24);
  border-right:1px solid rgba(200,0,120,.24)}
```

**색은 자홍이다.** 판면이 쓰는 남색 · 청록 · 주황과 겹치지 않아 판면 요소로 오인되지 않는다.
`pointer-events:none` 이라 아래 블록의 클릭과 제자리 편집을 가로채지 않는다.
`z-index:40` — 손잡이(`50`)보다 아래다.

### 1-3. 격자 심기 — 손잡이 심는 블록 바로 뒤

`.bd` 는 이미 `position:absolute` 라 기준이 된다. **`.bd` 하나에만 심는다.**

```js
// 12칸 격자 — 도구 전용. 판면에는 아무 영향이 없다
const bd = d.querySelector('.page .bd');
if (bd && !bd.querySelector('.gridov')) {
  const ov = d.createElement('div');
  ov.className = 'gridov';
  for (let k = 0; k < 12; k++) {
    const c = d.createElement('i');
    c.style.left  = (k * (92.73975 + 14.879) * uu) + 'px';
    c.style.width = (92.73975 * uu) + 'px';
    ov.appendChild(c);
  }
  bd.appendChild(ov);
}
```

`uu` 는 §P2 에서 이미 읽어 둔 값이다. **새로 읽지 않는다.**

**표지 면(`.cvp`)에는 `.bd` 가 없다.** `querySelector` 가 `null` 이면 그냥 넘어간다.

### 1-4. 토글 — 상태 · 버튼 · 단축키

**① 상태**

```js
const [격자, set격자] = useState(false);
const 격자ref = useRef(false);
useEffect(() => { 격자ref.current = 격자; }, [격자]);
```

**② iframe 에 반영** — `재기()` 안, 격자를 심은 직후

```js
d.documentElement.classList.toggle('gridon', 격자ref.current);
```

**iframe 이 다시 그려질 때마다 상태를 다시 입힌다.** `srcdoc` 이 갈리면 문서가 새로 만들어져 클래스가 날아간다.

**③ 켜고 끌 때도 반영** — `격자` 가 바뀌면 iframe 문서에 클래스를 준다

```js
useEffect(() => {
  const d = 틀.current?.contentDocument;
  if (d) d.documentElement.classList.toggle('gridon', 격자);
}, [격자]);
```

**④ 버튼** — 왼쪽 판의 `칸 수` 줄 **위**에 놓는다. 블록을 안 골랐을 때도 보여야 한다.

```jsx
<div className="ctlrow">
  <span className="ck">격자</span>
  <button className={'chip' + (격자 ? ' on' : '')} onClick={() => set격자((v) => !v)}>
    {격자 ? '켬' : '끔'}
  </button>
</div>
```

**⑤ 단축키 `⌘\`** — 두 곳에 붙인다.

```js
if (e.key === '\\') { e.preventDefault(); set격자((v) => !v); }
```

| 자리 | |
|---|---|
| 바깥 창 `keydown`(310행 부근) | `metaKey || ctrlKey` 블록 안 |
| iframe `keydown`(354행 부근) | 같은 블록 안. **제자리 편집 중에도 듣는다** — `\` 는 글자 입력과 겹치지 않는다 |

---

## §2 금지 사항

| | |
|---|---|
| ① | **`rules/page.css` 를 건드리지 않는다.** 격자 스타일은 `재기()` 주입 `<style>` 에만 |
| ② | **`render/index.js` 를 건드리지 않는다.** 격자는 산출 HTML 에 들어가면 안 된다 |
| ③ | **`content/**` 를 건드리지 않는다** |
| ④ | 끌기 · 칩 · 열넣기 · 열빼기 로직을 건드리지 않는다 |
| ⑤ | 가로 줄(행 경계)을 그리지 않는다. **세로 12칸만** |
| ⑥ | 격자 상태를 파일이나 브라우저 저장소에 남기지 않는다. 화면을 새로 열면 꺼진 상태다 |
| ⑦ | `next build` 를 돌리지 않는다 |
| ⑧ | `git` 명령을 직접 쓰지 않는다. **`sh scripts/save.sh "메시지" <경로들>`** 만 쓴다 |

---

## §3 착수 전 확정 사항

| | 확정값 |
|---|---|
| Q1 · 무엇을 그리는가 | **12칸 세로 띠.** 칸 번호 · 여백 · 하단선은 안 그린다 |
| Q2 · 색 | **자홍 `rgba(200,0,120,…)`.** 판면이 안 쓰는 색이다 |
| Q3 · 기본 상태 | **꺼짐** |
| Q4 · 단축키 | **`⌘\`.** 바깥 창과 iframe 양쪽 |
| Q5 · 어디에 심는가 | **`.bd` 안.** 헤더 · 쪽번호 자리는 덮지 않는다 |
| Q6 · 상태를 기억하는가 | **아니다.** 새로 열면 꺼짐 |

---

## §4 커밋

```
sh scripts/save.sh "P2-d · 12칸 격자 토글 · 문서 교체 시 판본 지연" app/ui/Shell.jsx
```

---

## §5 관문

### 5-1. 왕복

```
node scripts/roundtrip.mjs content/sokcho/실행계획서.json
node scripts/roundtrip.mjs content/sokcho/사업장운영시뮬레이션.json
```

**`검사 1040개 · 불일치 0개` · `검사 600개 · 불일치 0개`.**

### 5-2. 산출 HTML 에 격자가 없는가

```
node scripts/build.js content/_check/폭조절.json --link
grep -c "gridov" out/html/폭조절.html
```

**`0` 이어야 한다.** 하나라도 나오면 격자가 산출물로 샌 것이다.

### 5-3. 변경 파일

**`app/ui/Shell.jsx` 하나.**

### 5-4. 눈 검사는 사용자가 한다

dev 서버에 붙지 않는다.

---

## §6 핸드오프 예상 출력

| | |
|---|---|
| ① | 변경 파일 목록과 `git show --stat` |
| ② | `roundtrip` 두 문서의 마지막 줄 |
| ③ | §5-2 의 `grep -c` 결과 |
| ④ | 격자를 심는 코드의 행 번호 · 토글이 붙은 자리 셋의 행 번호 |
| ⑤ | 예상과 다른 것이 있으면 **고치지 말고 보고한다** |

---

## §7 다음 블록 예고

**P2 눈 검사** — 사용자가 dev 서버에서 15건을 판정한다.
통과하면 **P3 · 블록 이동 드래그**.
**이번 턴에 미리 손대지 않는다.**
