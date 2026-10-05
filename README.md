# Duri Date Backend

공유 장소 판별용 NestJS API입니다. 기존 보드·카드·데이트 API를 유지하며, 장소 판별 작업은 별도로 저장합니다.

**Frontend는 수정하지 않았습니다.** 프론트 연결은 친구가, Render 배포는 사용자가 담당합니다. 결제나 유료 서비스는 추가하지 않았습니다.

## 2026-10-05 작업

오늘 `/Users/iyunji/Desktop/tourmate/Backend`에서 네이버 실제 API 연동과 저장 활성화를 마무리했습니다.

### 1. 네이버 무료 검색 API 신청

- NAVER API HUB에 `duri-backend` 애플리케이션 생성.
- 네이버 지역 검색만 등록.
- 호출 한도: 일 1,000회 / 월 10,000회.
- 결제수단은 사용자가 직접 등록했습니다. 이 저장소에서 결제·유료 서비스를 추가하지 않았습니다.

### 2. 다른 유료 서비스 확인

- 콘솔 통합 서비스 이용 현황에서 NAVER API HUB 1건만 확인.
- 결제 내역 없음. 10월 비용 분석에도 이용 내역 없음.
- 비용 분석은 전날까지 반영되므로 실시간 비용 확정으로 해석하면 안 됩니다.

### 3. 네이버 인증 정보 적용 및 실제 연결

로컬 `.env`에만 적용했습니다. 키는 소스·README·보고서에 기록하지 않습니다.

- `NAVER_API_MODE=hub`
- `NAVER_HUB_CLIENT_ID`
- `NAVER_HUB_CLIENT_SECRET`
- `.env` 권한 0600, Git 제외 확인.
- 네이버·카카오 실제 검색 모두 HTTP 200 확인.

### 4. 실제 검색·지역 분류 검증

공개 기관 10곳을 두 API로 검색했습니다. 실제 휴대폰 공유 링크 테스트가 아닙니다.

| 제공사 | 정확한 이름 | 지역 |
|---|---|---|
| 카카오 | 10곳 일치 | 10곳 일치 |
| 네이버 | 9곳 일치 | 해당 지역 9곳 일치 |

수원시청은 정확한 이름 후보가 없어 성공으로 집계하지 않았습니다.

### 5. 네이버 결과 저장 활성화

사용자가 “저장해”라고 명시한 뒤에만 적용했습니다. 제공사의 저장 허가를 별도로 취득했다는 의미는 아닙니다.

`scripts/start-local.cjs`가 `data/local/settings.json`을 읽습니다.

```json
{
  "kakaoStorageEnabled": true,
  "naverStorageEnabled": true,
  "lookupProvider": "source",
  "enabledBy": "user_request",
  "providerPermissionVerified": false
}
```

- 로컬 실행 시 네이버 장소·지역 저장 플래그 활성화.
- 네이버 링크에는 네이버 API, 카카오 링크에는 카카오 API (`PLACE_LOOKUP_PROVIDER=source`).

### 6. 실제 작업 API → DB 저장 검증

로컬 서버 재시작 후 실제 네이버 검색으로 확인했습니다.

- 202 접수 → `needs_confirmation` → 후보 선택 → `resolved` → 지역 `mapped` → SQLite 저장.
- 네이버 검색 응답에 없는 장소 ID를 임의로 만들지 않음.
- 검증용 장소 작업은 삭제.
- 합성한 지도 URL 테스트이므로 모바일 공유 정확도 증거로 사용하면 안 됩니다.

### 검증 및 보존 상태

- 기존 자동 테스트 32개 통과.
- 저장 활성화 후 실제 HTTP·SQLite 검증 통과.
- Frontend 기존 파일 변경 없음.
- 기존 `Backend/data/store.json` 변경 없음.
- 로컬 검증 데이터는 별도 `data/local/store.sqlite` 사용.
- 로컬 API: http://127.0.0.1:3100
- Swagger: http://127.0.0.1:3100/api/docs

관련 문서: [docs/naver-integration.md](docs/naver-integration.md), [docs/naver-live-connectivity.json](docs/naver-live-connectivity.json), [docs/public-query-results-20261005.json](docs/public-query-results-20261005.json), [docs/naver-storage-verification.json](docs/naver-storage-verification.json), [docs/backend-completion.md](docs/backend-completion.md), [docs/verification.md](docs/verification.md)

### 남은 작업과 주의사항

- 실제 아이폰·안드로이드에서 공유한 네이버·카카오 링크로 최종 검증은 미완료.
- 프론트 연결과 Render 배포는 이번 작업 범위에서 제외.
- `npm run start:prod` / Render에는 로컬 `settings.json`이 적용되지 않습니다. 네이버 키와 아래 환경변수를 별도로 넣어야 합니다.

```
NAVER_API_MODE=hub
PLACE_LOOKUP_PROVIDER=source
NAVER_PLACE_STORAGE_APPROVED=true
NAVER_REGION_STORAGE_APPROVED=true
```

