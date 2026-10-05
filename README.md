# Duri Date Backend

> 최신 상태(2026-10-05): 사용자 명시 승인으로 네이버 로컬 저장 활성화 및 지도별 API 연결 적용 완료. 실제 HTTP 후보 선택 → resolved/mapped → SQLite 저장 검증 통과. 제공사 허가 취득과 모바일 공유 검증을 뜻하지 않습니다. 자세한 내용은 `docs/naver-integration.md`, 근거는 `docs/naver-storage-verification.json`을 확인하세요. 이전 비활성/차단 기록은 이 상태로 대체됩니다.

> 2026-10-05: 네이버 무료 지역 검색 실제 연동 검증 완료. 인증·HTTP 200·공개 질의 10개 확인. 일반 작업의 네이버 영구 저장을 로컬에서 활성화했습니다. 자세한 현재 범위는 [네이버 연동](docs/naver-integration.md) 문서를 확인하세요. Frontend 연결과 Render 배포는 사용자 측 담당입니다.

> 최신 상태(2026-10-03): 사용자의 확인 생략·진행 요청에 따라 **로컬 카카오 장소/지역 저장을 활성화**했습니다. 제공사 허가를 취득한 것은 아닙니다. `data/local/settings.json`의 `kakaoStorageEnabled`로 설정하며 기본 예제와 운영 환경 설정은 여전히 비활성입니다. 결제·문의 전송·Frontend 변경은 하지 않았습니다. 실제 HTTP 접수→resolved→mapped→SQLite 저장→검증 작업 삭제를 확인했습니다. 입력은 공개 API 결과로 구성한 검증용 입력이며 모바일 공유 정확도 증거가 아닙니다.

공유 장소 판별용 NestJS API입니다. 기존 보드·카드·데이트 API를 유지하며, 장소 판별 작업은 별도로 저장합니다. Frontend 코드는 변경하지 않았고 자동으로 앱에 결과를 적용하지 않습니다.

## 실행

Node.js 24 LTS를 사용합니다 (`.nvmrc`). SQLite는 Node 내장 `node:sqlite`를 사용하므로 별도 DB 설치가 필요 없습니다. Node 버전에 따라 experimental 경고가 표시될 수 있습니다.

```bash
nvm use
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# 출력한 값을 .env의 JWT_SECRET에 설정합니다. Git에 올리지 마세요.
npm run build
npm run start:prod
```

- API: `http://127.0.0.1:3000/api/v1`
- 개발 Swagger: `http://127.0.0.1:3000/api/docs`
- OpenAPI 파일: [docs/openapi.json](docs/openapi.json)
- 상태 확인: `GET /api/v1/health`
- 외부 기기에서 접근하려면 `HOST=0.0.0.0` 및 방화벽·HTTPS 리버스 프록시를 별도 설정합니다.
- 기본 JWT나 빈 JWT_SECRET은 기동을 거부합니다. CORS는 설정한 origin만 허용합니다.
- 신규 DB에는 데모 계정이 자동 생성되지 않습니다. 일반 회원가입을 사용하거나 개발용 빈 DB에서만 `npm run seed:demo`를 실행합니다. 기존 데모 계정이 있는 DB는 production 기동을 거부합니다.

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

실제 조회에는 `KAKAO_REST_API_KEY` 또는 `NAVER_HUB_CLIENT_ID`·`NAVER_HUB_CLIENT_SECRET` (신규 NAVER API HUB)이 필요합니다. `PLACE_LOOKUP_PROVIDER=source`는 공유 출처와 같은 제공사로 검색합니다. `kakao` 또는 `naver`로 조회 제공사를 명시할 수도 있으며, 원본 제공사와 조회 제공사는 혼동하지 않습니다.

**키만 설정해도 외부 장소 데이터를 무조건 저장하지 않습니다.** 본 앱의 사용·보관 기간이 허용됨을 확인한 뒤 해당 제공사의 `*_PLACE_STORAGE_APPROVED=true`를 설정합니다. 파생 지역 저장을 별도로 승인받은 경우에만 `*_REGION_STORAGE_APPROVED=true`를 설정합니다. 승인 플래그는 법적 허용의 증거가 아니며 운영자가 증빙을 확보해야 합니다.

- 미설정 키: `failed / PROVIDER_NOT_CONFIGURED`, 자동 재시도 없음.
- 장소 저장 미승인: `failed / PLACE_STORAGE_POLICY_BLOCKED`, 외부 API 호출 없음.
- 장소 저장 승인, 지역 저장 미승인: 장소는 확정 가능하며 지역은 `policy_blocked`.
- 장소명 없는 URL만의 입력: 안전한 분류·단축 URL 확장 후 `needs_confirmation / PLACE_NAME_REQUIRED`. 이름을 보완하고 inputRevision을 올려 새 작업을 제출합니다.
- 실제 공유 정답 샘플이 없어 실제 공유 판별 정확도·비용·Android/iOS 공유는 아직 미검증입니다. 공개 검색 지연은 아래 별도 검사에서만 측정했습니다. fixture 테스트 통과를 실서비스 검증으로 보지 않습니다.

## 저장·작업 처리

