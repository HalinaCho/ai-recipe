import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 식약처 원본은 완성 사진 320~450px(127KB), 단계 사진 1280×853(613KB)로
    // 크기가 제각각이다. 특히 단계 사진은 6장이면 3.8MB라 모바일에서 그대로
    // 내려받으면 느리다. Vercel이 표시 크기에 맞춰 줄이고 webp로 바꿔 준다.
    //
    // 무료 한도(월 5,000 변환)를 걱정했었지만, 변환 결과는 31일 캐시되고
    // 우리는 가구 하나가 쓰는 서비스라 한 달에 수백 건 수준이다.
    remotePatterns: [
      { protocol: "https", hostname: "www.foodsafetykorea.go.kr" },
    ],
  },
};

export default nextConfig;