- JWT, DB 영속 저장, CORS, 카카오 키 등 나머지 운영 설정도 [배포 지침](docs/operations.md)을 따릅니다.
- 현재 상태는 백엔드 구현·실제 API 연결·로컬 저장 검증 완료입니다. 실기기 검증과 외부 배포까지 완료된 상태는 아닙니다.

---

## 로컬 실행

Node.js 24 LTS를 사용합니다 (`.nvmrc`). SQLite는 Node 내장 `node:sqlite`를 사용합니다.

```bash
nvm use
npm ci
cp .env.example .env
# JWT_SECRET과 지도 API 키를 .env에 넣습니다. Git에 올리지 마세요.
npm run build
npm run start:local
```

- 로컬 API: `http://127.0.0.1:3100/api/v1`
- 로컬 Swagger: `http://127.0.0.1:3100/api/docs`
- 데이터: `data/local/store.sqlite`, JWT: `data/local/jwt-secret`
- 기존 사용자 DB를 이관하지 않습니다. 결제·유료 서비스·클라우드 서버를 이 명령으로 생성하지 않습니다.

운영형 기동(`npm run start:prod`)은 기본 `http://127.0.0.1:3000`입니다. 기본 JWT나 빈 `JWT_SECRET`은 기동을 거부합니다. CORS는 설정한 origin만 허용합니다. 신규 DB에는 데모 계정이 자동 생성되지 않습니다.

## 구현한 API

기존 API는 `/auth`, `/boards`, `/links/unfurl` 아래에 유지됩니다. 새 API도 동일한 `/api/v1` prefix를 사용합니다.

| API | 동작 |
|---|---|
| POST /place-resolutions | 인증된 사용자 소유 작업을 영구 접수하고 202 반환 |
| GET /place-resolutions/:id | 상태, revision, 후보, 확정 장소, 지역, 실패·재시도 정보 |
| POST /place-resolutions/:id/selection | 서버 후보 ID와 expectedRevision으로 확정 |
| POST /place-resolutions/:id/retry | 재시도 가능한 실패만 멱등 재접수 |
| DELETE /place-resolutions/:id | 본인 작업·원문·결과 삭제, 늦은 worker 결과 무시 |
| GET /region-catalog | 프론트와 동일한 지역 ID의 버전 있는 manifest |

사용 예시는 [docs/api-examples.md](docs/api-examples.md), 입력 지원 범위와 저장 정책은 [docs/provider-policy.md](docs/provider-policy.md)에 있습니다.

## 지도 제공사 설정

실제 조회에는 `KAKAO_REST_API_KEY` 또는 `NAVER_HUB_CLIENT_ID`·`NAVER_HUB_CLIENT_SECRET`(NAVER API HUB)이 필요합니다. `PLACE_LOOKUP_PROVIDER=source`는 공유 출처와 같은 제공사로 검색합니다.

**키만 설정해도 외부 장소 데이터를 무조건 저장하지 않습니다.** 로컬은 `data/local/settings.json`으로 저장 플래그를 켭니다. 운영은 해당 제공사의 `*_PLACE_STORAGE_APPROVED=true`, 파생 지역은 `*_REGION_STORAGE_APPROVED=true`를 환경변수로 설정합니다. 승인 플래그는 법적 허용의 증거가 아닙니다.

- 미설정 키: `failed / PROVIDER_NOT_CONFIGURED`, 자동 재시도 없음.
- 장소 저장 미승인: `failed / PLACE_STORAGE_POLICY_BLOCKED`, 외부 API 호출 없음.
- 장소 저장 승인, 지역 저장 미승인: 장소는 확정 가능하며 지역은 `policy_blocked`.
- 장소명 없는 URL만의 입력: `needs_confirmation / PLACE_NAME_REQUIRED`.
- 새 네이버 앱은 API HUB 인증을 사용합니다. 기존 Developers 키만 `NAVER_API_MODE=legacy`와 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`을 사용합니다.

## 저장·작업 처리

SQLite WAL + FULL synchronous 트랜잭션으로 갱신합니다. `DATABASE_FILE` 기본값은 `data/store.sqlite`입니다. 로컬 실행기는 `data/local/store.sqlite`를 씁니다. 기존 JSON 파일(`data/store.json`)은 수정·덮어쓰지 않습니다.

접수와 큐 저장은 같은 트랜잭션입니다. worker는 250ms 간격으로 저장된 작업을 찾고 35초 lease를 원자적으로 획득합니다. 일시 장애는 최대 3 attempt입니다.

## 검증·운영

```bash
npm run typecheck
npm test
npm run openapi
npm run providers:check
npm run backup -- /absolute/new-backup.sqlite
```

테스트는 임시 또는 메모리 DB만 사용합니다. [검증 보고서](docs/verification.md), [지역 매핑 규칙](docs/regions.md), [배포와 롤백](docs/operations.md)을 참조하세요.
