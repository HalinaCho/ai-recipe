import type { ServerSupabaseClient } from "@/lib/inventory/types";
import { createFoodSafetyKoreaSource } from "@/lib/recipes/foodsafetykorea";
import {
  DEFAULT_BATCH_SIZE,
  structureRecipeIngredients,
  type StructureFn,
  type StructuringInput,
} from "@/lib/recipes/ingest/structure-ingredients";
import { isWhitelistedSeasoning } from "@/lib/recipes/seasonings";
import type { RawSourceRecipe, RecipeSource, StructuredIngredient } from "@/lib/recipes/types";

// FR-06 / FR-07: 소스 API를 훑어 recipe / recipe_ingredient를 채우는 배치.
// 한 번에 다 돌지 못한다는 전제로 만든다 — 중단돼도 offset부터 이어서 돌 수
// 있고, 이미 구조화된 레시피는 LLM을 다시 부르지 않는다.

/** API를 한 번에 요청할 행 수. 페이지 단위로 DB 왕복이 일어난다. */
const DEFAULT_PAGE_SIZE = 100;

/** 한 실행에서 처리할 레시피 상한. 서버리스 실행 시간을 묶어 둔다. */
const DEFAULT_LIMIT = 200;

/** 연속으로 이만큼 배치가 인프라 오류로 죽으면 이번 실행을 접는다. */
const MAX_CONSECUTIVE_BATCH_FAILURES = 3;

/** 업서트·삭제를 나눠 보낼 크기. 한 요청이 지나치게 커지지 않게. */
const DB_CHUNK_SIZE = 50;

export interface IngestDeps {
  source?: RecipeSource;
  structure?: StructureFn;
}

export interface IngestOptions {
  /** 0부터 세는 소스 오프셋. 중단된 실행을 이어받을 때 쓴다. */
  offset?: number;
  /** 이번 실행에서 처리할 레시피 수 상한. */
  limit?: number;
  pageSize?: number;
  batchSize?: number;
  /** 이미 구조화된 레시피도 LLM을 다시 태운다. */
  force?: boolean;
  deps?: IngestDeps;
}

export interface IngestFailure {
  sourceRecipeId: string;
  reason: string;
}

export interface IngestReport {
  sourceApi: string;
  /** 소스에서 읽어온 레시피 수. */
  fetched: number;
  /** LLM으로 재료를 구조화한 레시피 수. */
  structured: number;
  /** recipe 행을 쓴(신규 또는 갱신) 레시피 수. */
  written: number;
  /** 이미 구조화돼 있어 LLM을 건너뛴 레시피 수. */
  skipped: number;
  /** 재료를 얻지 못한 레시피 수. 다음 실행에서 다시 시도된다. */
  failed: number;
  failures: IngestFailure[];
  /** 다음 실행에 넘길 오프셋. */
  nextOffset: number;
  /** 소스를 끝까지 읽었으면 true. */
  done: boolean;
}

type ExistingRecipe = { id: string; hasIngredients: boolean };

/**
 * 소스 레시피를 읽어 DB에 채운다.
 *
 * 멱등성: recipe는 unique(source_api, source_recipe_id) 위로 업서트하므로
 * 다시 돌려도 중복되지 않고 메타데이터만 최신으로 덮인다. 재료가 이미
 * 있는 레시피는 force가 아닌 한 LLM 비용을 다시 치르지 않는다.
 */
