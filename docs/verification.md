# Backend 구현 검증 보고서

검증일: 2026-10-03 (Asia/Seoul). Node.js 24.19.0에서 빌드와 전체 테스트를 실행했습니다. Backend만 변경했습니다. 프론트는 코드·파일 변경 없이 지역 카탈로그만 읽어 Backend에 복사했습니다.

## 결과

- `npm run typecheck`: 통과.
- `npm test`: 32개 테스트 통과, 실패 0, skip 0. 실제 localhost HTTP 서버를 사용한 통합 테스트 포함.
- `npm run openapi`: 기동 및 OpenAPI/지역 manifest 생성 확인.
- 테스트 DB는 메모리 DB 또는 OS 임시 디렉터리의 SQLite입니다. 사용자 store.json을 테스트 대상으로 쓰지 않았습니다.
- Backend 기존 Git HEAD는 `893d558258841805dcd217a1423d91b75eab8580`입니다. 원래부터 소스가 대부분 미추적 상태였으며, 이번 변경은 로컬 작업 트리로 제공됩니다. 이 HEAD가 수정된 소스를 포함한다고 주장하지 않습니다. 실제 작업 트리 파일 해시는 source-manifest.json으로 확인할 수 있습니다.
- 기준 Frontend HEAD: `fc51355dc9c3eb087683eef610ca7b3dcb0f0f43`.

## 주요 재현과 수정 확인

| 분류 | 검증 내용 |
|---|---|
| 저장 안정성 | SQLite UPDATE 실패 주입 시 롤백, 다음 쓰기에 실패했던 값이 섞이지 않음, snapshot 외부 변경 차단 |
| 마이그레이션 | 기존 JSON 보존, 손상 JSON 시작 실패, SQLite 재시작 복원, 두 연결의 갱신 손실 방지 |
| 삭제 보호 | 공유 변환 후 카드 삭제·재변환 410, 중복 URL로 연결된 공유도 삭제 차단, 날짜/후보 참조 정리 |
| 기존 보드 회귀 | 보드 비회원 403, 2인 정원, 날짜 생성 동시 멱등성, 다른 입력/오래된 정렬 409 |
| 작업 계약 | 사용자별 키, 동시 중복 생성 억제, 입력 revision 충돌, 카탈로그 불일치 |
| 판별 | 이름+주소/ID 근거, 동명 후보, 다른 ID·지점명·주소 모순은 자동 확정 금지, no_match 구분 |
| 후보 | 위조·타인·만료 후보 차단, 같은 선택 연타 멱등, 다른 후보로 오래된 확정 차단 |
| 비동기 | queued 재시작 복원, 죽은 worker lease 회수, 다중 worker 중복 실행 차단, 이전 attempt 결과 차단 |
| 재시도 | 429 지연 준수, 조기 재시도 거부, 최대 3 attempt, 비정상 장기 Retry-After 방어, 큐 timeout |
| 지역 | 서울/부산 중구, 성남시 분당구, 별칭, 미지 지역 partial/unmapped, 좌표 뒤바뀜·잘못된 단위, 주소/좌표 충돌 |
| 정책 | 기본 장소 저장 차단 시 외부 호출 없음, 장소 resolved와 region policy_blocked 분리 |
| SSRF | scheme/host/userinfo/port, 사설·예약 IPv4/IPv6, 리다이렉트 DNS 재검증, IP 고정 연결, 전체 시간·수신 크기 제한 |
| HTTP | 회원가입/로그인/JWT, 401·403·404·409·413, 202 접수/조회/선택/삭제, 미정의 userId 입력 거부, Swagger 응답 스키마 |
| API HUB 및 오류 | 네이버 신규 API HUB 호스트·인증 헤더, legacy와 키 분리, 카카오 서비스 비활성화 403과 잘못된 인증 401 구분 |
| 공급자 adapter | 공식 응답 fixture에서 Kakao/Naver 필드 구분, 불필요한 원문 필드 제외, Naver ID/좌표 추측 금지 |

## 아직 검증되지 않은 항목

Duri의 카카오 REST API 키를 설정하고 공식 API 연결 검사를 수행했습니다. 실제 응답은 HTTP 403 `App(Duri) disabled OPEN_MAP_AND_LOCAL service.`이며, 서비스 미활성화 오류로 분류합니다. 최신 재검사 결과는 [live-provider-check.json](live-provider-check.json)에 기록했습니다. 이 보고서에는 키와 장소 응답 원문이 없습니다. 네이버 API HUB 키는 아직 미설정입니다.

