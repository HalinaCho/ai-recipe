// 실행: node --test lib/parsing/order-mail-parser.test.mjs
//
// 순수 후처리(sanitizeExtraction)는 항상 돌고, 실제 Gemini 호출이 필요한
// 케이스는 GEMINI_API_KEY가 있을 때만 돈다.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// 번들러가 해주던 두 가지를 테스트 러너에서 대신한다: tsconfig의 "@/*" 별칭과
// 확장자 없는 상대 경로. 정적 import는 훅이 돌기 전에 해석되므로, 대상
// 모듈은 아래에서 동적으로 불러온다.
const projectRoot = path.resolve(import.meta.dirname, "../..");

function resolveSource(specifier, parentURL) {
  // 이 훅은 우리 TS 소스에만 필요하다. 의존성 내부의 상대 require까지 가로채면
  // CJS 로더에 file:// URL을 넘겨 "Cannot find module"이 난다.
  if (parentURL && parentURL.includes("/node_modules/")) return null;

  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(projectRoot, specifier.slice(2));
  } else if (specifier.startsWith(".") && parentURL) {
    base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  } else {
    return null;
  }

  if (base.includes(`${path.sep}node_modules${path.sep}`)) return null;

  if (path.extname(base)) return existsSync(base) ? base : null;
  return (
    [`${base}.ts`, path.join(base, "index.ts")].find((candidate) =>
      existsSync(candidate),
    ) ?? null
  );
}

registerHooks({
  resolve(specifier, context, next) {
    const resolved = resolveSource(specifier, context.parentURL);
    return resolved
      ? next(pathToFileURL(resolved).href, context)
      : next(specifier, context);
  },
});

const { parseOrderMail, sanitizeExtraction } = await import(
  "@/lib/parsing/order-mail-parser.ts"
);

const RECEIVED = { receivedAt: "2026-08-14T02:31:00.000Z" };

test("비식품 줄은 재고에 들어가지 않는다", () => {
  const result = sanitizeExtraction(
    {
      purchasedAt: "2026-08-13",
      complete: true,
      items: [
        { rawName: "서울우유 흰우유 900ml", normalizedName: "우유", quantity: "900ml" },
        { rawName: "배송비", normalizedName: "배송비", quantity: "1개" },
        { rawName: "쿠팡 장바구니 봉투", normalizedName: "봉투", quantity: "1개" },
        { rawName: "신규가입 쿠폰 할인", normalizedName: "쿠폰", quantity: "1개" },
      ],
    },
    RECEIVED,
  );

  assert.deepEqual(
    result.items.map((item) => item.normalizedName),
    ["우유"],
  );
  assert.equal(result.status, "success");
  assert.equal(result.purchasedAt, "2026-08-13");
});

test("수량 표기가 없으면 단위 환산 없이 1개로 채운다", () => {
  const result = sanitizeExtraction(
    {
      purchasedAt: "2026-08-13",
      complete: true,
      items: [{ rawName: "흙대파 1단", normalizedName: "대파", quantity: "  " }],
    },
    RECEIVED,
  );

  assert.equal(result.items[0].quantity, "1개");
});

test("complete=false는 부분 추출로 낮춘다", () => {
  const result = sanitizeExtraction(
    {
      purchasedAt: "2026-08-13",
      complete: false,
      items: [{ rawName: "국산 계란 10구", normalizedName: "계란", quantity: "10구" }],
    },
    RECEIVED,
  );

  assert.equal(result.status, "partial");
  assert.equal(result.items.length, 1, "부분적으로 건진 결과는 버리지 않는다");
});

test("본문이 잘렸으면 complete와 무관하게 부분 추출", () => {
  const result = sanitizeExtraction(
    {
      purchasedAt: "2026-08-13",
      complete: true,
      items: [{ rawName: "국산 계란 10구", normalizedName: "계란", quantity: "10구" }],
    },
    RECEIVED,
    { truncated: true },
  );

  assert.equal(result.status, "partial");
});

test("이름이 비면 그 줄만 버리고 나머지는 부분 추출로 살린다", () => {
  const result = sanitizeExtraction(
    {
      purchasedAt: "2026-08-13",
      complete: true,
      items: [
        { rawName: "", normalizedName: "", quantity: "1개" },
        { rawName: "풀무원 부침두부 300g", normalizedName: "두부", quantity: "1모" },
      ],
    },
    RECEIVED,
  );

  assert.equal(result.status, "partial");
  assert.deepEqual(
    result.items.map((item) => item.normalizedName),
    ["두부"],
  );
});

test("건진 품목이 없으면 failed", () => {
  const result = sanitizeExtraction(
    { purchasedAt: "2026-08-13", complete: true, items: [] },
    RECEIVED,
  );

  assert.equal(result.status, "failed");
});

test("구매일이 없거나 형식이 깨지면 메일 수신일로 대체한다", () => {
  const result = sanitizeExtraction(
    { purchasedAt: "2026년 8월 13일", complete: true, items: [] },
    RECEIVED,
  );

  assert.equal(result.purchasedAt, "2026-08-14");
});

