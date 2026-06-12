import type { JobResultsResponse, PrimaryCrop, PromotionCardinality, PromotionCropCount } from "@/types/ocr-api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCropCounts(raw: unknown): PromotionCropCount[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const crop = typeof entry.crop === "string" ? entry.crop : null;
      const productCount = typeof entry.product_count === "number" ? entry.product_count : null;
      if (!crop || productCount === null) return null;
      return { crop, product_count: productCount };
    })
    .filter((entry): entry is PromotionCropCount => Boolean(entry));
  return items.length ? items : undefined;
}

function parseStringRecord(raw: unknown): Record<string, number> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parsePromotionCardinality(raw: unknown): PromotionCardinality | null {
  if (!isRecord(raw)) return null;

  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const crop = typeof entry.crop === "string" ? entry.crop : null;
          const winner = typeof entry.winner === "string" ? entry.winner : null;
          if (!crop || !winner) return null;
          return {
            crop,
            winner,
            removed_products: Array.isArray(entry.removed_products)
              ? entry.removed_products.map((item) => String(item)).filter(Boolean)
              : [],
            strategy: typeof entry.strategy === "string" ? entry.strategy : "best_evidence",
            reason: typeof entry.reason === "string" ? entry.reason : "one_product_per_primary_promotion",
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : undefined;

  const parsed: PromotionCardinality = {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    verifiable: typeof raw.verifiable === "boolean" ? raw.verifiable : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    detected_promotions: typeof raw.detected_promotions === "number" ? raw.detected_promotions : undefined,
    expected_products:
      raw.expected_products === null
        ? null
        : typeof raw.expected_products === "number"
          ? raw.expected_products
          : undefined,
    products_before: typeof raw.products_before === "number" ? raw.products_before : undefined,
    products_after: typeof raw.products_after === "number" ? raw.products_after : undefined,
    promotions_with_product: typeof raw.promotions_with_product === "number" ? raw.promotions_with_product : undefined,
    primary_promotion_crops: Array.isArray(raw.primary_promotion_crops)
      ? raw.primary_promotion_crops.map((item) => String(item)).filter(Boolean)
      : undefined,
    products_per_promotion_before: parseStringRecord(raw.products_per_promotion_before),
    products_per_promotion_after: parseStringRecord(raw.products_per_promotion_after),
    missing_promotion_crops: Array.isArray(raw.missing_promotion_crops)
      ? raw.missing_promotion_crops.map((item) => String(item)).filter(Boolean)
      : undefined,
    multiple_product_crops_before: parseCropCounts(raw.multiple_product_crops_before),
    multiple_product_crops_after: parseCropCounts(raw.multiple_product_crops_after),
    removed: typeof raw.removed === "number" ? raw.removed : undefined,
    decisions: decisions?.length ? decisions : undefined,
    review_required: typeof raw.review_required === "boolean" ? raw.review_required : undefined,
    review_reasons: Array.isArray(raw.review_reasons)
      ? raw.review_reasons.map((item) => String(item)).filter(Boolean)
      : undefined,
  };

  const hasSignal = Object.values(parsed).some((value) => value !== undefined);
  return hasSignal ? parsed : null;
}

export function extractJobPromotionCardinality(results: JobResultsResponse | null | undefined): PromotionCardinality | null {
  if (!results) return null;
  if (results.promotion_cardinality) return results.promotion_cardinality;

  const rawResultJson = results.raw_result_json;
  const fromResultJson = parsePromotionCardinality(rawResultJson?.promotion_cardinality);
  if (fromResultJson) return fromResultJson;

  const nestedUser =
    rawResultJson?.user_response && isRecord(rawResultJson.user_response)
      ? (rawResultJson.user_response as Record<string, unknown>).promotion_cardinality
      : undefined;
  const fromNestedUser = parsePromotionCardinality(nestedUser);
  if (fromNestedUser) return fromNestedUser;

  const fromTopUser = parsePromotionCardinality(
    results.user_response && isRecord(results.user_response)
      ? (results.user_response as Record<string, unknown>).promotion_cardinality
      : undefined,
  );
  if (fromTopUser) return fromTopUser;

  return null;
}

export function formatPromotionMetric(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return String(value);
}

export type PromotionCardinalityVisualState =
  | "unavailable"
  | "one_to_one"
  | "corrected_to_one_to_one"
  | "mismatch"
  | "unverifiable_no_primary_promotions"
  | "unknown";

export function resolvePromotionCardinalityVisualState(
  cardinality: PromotionCardinality | null | undefined,
): PromotionCardinalityVisualState {
  if (!cardinality) return "unavailable";
  const status = String(cardinality.status ?? "");
  if (status === "one_to_one") return "one_to_one";
  if (status === "corrected_to_one_to_one") return "corrected_to_one_to_one";
  if (status === "mismatch") return "mismatch";
  if (status === "unverifiable_no_primary_promotions") return "unverifiable_no_primary_promotions";
  return "unknown";
}

export function jobPromotionReviewRequired(
  cardinality: PromotionCardinality | null | undefined,
  images: Array<{ processing_status?: string | null; status?: string }>,
): boolean {
  if (cardinality?.review_required === true) return true;
  return images.some((image) => image.processing_status === "needs_review" || image.status === "needs_review");
}

export function findPrimaryCropByName(crops: PrimaryCrop[] | undefined, cropName: string): PrimaryCrop | null {
  if (!crops?.length || !cropName.trim()) return null;
  const normalized = cropName.trim().toLowerCase();
  return (
    crops.find((crop) => crop.crop_id?.toLowerCase() === normalized) ??
    crops.find((crop) => crop.crop_filename?.toLowerCase() === normalized) ??
    crops.find((crop) => crop.crop_id?.toLowerCase().includes(normalized)) ??
    crops.find((crop) => crop.crop_filename?.toLowerCase().includes(normalized)) ??
    null
  );
}