export async function runRecipeIngestion(
  supabase: ServerSupabaseClient,
  options: IngestOptions = {},
): Promise<IngestReport> {
  const source = options.deps?.source ?? createFoodSafetyKoreaSource();
  const structure = options.deps?.structure ?? structureRecipeIngredients;
  const pageSize = clamp(options.pageSize ?? DEFAULT_PAGE_SIZE, 1, 1000);
  const batchSize = clamp(options.batchSize ?? DEFAULT_BATCH_SIZE, 1, 100);
  const limit = clamp(options.limit ?? DEFAULT_LIMIT, 1, 100_000);
  const force = options.force === true;

  const report: IngestReport = {
    sourceApi: source.sourceApi,
    fetched: 0,
    structured: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    nextOffset: Math.max(options.offset ?? 0, 0),
    done: false,
  };

  let consecutiveBatchFailures = 0;

  while (report.fetched < limit) {
    const pageOffset = report.nextOffset;
    const wanted = Math.min(pageSize, limit - report.fetched);
    const page = await source.fetchPage(pageOffset, wanted);

    if (page.length === 0) {
      report.done = true;
      break;
    }

    report.fetched += page.length;

    const aborted = await ingestPage(supabase, page, report, {
      source,
      structure,
      batchSize,
      force,
      onBatchFailure: () => {
        consecutiveBatchFailures += 1;
        return consecutiveBatchFailures >= MAX_CONSECUTIVE_BATCH_FAILURES;
      },
      onBatchSuccess: () => {
        consecutiveBatchFailures = 0;
      },
    });

    if (aborted) {
      // 페이지 도중에 접었더라도 이미 쓴 레시피는 다음 실행에서 skip으로
      // 걸러지므로, 페이지 처음부터 다시 읽는 편이 안전하다.
      report.nextOffset = pageOffset;
      return report;
    }

    report.nextOffset = pageOffset + page.length;

    // 요청한 것보다 적게 왔다면 소스 끝이다.
    if (page.length < wanted) {
      report.done = true;
      break;
    }
  }

  return report;
}

interface PageContext {
  source: RecipeSource;
  structure: StructureFn;
  batchSize: number;
  force: boolean;
  /** true를 돌려주면 이번 실행을 접는다. */
  onBatchFailure: () => boolean;
  onBatchSuccess: () => void;
}

/** 페이지 하나를 처리한다. 실행을 접어야 하면 true. */
async function ingestPage(
  supabase: ServerSupabaseClient,
  page: RawSourceRecipe[],
  report: IngestReport,
  context: PageContext,
): Promise<boolean> {
  const sourceApi = context.source.sourceApi;
  const existing = await loadExisting(supabase, sourceApi, page);

  // 레시피 행을 먼저 확정해야 재료를 붙일 id가 생긴다. 구조화가 실패해도
  // 레시피 자체는 남고, 재료가 없으니 다음 실행에서 다시 시도된다.
  const recipeIds = await upsertRecipes(supabase, sourceApi, page);
  report.written += recipeIds.size;

  const pending: RawSourceRecipe[] = [];

  for (const recipe of page) {
    if (!recipeIds.has(recipe.sourceRecipeId)) {
      report.failed += 1;
      report.failures.push({
        sourceRecipeId: recipe.sourceRecipeId,
        reason: "recipe 행을 쓰지 못했습니다",
      });
      continue;
    }

    if (!context.force && existing.get(recipe.sourceRecipeId)?.hasIngredients) {
      report.skipped += 1;
      continue;
    }

    if (!recipe.ingredientsText) {
      report.failed += 1;
      report.failures.push({
        sourceRecipeId: recipe.sourceRecipeId,
        reason: "재료 텍스트가 비어 있습니다",
      });
      continue;
    }

    pending.push(recipe);
  }

  for (let i = 0; i < pending.length; i += context.batchSize) {
    const batch = pending.slice(i, i + context.batchSize);
    const inputs: StructuringInput[] = batch.map((recipe) => ({
      sourceRecipeId: recipe.sourceRecipeId,
      name: recipe.name,
      ingredientsText: recipe.ingredientsText,
    }));

    let structured: Map<string, StructuredIngredient[]>;
    try {
      structured = await context.structure(inputs);
      context.onBatchSuccess();
    } catch (error) {
      // 인프라 오류. 이 배치의 레시피는 재료 없이 남고 다음 실행에서 다시 시도된다.
      const reason = error instanceof Error ? error.message : String(error);
      for (const recipe of batch) {
        report.failed += 1;
        report.failures.push({ sourceRecipeId: recipe.sourceRecipeId, reason });
      }
      if (context.onBatchFailure()) return true;
      continue;
    }

    const rows: {
      recipe_id: string;
      normalized_name: string;
      role: StructuredIngredient["role"];
      is_whitelisted_seasoning: boolean;
    }[] = [];
    const replacedRecipeIds: string[] = [];

    for (const recipe of batch) {
      const ingredients = structured.get(recipe.sourceRecipeId);
      if (!ingredients || ingredients.length === 0) {
        report.failed += 1;
        report.failures.push({
          sourceRecipeId: recipe.sourceRecipeId,
          reason: "재료를 구조화하지 못했습니다",
        });
        continue;
      }

      const recipeId = recipeIds.get(recipe.sourceRecipeId)!;
      replacedRecipeIds.push(recipeId);
      report.structured += 1;

      for (const ingredient of ingredients) {
        rows.push({
          recipe_id: recipeId,
          normalized_name: ingredient.normalizedName,
          role: ingredient.role,
          is_whitelisted_seasoning: isWhitelistedSeasoning(
            ingredient.normalizedName,
          ),
        });
      }
    }

    await replaceIngredients(supabase, replacedRecipeIds, rows);
  }

  return false;
}

