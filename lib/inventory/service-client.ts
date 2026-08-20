import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { ServerSupabaseClient } from "@/lib/inventory/types";
import type { Database } from "@/types/database";

/**
 * 크론 전용 클라이언트. 크론에는 로그인 세션이 없어 RLS의 auth_household_ids()가
 * 빈 집합이 되므로, 서비스 롤로 접근해야 모든 가구를 돌 수 있다.
 *
 * 사용자 요청 경로에서는 절대 쓰지 않는다 — 그쪽은 세션 기반 클라이언트가
 * RLS로 가구를 격리한다(NFR-04).
 */
export function createServiceClient(): ServerSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as ServerSupabaseClient;
}