// ---------------------------------------------------------------------------
// 실제 LLM 경로 — 키가 있을 때만
// ---------------------------------------------------------------------------

const COUPANG_MAIL = `[쿠팡] 주문이 완료되었습니다.

주문번호 2600081312345
주문일시 2026-08-13 21:14:02

■ 주문상품
서울우유 1A 흰우유 900ml          1개      2,650원
곰곰 손질 대파 500g               2개      5,980원
풀무원 국산콩 부침두부 300g        1개      2,180원
한입크기 무항생제 닭가슴살 1kg     1개     12,900원
크리넥스 3겹 데코앤소프트 30롤     1개     18,900원

상품금액                                  42,610원
배송비                                         0원
쿠폰할인                                  -2,000원
총 결제금액                               40,610원

배송예정일: 2026-08-15`;

const NAVER_MAIL = `네이버페이 주문내역 안내

안녕하세요, 네이버페이입니다.
아래와 같이 결제가 완료되었습니다.

결제일시 : 2026.08.11 09:22
판매자 : 산지직송 청과

- 상품명 : [산지직송] 성주 참외 2kg (5~7과)
  수량 : 1박스 / 19,900원
- 상품명 : 정품 국내산 깐마늘 500g
  수량 : 2봉 / 11,800원
- 상품명 : 무농약 애호박 1개
  수량 : 3개 / 4,500원

배송비 : 3,000원
네이버페이 포인트 적립 : 361원

배송조회는 네이버페이 앱에서 확인하실 수 있습니다.`;

const KURLY_MAIL = `[마켓컬리] 주문해주셔서 감사합니다.

주문번호  KR-2608-0093211
주문일    2026년 08월 09일

주문하신 상품
· 목초먹인 유기농 우유 750ml ................ 2개
· 동물복지 유정란 대란 10구 ................. 1판
· 통영 손질 새우살 300g ..................... 1팩
· 컬리 반찬 - 오이무침 200g ................. 1개
· 친환경 주방세제 리필 1L .................... 1개

컬리 종이 보냉백                              1개
신선 배송비                                   무료
웰컴 쿠폰 할인                            -5,000원

결제금액 38,700원`;

const LIVE = Boolean(process.env.GEMINI_API_KEY);

test(
  "실제 메일 본문에서 품목·수량·구매일을 뽑고 비식품을 걸러낸다",
  { skip: LIVE ? false : "GEMINI_API_KEY 없음 — LLM 경로를 건너뜁니다" },
  async (t) => {
    const cases = [
      {
        name: "쿠팡",
        mail: {
          providerMessageId: "live-coupang",
          from: "no-reply@coupang.com",
          subject: "[쿠팡] 주문이 완료되었습니다",
          receivedAt: "2026-08-13T12:14:02.000Z",
          bodyText: COUPANG_MAIL,
        },
        purchasedAt: "2026-08-13",
        expect: ["우유", "대파", "두부", "닭고기"],
        reject: ["배송비", "쿠폰", "화장지"],
      },
      {
        name: "네이버페이",
        mail: {
          providerMessageId: "live-naver",
          from: "noreply@pay.naver.com",
          subject: "네이버페이 주문내역 안내",
          receivedAt: "2026-08-11T00:22:00.000Z",
          bodyText: NAVER_MAIL,
        },
        purchasedAt: "2026-08-11",
        expect: ["마늘", "애호박"],
        reject: ["배송비", "포인트"],
      },
      {
        name: "마켓컬리",
        mail: {
          providerMessageId: "live-kurly",
          from: "help@kurly.com",
          subject: "[마켓컬리] 주문해주셔서 감사합니다",
          receivedAt: "2026-08-09T22:40:00.000Z",
          bodyText: KURLY_MAIL,
        },
        purchasedAt: "2026-08-09",
        expect: ["우유", "계란", "새우"],
        reject: ["배송비", "쿠폰", "보냉백", "세제"],
      },
    ];

    for (const testCase of cases) {
      await t.test(testCase.name, async () => {
        const parsed = await parseOrderMail(testCase.mail);
        const names = parsed.items.map((item) => item.normalizedName);

        assert.equal(parsed.purchasedAt, testCase.purchasedAt);
        assert.notEqual(parsed.status, "failed");

        for (const expected of testCase.expect) {
          assert.ok(
            names.includes(expected),
            `${testCase.name}: "${expected}" 가 없음 — ${JSON.stringify(names)}`,
          );
        }
        for (const rejected of testCase.reject) {
          assert.ok(
            !names.some((name) => name.includes(rejected)),
            `${testCase.name}: 비식품 "${rejected}" 가 섞임 — ${JSON.stringify(names)}`,
          );
        }
        for (const item of parsed.items) {
          assert.ok(item.quantity.length > 0);
          assert.ok(
            !/\d+\s*(ml|g|kg|L)\b/i.test(item.normalizedName),
            `정규화 이름에 용량이 남음: ${item.normalizedName}`,
          );
        }
      });
    }
  },
);