/** 이 페이지의 레시피 중 이미 DB에 있는 것과, 재료가 붙어 있는지를 읽는다. */
async function loadExisting(
  supabase: ServerSupabaseClient,
  sourceApi: string,
  page: RawSourceRecipe[],
): Promise<Map<string, ExistingRecipe>> {
  const result = new Map<string, ExistingRecipe>();

  for (const chunk of chunked(page.map((r) => r.sourceRecipeId))) {
    const { data, error } = await supabase
      .from("recipe")
      .select("id, source_recipe_id")
      .eq("source_api", sourceApi)
      .in("source_recipe_id", chunk);

    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      result.set(row.source_recipe_id, { id: row.id, hasIngredients: false });
    }
  }

  const ids = [...result.values()].map((entry) => entry.id);
  const withIngredients = new Set<string>();

  for (const chunk of chunked(ids)) {
    const { data, error } = await supabase
      .from("recipe_ingredient")
      .select("recipe_id")
      .in("recipe_id", chunk);

    if (error) throw new Error(error.message);

    for (const row of data ?? []) withIngredients.add(row.recipe_id);
  }

  for (const entry of result.values()) {
    entry.hasIngredients = withIngredients.has(entry.id);
  }

  return result;
}

/** 레시피 메타데이터를 업서트하고 sourceRecipeId → recipe.id 를 돌려준다. */
async function upsertRecipes(
  supabase: ServerSupabaseClient,
  sourceApi: string,
  page: RawSourceRecipe[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const chunk of chunked(page)) {
    const { data, error } = await supabase
      .from("recipe")
      .upsert(
        chunk.map((recipe) => ({
          source_api: sourceApi,
          source_recipe_id: recipe.sourceRecipeId,
          name: recipe.name,
          image_url: recipe.imageUrl,
          instructions: recipe.instructions,
          category: recipe.category,
          cooking_method: recipe.cookingMethod,
          calories: recipe.nutrition.calories,
          carbohydrate: recipe.nutrition.carbohydrate,
          protein: recipe.nutrition.protein,
          fat: recipe.nutrition.fat,
          sodium: recipe.nutrition.sodium,
        })),
        { onConflict: "source_api,source_recipe_id" },
      )
      .select("id, source_recipe_id");

    if (error) throw new Error(error.message);

    for (const row of data ?? []) ids.set(row.source_recipe_id, row.id);
  }

  return ids;
}

/**
 * 레시피의 재료를 통째로 갈아 끼운다. 재수집 시 예전 재료가 남지 않도록
 * 지우고 넣는다 — recipe_ingredient에는 업서트할 자연키가 없다.
 */
async function replaceIngredients(
  supabase: ServerSupabaseClient,
  recipeIds: string[],
  rows: {
    recipe_id: string;
    normalized_name: string;
    role: StructuredIngredient["role"];
    is_whitelisted_seasoning: boolean;
  }[],
): Promise<void> {
  if (recipeIds.length === 0) return;

  for (const chunk of chunked(recipeIds)) {
    const { error } = await supabase
      .from("recipe_ingredient")
      .delete()
      .in("recipe_id", chunk);

    if (error) throw new Error(error.message);
  }

  for (const chunk of chunked(rows, 500)) {
    const { error } = await supabase.from("recipe_ingredient").insert(chunk);
    if (error) throw new Error(error.message);
  }
}

function* chunked<T>(items: T[], size = DB_CHUNK_SIZE): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
