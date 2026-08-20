# P2-b 보정 프롬프트 — 끌기 감도

작성 2026-08-19 · 대상 `/Volumes/BridgeNine/NINE_DEV/PROJECT/NINE_press`
선행 **P2 완료** · 커밋 `04c8c3a`

---

## §0 역할

**P2 프롬프트 §2-2 의 산식 결함 하나를 닫는다.** 앞 프롬프트를 쓴 쪽의 잘못이고, 구현은 지시대로 됐다.
보고한 진단이 정확했다. 그대로 반영한다.

---

## §1 작업 범위 — `app/ui/Shell.jsx` 두 자리

### 1-1. 451행 — `view` 나눗셈을 뺀다

```
지금   Math.round((e.clientX - 시작X) / (칸너비 * view))
후     Math.round((e.clientX - 시작X) / 칸너비)
```

### 1-2. 405행 — `view` 선언을 지운다

`--u` 를 읽는 줄은 남긴다. `view` 만 쓰이지 않게 된다.

**남는 주석 한 줄을 그 자리에 넣는다.**

```js
// iframe 요소에 걸린 scale 은 내부 문서 좌표계를 바꾸지 않는다.
// preview/route.js 가 .sheet .page{transform:none} 으로 --view 를 껐으므로
// 여기서 잡히는 clientX 는 이미 판면 px 이다. 나누지 않는다.
```

**근거** — 확인한 것 셋.

| | |
|---|---|
| ① | `app/api/preview/route.js:26` 이 `.sheet .page{transform:none}` 을 덧붙인다 → iframe 문서 안 축척 1 |
| ② | 실제 축소는 `Shell.jsx:675` 의 **iframe 요소**에 걸린 `scale(축척)` 이고, 축척은 창 크기로 계산되는 동적값(`156행`)이지 `--view` 가 아니다 |
| ③ | iframe 요소에 CSS transform 이 걸려도 브라우저는 히트테스트에서 변환을 역으로 통과시킨다. 내부 `clientX` 는 변환되지 않은 자체 좌표다 |

---

## §2 금지 사항

| | |
|---|---|
| ① | **`.rz` 스타일을 건드리지 않는다.** 잡기 폭은 실제로 끌어본 뒤 판정한다 |
| ② | `rules/page.css` · `render/index.js` · `content/sokcho/*.json` · `app/api/preview/route.js` 를 건드리지 않는다 |
| ③ | 블록 이동 드래그(P3) · 이미지 · 변형 고르기에 손대지 않는다 |
| ④ | `git` 명령을 직접 쓰지 않는다. **`sh scripts/save.sh "메시지" <경로들>`** 만 쓴다 |
| ⑤ | `next build` 를 돌리지 않는다 |

---

## §3 착수 전 확정 사항

| | 확정값 |
|---|---|
| Q1 · 칸너비 값 | **`(92.73975 + 14.879) * u`.** `u` 는 iframe 문서에서 읽는다 |
| Q2 · `--view` 를 다시 쓸 일이 있는가 | **없다.** 미리보기 경로가 껐다 |
| Q3 · `.rz` 잡기 폭 | **지금 값 유지.** 거터가 29px 이라 넓히면 블록 선택 클릭을 가로챈다 |

---

## §4 커밋

```
sh scripts/save.sh "P2-b · 끌기 감도 · iframe 내부 좌표는 이미 판면 px" app/ui/Shell.jsx
```

---

## §5 관문

### 5-1. 변경 파일

**`app/ui/Shell.jsx` 하나 · 삽입과 삭제가 각각 몇 줄인지 보고한다.**

### 5-2. 왕복

```
node scripts/roundtrip.mjs content/sokcho/실행계획서.json
node scripts/roundtrip.mjs content/sokcho/사업장운영시뮬레이션.json
```

**`검사 1040개 · 불일치 0개` · `검사 600개 · 불일치 0개`.**

### 5-3. 눈 검사는 사용자가 한다

dev 서버에 붙지 않는다.

---

## §6 핸드오프 예상 출력

| | |
|---|---|
| ① | 변경 파일 목록과 `git show --stat` |
| ② | `roundtrip` 두 문서의 마지막 줄 |
| ③ | `view` 를 쓰던 자리가 모두 사라졌는지 — 남아 있으면 행 번호 |
| ④ | 예상과 다른 것이 있으면 **고치지 말고 보고한다** |

---

## §7 다음 블록 예고

사용자 눈 검사 뒤 **P3 · 블록 이동 드래그**.
**이번 턴에 미리 손대지 않는다.**
