// FR-06-03: 조리 단계는 글과 사진이 한 쌍이다.
//
// 식약처 원본은 MANUAL01~20(글)과 MANUAL_IMG01~20(사진)을 같은 번호로 짝지어
// 준다. 우리는 글만 가져오고 사진을 버리고 있었는데, 실제로 확인해 보니
// 조리단계 6,717개 **전부**에 사진이 붙어 있었다. 글만 읽는 조리법은 따라하기
// 어렵고, 있는 자료를 안 쓸 이유가 없다.
//
// 두 배열(글 배열 + 사진 배열)로 나눠 저장하지 않는 이유: 인덱스로 짝을
// 맞추는 구조는 한쪽만 길어지는 순간 조용히 어긋난다. 3단계 사진이 2단계에
// 붙어도 화면에는 아무 오류가 안 뜨고 그냥 이상한 조리법이 된다.
// 한 객체로 묶어 두면 애초에 어긋날 수가 없다.

export interface RecipeStep {
  text: string;
  /** 그 단계의 사진. 원본에 없으면 null. */
  imageUrl: string | null;
}

/**
 * DB(jsonb)에서 읽은 값을 RecipeStep[]로 정규화한다.
 *
 * 옛 모양(`string[]`)도 받아들인다. 백필이 도중에 멈추거나 아직 안 돌린
 * 환경에서 상세 화면이 통째로 깨지는 것보다, 사진 없이 글만 보여주는 편이
 * 훨씬 낫기 때문이다. 이 관용은 백필 후에도 남겨 둔다 — 다시 수집하는
 * 경로가 여러 개라 언젠가 옛 모양이 다시 들어올 수 있다.
 */
export function normalizeSteps(raw: unknown): RecipeStep[] {
  if (!Array.isArray(raw)) return [];

  const steps: RecipeStep[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const text = entry.trim();
      if (text) steps.push({ text, imageUrl: null });
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text) continue;
      const imageUrl =
        typeof record.imageUrl === "string" && record.imageUrl.trim() !== ""
          ? record.imageUrl.trim()
          : null;
      steps.push({ text, imageUrl });
    }
  }
  return steps;
}

/**
 * 원본 이미지 URL을 https로 올린다.
 *
 * 식약처는 http로 내려주는데, 우리 페이지는 https라 그대로 쓰면 브라우저가
 * 혼합 콘텐츠로 차단해 **이미지가 조용히 안 뜬다**. 같은 호스트가 https로도
 * 서빙하므로 저장 시점에 바꿔 둔다. (완성 사진에도 같은 처리를 한다.)
 */
export function toHttps(url: string): string {
  return url.startsWith("http://") ? `https://${url.slice(7)}` : url;
}
