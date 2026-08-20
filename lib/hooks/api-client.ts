// Thin fetch wrapper shared by the M1 query hooks.
//
// Every app/api route answers failures with `{ error: string }` (see
// app/api/household/route.ts), so we surface that message when it exists and
// fall back to warm Korean copy otherwise — these strings are shown directly
// to the user, who should never see a bare status code.

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function fallbackMessage(status: number): string {
  if (status === 401 || status === 403) return "로그인이 풀렸어요. 다시 로그인해주세요.";
  if (status === 404) return "아직 준비 중인 기능이에요.";
  if (status >= 500) return "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해주세요.";
  return "요청을 처리하지 못했어요.";
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("인터넷 연결을 확인해주세요.", 0);
  }

  if (!res.ok) {
    let message = fallbackMessage(res.status);
    try {
      const body: unknown = await res.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
      ) {
        message = (body as { error: string }).error;
      }
    } catch {
      // Non-JSON error body (e.g. Next's 404 HTML page) — keep the fallback.
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
