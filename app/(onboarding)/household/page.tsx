"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type {
  CreateHouseholdRequest,
  CreateHouseholdResponse,
} from "@/types/api";

export default function HouseholdPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name } satisfies CreateHouseholdRequest),
      });
      if (!res.ok) throw new Error("가구 생성에 실패했어요");
      (await res.json()) as CreateHouseholdResponse;
      router.push("/mail-connect");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="space-y-2">
        <p className="text-headline-lg text-on-surface">우리집 이름은?</p>
        <p className="text-body-md text-on-surface-variant">
          가구 단위로 재고와 식단표를 함께 관리해요.
        </p>
      </div>
      <Input
        placeholder="예: 우리집"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <p className="text-body-md text-error">{error}</p>}
      <Button onClick={handleCreate} disabled={loading || !name.trim()}>
        {loading ? "만드는 중..." : "가구 만들기"}
      </Button>
    </div>
  );
}
