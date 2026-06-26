// Loose coercion for untyped agent / JSON result records (fields come in as `unknown`).
export const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));
export const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