SQLite WAL + FULL synchronous 트랜잭션으로 갱신합니다. MVP에서는 기존 보드 자료와 작업들을 단일 JSON 상태 행에 저장합니다. 독립 프로세스 간 쓰기도 SQLite가 직렬화하며, 저장 실패 시 변경이 공개되지 않습니다. 서버 확장·대량 데이터용 정규화된 DB는 후속 단계입니다. 동일한 로컬 SQLite 파일을 공유하는 단일 호스트 구성을 사용하고, 네트워크 파일시스템으로 공유하지 마세요.

`DATABASE_FILE`은 기본 `data/store.sqlite`입니다. 새 SQLite DB에 한해 `LEGACY_DATA_FILE` 또는 기존 `DATA_FILE`이 가리키는 JSON을 가져옵니다. 기존 JSON 파일을 수정·덮어쓰지 않습니다. JSON 손상은 서버 시작 실패로 처리합니다. schema version 1은 `schema_migrations`에 기록됩니다.

접수와 큐 저장은 같은 트랜잭션입니다. worker는 250ms 간격으로 저장된 작업을 찾고 35초 lease를 원자적으로 획득합니다. 단일 작업은 30초, 개별 네트워크 요청은 DNS·리다이렉트를 포함해 8초 제한입니다. 큐 대기 5분 초과는 실패 처리합니다. 재시작 후 queued 작업을 처리하고 죽은 worker의 lease를 회수합니다. 토큰이 다른 이전 worker는 결과를 덮어쓰지 못합니다.

일시 장애는 최대 3 attempt, 지수 지연으로 재시도하고 제공사의 Retry-After보다 먼저 실행하지 않습니다. 정책·키 설정 오류, 잘못된 입력은 자동 재시도하지 않습니다. 후보는 15분, 작업·원문·멱등 키는 7일 보관한 뒤 worker가 삭제합니다. 기간을 넘는 재시도는 허용하지 않습니다. 삭제 이후에는 멱등 키 보장이 종료됩니다.

## 검증·운영

```bash
npm run typecheck
npm test
npm run openapi
npm run backup -- /absolute/new-backup.sqlite
npm run poc -- /private/real-samples.json /private/new-results.json
```

테스트는 임시 또는 메모리 DB만 사용합니다. HTTP 테스트는 localhost의 임시 포트를 열기 때문에 이를 허용하는 환경에서 실행해야 합니다.

[검증 보고서](docs/verification.md), [지역 매핑 규칙](docs/regions.md), [배포와 롤백](docs/operations.md)을 참조하세요. 운영 지표는 32자 이상 별도 `OPERATIONS_TOKEN`을 설정하고 `X-Operations-Token` 헤더로 `/api/v1/operations/metrics`를 조회합니다. 토큰 미설정·불일치는 404입니다. 지표는 프로세스별 메모리 집계이며 재시작 시 초기화됩니다.


## 2026-10-03 공급자 및 운영 검증

- 카카오: 사용자 선택으로 기존 대학가이드 앱을 사용합니다. 실제 연결 성공 후 공개 기관 10곳을 비교해 10곳 모두 유일한 정확 이름 후보 및 기대 지역 일치를 확인했습니다. 총 21회 API 요청, 검색·지역 확인 흐름 p50 115ms / p95 260ms입니다. 실제 모바일 공유 정확도는 산출하지 않았습니다.
- 네이버: API HUB/legacy 코드는 지원하지만 계정 키 미설정으로 실호출은 아직 없습니다.
- 운영: 격리된 production 프로세스의 기동·worker·재시작·온라인 백업·복구·복원 계정 로그인이 통과했습니다. 외부 서버 배포는 아직 수행하지 않았습니다.
- 저장 정책: 장소·파생 지역 저장 플래그는 여전히 false입니다. 연결 성공이 저장 허용을 의미하지 않습니다. [문의 초안](docs/provider-inquiries.md)은 아직 전송하지 않았습니다.

[현재 남은 항목과 근거](docs/backend-completion.md), [공개 검색 결과](docs/public-query-results.json), [운영 검사 결과](docs/production-verification.json)를 확인하세요.

```bash
npm run probe:public -- /private/new-public-results.json
npm run verify:production -- /private/new-production-results.json
node scripts/release-package.cjs /private/new-backend.tar.gz
```

새 네이버 앱은 API HUB 인증을 사용합니다. 기존 Developers 키만 `NAVER_API_MODE=legacy`와 NAVER_CLIENT_ID/SECRET을 사용합니다. `npm run providers:check`는 저장 플래그와 독립된 연결 진단이며 장소 원문을 기록하지 않습니다.

## 결제 없는 로컬 실행

`npm run start:local` 실행 후 http://127.0.0.1:3100/api/docs 에서 API를 확인합니다. 로그인/작업 접수·조회와 원문 링크 처리 등을 검증할 수 있습니다. 데이터는 별도 `data/local/store.sqlite`, 생성한 로그인 비밀키는 `data/local/jwt-secret`에 보존합니다. 기존 사용자 DB를 이관하지 않습니다. 장소 검색·지역 자동 저장은 정책 미확정으로 비활성입니다. 결제·유료 서비스·클라우드 서버를 생성하지 않습니다.

PoC 샘플의 `validPlaceSample: true`는 검증자가 유효한 장소 공유로 확인한 샘플에만 지정합니다. 자동 확정률의 분모에서 검색/경로 등 비장소 입력을 제외하며, 이 표시가 없으면 확정률을 산출하지 않습니다. 외부 호출 0건은 `no_external_request`로 표시합니다. 기대 결과 불일치 또는 미완료 작업이 있으면 PoC 종료 코드는 2입니다.
