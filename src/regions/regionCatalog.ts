import { REGION_DATA } from './regionData';

export type RegionKind = 'province' | 'district' | 'date-area';

export type RegionOption = {
  /** App-owned identifier. Keep it when changing the name or order. */
  id: string;
  name: string;
  shortName?: string;
  kind: RegionKind;
  parentId: string | null;
  recommended: boolean;
  selectable: boolean;
  order: number;
};

export const regions = REGION_DATA;

export function validateRegionCatalog(catalog: readonly RegionOption[] = regions): string[] {
  const errors: string[] = [];
  const byId = new Map<string, RegionOption>();
  for (const region of catalog) {
    if (!region.id || !region.name) errors.push(`Empty region ID or name: ${region.id}`);
    if (byId.has(region.id)) errors.push(`Duplicate region ID: ${region.id}`);
    byId.set(region.id, region);
  }
  for (const region of catalog) {
    if (region.kind === 'province' && region.parentId !== null) errors.push(`Province has parent: ${region.id}`);
    if (region.kind !== 'province' && !region.parentId) errors.push(`Missing parent: ${region.id}`);
    if (region.parentId && !byId.has(region.parentId)) errors.push(`Unknown parent: ${region.id}`);
    if (region.kind === 'district' && byId.get(region.parentId ?? '')?.kind !== 'province') {
      errors.push(`District parent is not a province: ${region.id}`);
    }
    if (region.kind === 'date-area' &&
        !['province', 'district'].includes(byId.get(region.parentId ?? '')?.kind ?? '')) {
      errors.push(`Date area parent is not a province or district: ${region.id}`);
    }
  }
  for (const region of catalog) {
    const seen = new Set<string>();
    let current: RegionOption | undefined = region;
    while (current) {
      if (seen.has(current.id)) { errors.push(`Region cycle: ${region.id}`); break; }
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return errors;
}

export function getRegionById(id: string | null | undefined, catalog: readonly RegionOption[] = regions) {
  return id == null ? undefined : catalog.find((region) => region.id === id);
}

export function isSelectableRegionId(id: unknown, catalog: readonly RegionOption[] = regions): id is string {
  return typeof id === 'string' && Boolean(getRegionById(id, catalog)?.selectable);
}

function matches(region: RegionOption, query: string) {
  return region.name.toLocaleLowerCase('ko-KR').includes(query) ||
    region.shortName?.toLocaleLowerCase('ko-KR').includes(query) === true;
}

function ordered(options: RegionOption[]) {
  return options.sort((left, right) => left.order - right.order ||
    left.name.localeCompare(right.name, 'ko-KR') || left.id.localeCompare(right.id));
}

function belongsToProvince(region: RegionOption, provinceId: string, catalog: readonly RegionOption[]) {
  if (region.kind === 'district') return region.parentId === provinceId;
  if (region.kind !== 'date-area') return false;
  const parent = getRegionById(region.parentId, catalog);
  return parent?.kind === 'province' ? parent.id === provinceId :
    parent?.kind === 'district' && parent.parentId === provinceId;
}

/** The choices shown after browsing a province, including areas under its districts. */
export function listRegionChoices(provinceId: string, query = '', catalog: readonly RegionOption[] = regions) {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  return ordered(catalog.filter((region) => region.selectable &&
    belongsToProvince(region, provinceId, catalog) && (!normalized || matches(region, normalized) ||
      (region.kind === 'date-area' && matches(getRegionById(region.parentId, catalog)!, normalized)))));
}

export function listProvinces(query = '', catalog: readonly RegionOption[] = regions) {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  return ordered(catalog.filter((region) => region.kind === 'province' &&
    (region.selectable || listRegionChoices(region.id, '', catalog).length > 0) &&
    (!normalized || matches(region, normalized) || listRegionChoices(region.id, normalized, catalog).length > 0)));
}

export function listRegionChildren(provinceId: string, query = '', catalog: readonly RegionOption[] = regions) {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  return ordered(catalog.filter((region) => region.parentId === provinceId && region.selectable &&
    (!normalized || matches(region, normalized))));
}

/** Reserved for a later curated date-area UI; the current list still shows every choice. */
export function listRecommendedRegions(parentId: string | null, catalog: readonly RegionOption[] = regions) {
  return ordered(catalog.filter((region) => region.parentId === parentId && region.recommended && region.selectable));
}

/** A short, parent-qualified label for the province's choice list. */
export function formatRegionChoice(region: RegionOption, catalog: readonly RegionOption[] = regions) {
  if (region.kind !== 'date-area') return region.name;
  const parent = getRegionById(region.parentId, catalog);
  return `${region.name} — ${parent?.kind === 'province' ? `${parent.shortName ?? parent.name} 전체` : parent?.name ?? '이전 지역'}`;
}

/** A display relationship only; parentId is not a geographic boundary. */
export function formatRegionId(id: string | null | undefined, catalog: readonly RegionOption[] = regions) {
  if (id == null) return '지역 미정';
  const region = getRegionById(id, catalog);
  if (!region) return `이전 지역 (${id})`;
  if (region.kind === 'province') return `${region.shortName ?? region.name} 전체`;
  const parent = getRegionById(region.parentId, catalog);
  if (parent?.kind === 'district' && region.kind === 'date-area') {
    const province = getRegionById(parent.parentId, catalog);
    return `${province?.shortName ?? province?.name ?? '이전 지역'} ${parent.name} ${region.name}`;
  }
  return parent ? `${parent.shortName ?? parent.name} ${region.name}` : region.name;
}
