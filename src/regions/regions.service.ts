import { Injectable, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { regions, validateRegionCatalog } from './regionCatalog';
import type { RegionResult } from '../resolutions/resolution.types';
export const CATALOG_VERSION = 'app-' + createHash('sha256').update(JSON.stringify(regions)).digest('hex').slice(0,16);
const ALIASES: Record<string,string> = { '강원도':'province:gangwon', '강원특별자치도':'province:gangwon',
  '전라북도':'province:jeonbuk', '전북특별자치도':'province:jeonbuk', '제주도':'province:jeju' };
// The app catalog represents these cities at city level, not their subordinate wards.
const CITY_WARDS: Record<string,string[]> = {
  '수원시':['장안구','권선구','팔달구','영통구'], '성남시':['수정구','중원구','분당구'],
  '안양시':['만안구','동안구'], '안산시':['상록구','단원구'], '고양시':['덕양구','일산동구','일산서구'],
  '용인시':['처인구','기흥구','수지구'], '부천시':['원미구','소사구','오정구'],
  '청주시':['상당구','서원구','흥덕구','청원구'], '천안시':['동남구','서북구'],
  '전주시':['완산구','덕진구'], '포항시':['남구','북구'], '창원시':['의창구','성산구','마산합포구','마산회원구','진해구'],
};
@Injectable()
export class RegionsService {
  constructor() { if (validateRegionCatalog().length) throw new Error('INVALID_REGION_CATALOG'); }
  manifest() { return { version: CATALOG_VERSION, sourceFrontendSha: 'fc51355dc9c3eb087683eef610ca7b3dcb0f0f43', regions }; }
  assertVersion(version: string) { if (version !== CATALOG_VERSION) throw new ConflictException({code:'CATALOG_VERSION_MISMATCH',catalogVersion:CATALOG_VERSION}); }
  empty(reason = 'ADDRESS_MISSING', blocked = false): RegionResult {
    return {status: blocked ? 'policy_blocked' : 'unmapped', provinceId:null,districtId:null,dateAreaId:null,catalogVersion:CATALOG_VERSION,reasonCodes:[reason]};
  }
  mapAddress(address: string): RegionResult {
    const parts = address.trim().split(/\s+/);
    const province = regions.find(r => r.kind === 'province' && (r.name === parts[0] || r.shortName === parts[0] || r.id === ALIASES[parts[0]]));
    if (!province || !province.selectable) return this.empty('UNKNOWN_OR_INACTIVE_PROVINCE');
    const base: RegionResult = {...this.empty('DISTRICT_MISSING'),status:'partial',provinceId:province.id};
    const district = regions.find(r => r.kind === 'district' && r.parentId === province.id && r.name === parts[1]);
    if (!district || !district.selectable) return {...base, reasonCodes:['UNKNOWN_OR_INACTIVE_DISTRICT']};
    const ward = parts[2];
    if (ward?.endsWith('구') && !CITY_WARDS[district.name]?.includes(ward)) return {...base,reasonCodes:['UNRECOGNIZED_SUBDISTRICT']};
    return {...base,status:'mapped',districtId:district.id,reasonCodes:[ward?.endsWith('구') ? 'EXPLICIT_CITY_WARD_MAPPING' : 'PARENT_AND_DISTRICT_MATCH']};
  }
  validateCoordinates(longitude: number, latitude: number) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new Error('INVALID_WGS84_COORDINATES');
    }
  }
  reconcile(address: RegionResult, coordinate: RegionResult): RegionResult {
    if (address.provinceId && coordinate.provinceId && (address.provinceId !== coordinate.provinceId ||
        (address.districtId && coordinate.districtId && address.districtId !== coordinate.districtId))) return this.empty('ADDRESS_COORDINATE_CONFLICT');
    return address.status === 'mapped' ? address : coordinate.status === 'mapped' ? coordinate : address.provinceId ? address : coordinate;
  }
}
