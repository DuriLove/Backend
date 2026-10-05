# 실행 배포 백업 롤백

## 환경과 보안

Node 24 LTS, `npm ci`, `npm run build`, `npm run start:prod`가 기본 명령입니다. .env.example은 변수 목록이며 실제 비밀 키는 포함하지 않습니다. JWT_SECRET은 32바이트 이상의 무작위 값이 필요합니다. JWT는 HS256, 고정 issuer/audience, 24시간 만료를 검증합니다. 비밀번호는 bcrypt cost 12, 최대 UTF-8 72바이트입니다. 회원가입·로그인에는 IP 제한이 적용됩니다. 새 DB에 샘플 사용자를 자동 생성하지 않습니다.

운영에서는 NODE_ENV=production, 명시적 DATABASE_FILE, 제한된 CORS_ORIGINS, 필요 시 HOST 설정, HTTPS 리버스 프록시를 사용합니다. 기본은 127.0.0.1 바인딩입니다. production에는 Swagger UI가 열리지 않습니다. reverse proxy의 X-Forwarded-For를 기본 신뢰하지 않으므로 로그인 IP 제한은 서버가 직접 보는 peer 기준입니다. 다중 프록시 배포는 신뢰 프록시 정책을 먼저 정해야 합니다.

## 마이그레이션

schema v1은 app_state, request_limits, schema_migrations를 생성합니다. 기존 JSON이 지정되어 있고 SQLite가 빈 경우에만 하나의 트랜잭션으로 가져옵니다. JSON 파싱·구조 검증 실패 시 기동을 중단하고 원본을 보존합니다. 기본 계정으로 초기화하지 않습니다. 기존 JSON 파일은 복사 또는 백업 후 보관하세요. 재시작 시 이미 가져온 SQLite를 다시 JSON으로 덮어쓰지 않습니다.

SQLite는 WAL, synchronous=FULL, busy_timeout=5000을 사용합니다. DB 파일 권한은 0600입니다. 동일 호스트의 여러 worker가 같은 파일을 사용해도 claim과 state 갱신은 트랜잭션으로 직렬화합니다. 별도 컨테이너·호스트의 독립 파일 간 동기화는 제공하지 않습니다. MVP의 단일 상태 행은 대규모 조회/쓰기 처리량을 위한 구조가 아닙니다.

## 배포와 검증

1. 소스와 package-lock.json의 배포 버전을 고정합니다. 현재 작업을 커밋/태그한 뒤 배포하는 것을 권장합니다.
2. 운영 DB를 일관된 스냅샷으로 백업합니다: `npm run backup -- /safe/new-backup.sqlite`.
3. 같은 호스트의 테스트 환경에서 `npm ci`, `npm run typecheck`, `npm test`, `npm run openapi`를 실행합니다.
4. 기존 프로세스를 정상 종료하고 새 빌드를 시작합니다. 종료 시 worker가 먼저 마무리된 다음 DB 연결이 닫힙니다. 강제 종료된 worker는 lease 만료 후 복구됩니다.
5. GET /api/v1/health, 로그인 및 본인 작업 조회를 확인합니다. DB를 초기화하는 방식으로 오류를 해결하지 않습니다.

## 롤백

배포 전 코드와 SQLite 백업을 함께 보관합니다. 서버를 중단한 상태에서 백업으로 복구하고 해당 schema를 지원하는 이전 빌드를 실행합니다. WAL/SHM 파일을 포함한 실행 중 DB를 일반 파일 복사로 백업하지 마세요. 이 변경 이전 JSON 서버로 돌아가면 마이그레이션 이후의 SQLite 변경이 반영되지 않으므로, 원본 JSON으로 무조건 덮어써서는 안 됩니다. 다운그레이드 데이터 이관은 별도 변환이 필요합니다.

## 관측

X-Request-Id와 요청 메서드·HTTP 상태·소요시간을 기록합니다. worker는 작업 ID·상태·attempt·지연·오류 코드만 기록합니다. 토큰·공유 원문·외부 전체 응답·주소는 기본 로그에 출력하지 않습니다.

OPERATIONS_TOKEN을 설정한 경우 X-Operations-Token으로 GET /api/v1/operations/metrics를 조회합니다. HTTP와 제공사별 호출 수/실패 수, 작업 상태별 수, 최근 최대 1,024개 지연의 p50/p95를 반환합니다. 프로세스별 지표이고 재시작 시 초기화됩니다. 다중 인스턴스 장기 보관은 외부 모니터링 수집이 필요합니다. 호출 한도 카운터 자체는 SQLite에 보존됩니다.

