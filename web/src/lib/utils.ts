import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates an entity id, as a real uuid.
 *
 * The client generates these rather than letting Postgres default them, because
 * every encrypted envelope is bound to its row id as additional authenticated
 * data — so the id has to exist before the record can be sealed. See `aadFor`
 * in crypto.ts.
 *
 * It replaced a prefixed short id ("j-a1b2c3d4"), which read nicely in the
 * fixture data and would be rejected outright by a `uuid` column.
 *
 * Must only be called from event handlers or effects — never during render,
 * where a fresh value on every pass would be unstable and trips the React
 * purity rules.
 */
export function newId(): string {
  return crypto.randomUUID();
}
