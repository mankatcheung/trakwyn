/**
 * The API's Pothos schema leaves every field nullable by default, so codegen
 * types each selected field as `T | null | undefined`. The screens have always
 * treated most of them as present (the hand-written result types said so).
 * `Resolved` keeps that assumption in one visible place: every selected field
 * is non-null, except the keys named in `Nullable`, which stay `T | null`.
 *
 * Drop it per type once the API marks the field `nullable: false`.
 */
export type Resolved<T, Nullable extends keyof T = never> = {
  [K in Exclude<keyof T, '__typename'>]-?: K extends Nullable
    ? Exclude<T[K], undefined>
    : NonNullable<T[K]>;
};