## 실제 API PoC

`npm run poc -- /private/samples.json /private/new-results.json`는 운영 DB를 사용하지 않고 메모리 DB로 실제 공급자 API를 호출합니다. API 키와 정책 플래그가 설정되어야 합니다. 출력 경로가 이미 있으면 덮어쓰지 않습니다. 원문 샘플은 저장소 외부에 보관하세요.

입력은 배열입니다. 각 샘플은 sampleId, os, appVersion, input {sourceType,sharedText,sharedUrl?}, expected {status,provider?,providerPlaceId?,provinceId?,districtId?}를 갖습니다. 실제 지도 공유별 최소 10개, Android/iOS, 이름+주소·이름만·단축 URL·잘못된 링크·지점 혼동 사례를 준비하세요.

결과에는 sampleId, OS/appVersion, 입력 제공사, expected/actual, 판별 근거, 실패 코드, 호출 수, 지연, 후보 수가 포함됩니다. 제공사별 전체 샘플 수와 자동 확정 수를 분리합니다. 자동 확정 정확도는 자동 확정 샘플 전체에 검증 가능한 제공사 ID 정답이 있을 때만 계산하며, 네이버처럼 ID가 없는 경우 null로 두고 수동 정답 검증이 필요합니다. 요청 호출 수에는 단축 URL 확장도 포함합니다. 재시도 전체·비용·모바일 UI 검증은 이 1-attempt 측정에 포함하지 않습니다.

## 재현 가능한 운영 모드 검사

`npm run verify:production -- /private/new-production-results.json`은 실제 `dist/main.js`를 production으로 실행합니다. 임시 SQLite에서 가입·작업 처리, SIGTERM 종료, 재시작, 온라인 백업, 백업 파일로 재기동, 백업 이후 쓰기 제외, 복원 계정 로그인을 검사합니다. 기존 사용자 DB와 키를 외부로 전송하지 않습니다. 결과는 `docs/production-verification.json`입니다. 외부 호스팅 배포나 이전 코드 버전으로의 롤백을 검증했다는 의미는 아닙니다.

## 컨테이너 배포 패키지

Dockerfile은 Node 24 빌드/실행 단계를 분리하고 비루트 사용자로 실행합니다. `deploy/compose.yaml`은 로컬 127.0.0.1:3000만 공개하고 별도 영구 볼륨을 사용합니다. 현재 컴퓨터에 Docker가 없어 이미지 빌드와 Compose 실행은 미검증입니다.

1. 서버에서 `.env.example`을 참고해 `deploy/.env.production`을 만들고 권한을 0600으로 설정합니다. 무작위 JWT_SECRET을 설정하고 실제 지도 키는 이 파일에만 둡니다. 파일을 Git에 추가하지 않습니다.
2. `docker compose -f deploy/compose.yaml build`
3. `docker compose -f deploy/compose.yaml up -d`
4. 서버 안에서 `curl --fail http://127.0.0.1:3000/api/v1/health`
5. 도메인·TLS·신뢰 프록시 정책을 정한 뒤 외부 접근을 설정합니다. 정책 플래그는 증빙 없이 true로 바꾸지 않습니다.

Compose는 기존 JSON 자동 이관을 끕니다. 기존 DB 이관은 백업과 사용자 확인 후 별도 진행합니다. `down -v`는 사용자 DB를 삭제하므로 운영 절차로 사용하지 않습니다. 컨테이너 백업은 `docker compose -f deploy/compose.yaml exec api node scripts/backup.cjs /app/data/backup-YYYYMMDD.sqlite`로 새 파일을 만들고 안전한 보관 위치로 복사합니다.

`node scripts/release-package.cjs /private/new-backend.tar.gz`로 소스·잠금 파일·검증 문서·배포 설정과 파일별 SHA-256 manifest를 묶습니다. 비밀 설정, DB, Git, Frontend, 빌드 종속성은 포함하지 않습니다.

## 실제 공개 검색 비교

`npm run probe:public -- /private/new-public-results.json`은 공개 기관 10곳의 검색 후보와 독립적인 공식 주소 근거를 비교합니다. 제공사 응답은 메모리에서만 처리하고 결과 파일에는 일치 여부·호출 수·지연만 남깁니다. 저장 정책 플래그를 바꾸지 않으며 앱 HTTP 경로는 기존 차단을 유지합니다. provider adapter와 지역 매핑 코드의 연결 검증이며 공유 URL 파싱, 지점 자동 확정 정확도, 앱 UI를 검증하는 도구는 아닙니다.
