"use client";

import Image from "next/image";
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
  /**
   * 브라우저가 어느 크기로 받을지 정하는 힌트. 안 주면 뷰포트 기준으로
   * 잡아서, 레이아웃이 448px 상한인데도 1920px짜리를 받아 온다.
   */
  sizes?: string;
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
 * next/image를 쓰는 이유: 원본이 표시 크기와 한참 어긋난다. 완성 사진은
 * 320px짜리를 썸네일 56px에 쓰고, 단계 사진은 613KB짜리를 6장 늘어놓는다.
 * 표시 크기에 맞춰 줄이고 webp로 바꾸면 상세 화면이 3.8MB에서 수백 KB로 준다.
 * (변환 쿼터를 걱정했으나 결과가 31일 캐시되고 가구 하나가 쓰는 서비스다.)
 */
export function RecipeImage({
  src,
  alt,
  fallbackName,
  className,
  size = "thumb",
  width,
  height,
  // 앱 본문은 max-w-md(448px)를 넘지 않는다. 썸네일은 56px 고정.
  sizes = size === "thumb" ? "56px" : "(max-width: 448px) 100vw, 448px",
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
    <Image
      src={src}
      alt={alt}
      width={width ?? 400}
      height={height ?? 400}
      sizes={sizes}
      loading="lazy"
      // 변환이 실패하거나 원본이 사라져도 깨진 아이콘을 남기지 않는다.
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}