실제 공유 입력 정확도 평가 샘플 수는 **0개**, 기존 앱 전환 전 성공한 실제 장소 검색은 **0건**, Android/iOS 실제 기기 검증은 **0회**입니다. 저장 허용 확인과 실제 공유 원문·정답 세트도 남아 있습니다. 따라서 실제 자동 확정 정확도, 지원율, 과금, 성공 응답 지연, 계정별 쿼터 수치는 산출하지 않았습니다. 정책 조사와 계정별 차단 사유는 [provider-investigation.md](provider-investigation.md)를 참고하세요.

실제 키와 정책 확인 후 scripts/poc.cjs로 제공사별 결과표를 만들 수 있습니다. 네이버 검색 결과의 장소 ID 부재와 URL-only 이름 부족은 명시적인 제한으로 남습니다. 후보가 구별되지 않으면 사용자의 외부 지도 확인이나 입력 보완이 필요합니다.

Frontend와의 연결, 삭제/편집/화면 이탈 후 coordinator 결과 적용, 모바일 OS 공유 수명주기는 Backend 단독 테스트로 완료 판정하지 않습니다. user 요청에 따라 Frontend는 수정하지 않았습니다.

SQLite 단일 상태 행은 초기 MVP를 위한 구조입니다. 운영 부하 테스트, 다중 호스트 분산 DB, refresh token/계정 복구 등 장기 인증 운영 기능, 모니터링 외부 수집은 별도 검증·확장이 필요합니다.

2026-10-03 최종 보존 검사: Frontend 추적 파일 496개의 SHA-256이 작업 전 기준과 일치하고, 기존 Backend `data/store.json`도 변경되지 않았습니다.

## 기존 앱 연결 확인 (2026-10-03)

사용자 선택에 따라 카카오 기존 앱 ‘대학가이드’(1289216)의 REST API 키를 Backend `.env`에 설정했습니다. 콘솔에서 카카오맵 ON 및 일간 무료 쿼터 대상임을 확인했습니다. 공식 키워드 검색 1회가 HTTP 200, 결과 1건, 158ms로 성공했습니다. 연결 검사의 공개 검색어는 국립중앙박물관입니다. 장소 응답 원문과 키는 보고서에 저장하지 않았습니다. 최신 결과: [live-provider-check-existing-app.json](live-provider-check-existing-app.json). 이전 Duri의 서비스 비활성화 기록은 과거 진단으로 보존합니다.

이 성공은 카카오 연결 확인이며 실제 공유 입력 정확도 평가가 아닙니다. 기존 앱과 쿼터를 공유합니다. 네이버 키는 미설정이고, 장소/지역 저장 정책 플래그는 확인 전 상태를 유지합니다.

## 추가 검증

2026-10-03: 전체 32개 자동 테스트 통과. CLI의 일회성 메모리 처리 후에도 운영 저장 차단이 유지됨을 회귀 테스트로 확인했습니다. 공개 기관 10곳의 카카오 검색·지역 비교 10/10 통과(21회 API 호출), 실제 공유 원문 0개입니다. 로컬 production 프로세스의 기동·Swagger 비노출·worker·재시작·백업·복원 로그인도 통과했습니다. 상세 수치는 public-query-results.json과 production-verification.json에 있습니다. Docker 미설치로 이미지 빌드/Compose는 미검증, 외부 배포도 미실행입니다.

추가 실제 링크 검사: 공식 기관의 네이버 지도 단축 링크와 비지도 폼 링크 2개 검증 통과. 선택 장소가 포함된 `/p/search/검색어/place/ID` 형식의 오분류를 수정했습니다. `scripts/verify-public-links.cjs`와 `docs/public-link-results.json`으로 재현할 수 있습니다. 모바일 OS 공유 샘플로 집계하지 않습니다.

결제 없는 로컬 실행기(127.0.0.1:3100)를 실제 기동해 health와 Swagger HTTP 200을 확인했습니다. PoC 미일치/정책 차단 음성 검사를 실행해 종료 코드 2, passed=false, 외부 호출 0건 표시를 확인했습니다. 외부 API 호출은 하지 않았습니다.
