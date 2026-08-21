"use client";

import { useState } from "react";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { cn } from "@/lib/utils";

export interface RecipeImageProps {
  src: string | null;
  alt: string;
  /** 사진이 없거나 못 불러올 때 대신 띄울 재료 아이콘의 기준 이름. */
  fallbackName: string;
  className?: string;
  /**
   * 원본 비율. 넘기면 브라우저가 내려받기 전에 자리를 잡아 두어 사진이
   * 뜰 때 아래 내용이 밀려 내려가지 않는다 (레이아웃 시프트).
   */
  width?: number;
  height?: number;
  /** 히어로(상세 상단)인지 썸네일(목록)인지 — 폴백 아이콘 크기를 맞춘다. */
  size?: "thumb" | "hero" | "step";
}

const FALLBACK_ICON_SIZE = {
  thumb: "md",
  step: "md",
  hero: "lg",
} as const;

/**
 * 레시피 사진. 못 불러오면 재료 아이콘으로 조용히 되돌아간다.
 *
 * 폴백이 꼭 필요한 이유: 이미지는 식약처 서버(foodsafetykorea.go.kr)에 그대로
 * 남아 있고 우리가 복사해 두지 않았다. 그쪽이 잠깐 죽거나 파일이 사라지면
 * 깨진 이미지 아이콘이 카드마다 박히는데, 그건 "사진이 없는 것"보다 훨씬
 * 고장 나 보인다. 원래 쓰던 재료 아이콘으로 돌아가면 아무 일도 없던 것처럼 된다.
 *
 * next/image를 안 쓰는 이유: 외부 도메인 최적화는 Vercel의 이미지 변환 쿼터를
 * 소모한다. 레시피가 1,156개라 목록을 몇 번만 훑어도 무료 한도를 넘길 수 있다.
 * 개인용 서비스에서 굳이 그 위험을 살 이유가 없어 lazy 로딩만 걸어 둔다.
 */
export function RecipeImage({
  src,
  alt,
  fallbackName,
  className,
  size = "thumb",
  width,
  height,
}: RecipeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <IngredientIcon
        normalizedName={fallbackName}
        size={FALLBACK_ICON_SIZE[size]}
        className={cn("shrink-0 bg-surface-container-low", className)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 위 주석 참고
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}
