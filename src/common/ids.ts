import { randomBytes, randomUUID } from 'node:crypto';
export function uniqueId(prefix: string, existing: Iterable<string>) {
  return `${prefix}-${randomUUID()}`;
}

export function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 6; i += 1) {
    value += alphabet[randomBytes(1)[0] % alphabet.length];
  }
  return value;
}

export function shareCardId(recordId: string) {
  return `share-card:${recordId}`;
}

export function isValidCalendarDay(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
