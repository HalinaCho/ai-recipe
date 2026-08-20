"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { TopAppBar } from "@/components/ui/TopAppBar";
import {
  useAddShoppingDomain,
  useRemoveShoppingDomain,
  useShoppingDomains,
} from "@/lib/hooks/use-shopping-domains";

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export default function ShoppingDomainsSettingsPage() {
  const { data, isPending, isError, error, refetch } = useShoppingDomains();
  const addDomain = useAddShoppingDomain();
  const removeDomain = useRemoveShoppingDomain();

  const [draft, setDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const defaults = data?.defaults ?? [];
  const custom = data?.custom ?? [];

  const handleAdd = () => {
    const domain = draft.trim().toLowerCase().replace(/^@/, "");
    if (!DOMAIN_PATTERN.test(domain)) {
      setValidationError("주소 형태로 적어주세요. 예: coupang.com");
      return;
    }
    if (
      defaults.includes(domain) ||
      custom.some((entry) => entry.domain === domain)
    ) {
      setValidationError("이미 등록된 도메인이에요.");
      return;
    }
    setValidationError(null);
    addDomain.mutate(domain, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar
        title="쇼핑몰 발신 도메인"
        action={
          <Link
            href="/settings"
            aria-label="설정으로 돌아가기"
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </Link>
        }
      />

      <div className="flex flex-col gap-6 px-container-padding pb-8">
        <p className="px-1 text-body-md text-on-surface-variant">
          여기에 적힌 곳에서 온 메일만 읽어요. 자주 쓰는 쇼핑몰이 빠져 있다면
          직접 더해주세요.
        </p>

        {isError && (
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-body-md text-on-surface-variant">
              도메인 목록을 불러오지 못했어요.{" "}
              {error instanceof Error ? error.message : ""}
            </p>
            <Button variant="secondary" onClick={() => void refetch()}>
              다시 시도하기
            </Button>
          </Card>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-body-lg text-on-surface">기본으로 넣어둔 곳</h2>
          {isPending ? (
            <div
              className="h-24 animate-pulse rounded-xl bg-surface-container-lowest shadow-tinted"
              aria-hidden
            />
          ) : (
            <Card className="flex flex-wrap gap-2 p-4">
              {defaults.length === 0 && (
                <p className="text-body-md text-on-surface-variant">
                  기본 도메인이 아직 없어요.
                </p>
              )}
              {defaults.map((domain) => (
                <Chip key={domain} tone="secondary">
                  {domain}
                </Chip>
              ))}
            </Card>
          )}
          <p className="px-1 text-label-md text-on-surface-variant">
            기본 목록은 지울 수 없어요.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-body-lg text-on-surface">직접 추가한 곳</h2>

          {custom.length === 0 && !isPending && (
            <Card className="p-4">
              <p className="text-body-md text-on-surface-variant">
                아직 직접 추가한 도메인이 없어요.
              </p>
            </Card>
          )}

          {custom.map((entry) => (
            <Card
              key={entry.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <span className="truncate text-body-lg text-on-surface">
                {entry.domain}
              </span>
              <button
                type="button"
                aria-label={`${entry.domain} 지우기`}
                disabled={removeDomain.isPending}
                onClick={() => removeDomain.mutate(entry.id)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-all active:scale-95 active:translate-y-0.5 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-2xl">
                  delete
                </span>
              </button>
            </Card>
          ))}

          <div className="flex flex-col gap-2 pt-1">
            <Input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setValidationError(null);
              }}
              onKeyDown={(event) => event.key === "Enter" && handleAdd()}
              placeholder="예: coupang.com"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="추가할 발신 도메인"
            />
            {validationError && (
              <p className="text-label-md text-error">{validationError}</p>
            )}
            {addDomain.isError && (
              <p className="text-label-md text-error">
                추가하지 못했어요.{" "}
                {addDomain.error instanceof Error ? addDomain.error.message : ""}
              </p>
            )}
            {removeDomain.isError && (
              <p className="text-label-md text-error">
                지우지 못했어요.{" "}
                {removeDomain.error instanceof Error
                  ? removeDomain.error.message
                  : ""}
              </p>
            )}
            <Button
              className="w-full"
              onClick={handleAdd}
              disabled={addDomain.isPending || draft.trim().length === 0}
            >
              {addDomain.isPending ? "추가하는 중..." : "도메인 추가하기"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
