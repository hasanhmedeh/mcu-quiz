type ClassValue = string | false | null | undefined;

/** Tiny class-name joiner; avoids pulling in a dependency for six characters. */
export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
