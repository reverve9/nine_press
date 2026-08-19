# P0 구현 프롬프트 — 수치 블록 편집 경계 분리

작성 2026-08-19 · 대상 `/Volumes/BridgeNine/NINE_DEV/PROJECT/NINE_press`

---

## §0 역할

nine_press 렌더러의 결함 하나를 닫는다. **이 프롬프트의 범위 밖을 건드리지 않는다.**

---

## §1 작업 범위

### 1-1. `render/index.js` · `수치()` 함수 교체

**현재 (145–151행)**

```js
function 수치(v, P) {
  return '<div class="mt">' + (v ?? []).map(([big, 단위, lb, 배경], i) =>
    `<div class="m${배경 ? ' ' + 배경 : ''}">` +
    `<div class="big"${dp(P && [...P, '수치', i, 0])}>${inline(big)}` +
    (단위 ? `<span>${inline(단위)}</span>` : '') + '</div>' +
    `<div class="lb"${dp(P && [...P, '수치', i, 2])}>${inline(lb)}</div></div>`).join('') + '</div>';
}
```

**교체본**

```js
function 수치(v, P) {
  return '<div class="mt">' + (v ?? []).map(([big, 단위, lb, 배경], i) =>
    `<div class="m${배경 ? ' ' + 배경 : ''}">` +
    '<div class="big">' +
    `<span class="bv"${dp(P && [...P, '수치', i, 0])}>${inline(big)}</span>` +
    (단위 ? `<span class="bu"${dp(P && [...P, '수치', i, 1])}>${inline(단위)}</span>` : '') +
    '</div>' +
    `<div class="lb"${dp(P && [...P, '수치', i, 2])}>${inline(lb)}</div></div>`).join('') + '</div>';
}
```

**무엇이 바뀌는가**

| | 전 | 후 |
|---|---|---|
| `data-p` 가 걸린 요소 | `.big` — 단위 `<span>` 을 자식으로 품음 | `.bv` — 값 텍스트만 |
| 단위 편집 | 불가 (`data-p` 없음) | `.bu` 로 가능 |
| 데이터 모양 | — | **안 바뀜** |

### 1-2. `rules/page.css` **맨 끝**에 덧붙임

```css
/* ────────────────────────────────────────────────────────────
   ㉖ 수치 값 — 편집 경계를 값에만 건다  (2026-08-19)

   결함: data-p 가 .big 에 걸려 있어 단위 <span> 까지 값으로 읽혔다.
         roundtrip 6건 불일치 · 제자리 편집 저장 시 "2,100" → "2,100만원" 누적.

   값을 .bv 로 감싸고 경계를 옮겼다. 단위는 .bu 로 따로 편집한다.
   .mt .m .big span (단위 서식 · ⑬ ㉓) 이 값에도 걸리므로 특정도로 상쇄한다.
   .bv 는 색을 상속하므로 .m.or 의 주황도 그대로 간다.
   ──────────────────────────────────────────────────────────── */
.mt .m .big .bv{font-size:inherit;color:inherit;letter-spacing:inherit;margin-left:0}
```

---

## §2 금지 사항

| | |
|---|---|
| ① | **`rules/page.css` 의 앞 블록을 고치지 않는다.** 끝에 덧붙이기만 한다 |
| ② | `content/sokcho/*.json` 을 **건드리지 않는다.** 이번 작업에 데이터 변경은 없다 |
| ③ | 다른 흐름 블록(`단계띠` · `지도` · `막대` · `격자` · `띠` · `자리`)을 손대지 않는다 |
| ④ | `git` 명령을 직접 쓰지 않는다. **`sh scripts/save.sh "메시지"`** 만 쓴다 |
| ⑤ | `next build` 를 돌리지 않는다 |
| ⑥ | 12칸 트랙 · 드래그 · 이미지 관련 코드에 **미리 손대지 않는다.** 다음 블록이다 |

---

## §3 착수 전 확정 사항

이 챗 세션에서 이미 판정된 값이다. **질문 없이 그대로 간다.**

| | 확정값 |
|---|---|
| Q1 · 값과 단위를 한 요소로 합칠 것인가 | **아니다.** 단위를 데이터의 값에 넣지 않는다 — 단위 서식 통일이 깨진다 |
| Q2 · 값 요소의 태그 | **`<span class="bv">`.** `<b>` · `<strong>` 은 쓰지 않는다 — 복원 함수가 `**굵게**` 로 되돌린다 |
| Q3 · 단위 요소 | **`<span class="bu">`.** `span` 을 유지해야 기존 서식 규칙이 계속 걸린다 |
| Q4 · 단위의 `data-p` 색인 | **`1`** — `["수치", i, 1]`. 값 `0` · 라벨 `2` 와 같은 배열 |
| Q5 · CSS 를 어디에 쓰는가 | **`page.css` 맨 끝 ㉖ 블록** |

---

## §4 커밋

```
sh scripts/save.sh "P0 · 수치 블록 편집 경계를 값에 분리 · 단위 편집 개방"
```

---

## §5 관문 — 통과 못 하면 보고하고 멈춘다

```
node scripts/roundtrip.mjs content/sokcho/실행계획서.json
node scripts/roundtrip.mjs content/sokcho/사업장운영시뮬레이션.json
```

**둘 다 `불일치 0개` 여야 한다.** 직전 값은 각각 0건 · **6건**이었다.

그 뒤 검사용 빌드를 남긴다.

```
node scripts/build.js content/sokcho/실행계획서.json --link
node scripts/build.js content/sokcho/사업장운영시뮬레이션.json --link
```

---

## §6 핸드오프 예상 출력

보고에 아래를 담는다.

| | |
|---|---|
| ① | 변경 파일 목록 — `render/index.js` · `rules/page.css` 둘뿐이어야 한다 |
| ② | `roundtrip` 두 문서의 최종 줄 (`검사 N개 · 불일치 N개`) |
| ③ | `page.css` 최종 줄 수 |
| ④ | 예상과 다른 것이 있으면 **고치지 말고 보고한다** |

---

## §7 다음 블록 예고

**P1 · 12칸 트랙 전환.** `page.css` 451행 계수를 `370.959 → 92.739` 로 바꾸고, 폭 규칙을 `.row.g` 에서 전 행으로 푼다. 데이터의 판면 열 폭에 4를 곱한다.
**이번 턴에 미리 손대지 않는다.**
