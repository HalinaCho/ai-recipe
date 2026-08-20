import type { createClient } from "@/lib/supabase/server";

/**
 * 요청 스코프의 Supabase 클라이언트 타입. 서비스 롤 클라이언트(크론)도 같은
 * 표면을 쓰기 때문에 두 경로가 이 별칭 하나를 공유한다.
 */
export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
