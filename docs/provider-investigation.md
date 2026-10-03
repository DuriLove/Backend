# 실제 제공사 연동과 정책 조사

조사일: 2026-10-03. Backend만 변경했으며 Frontend는 그대로 유지합니다.

## 카카오 실제 접근 확인

사용자가 생성한 Duri 앱의 기존 REST API 키를 로컬 .env에 설정했습니다. 키 평문은 보고서·Git·명령 출력에 포함하지 않았습니다.

공개 장소명으로 공식 키워드 검색을 요청한 최초 결과는 HTTP 403이었습니다. 공급자 오류는 `NotAuthorizedError`, 의미는 Duri 앱의 `OPEN_MAP_AND_LOCAL` 서비스 비활성화입니다. 인증 키가 없다는 뜻과 구분해야 하므로 백엔드 오류 코드 `PROVIDER_SERVICE_DISABLED`를 추가했습니다. 이후 연결 상태는 `live-provider-check.json`을 우선 확인합니다.

이 요청은 실제 서버에 도달한 접근 권한 검증입니다. 장소 검색 성공, 공유 입력 판별 정확도, 모바일 테스트 통과로 계산하지 않습니다. 원문 응답은 저장하지 않았습니다.

## 카카오 저장 정책의 불확실성

[2026-08-21 공식 답변](https://devtalk.kakao.com/t/api-id-place-url/151265)은 사용자가 직접 확정한 장소 ID·이름·URL 저장을 해당 문의 범위에서 허용했습니다. 그러나 [2026-09-15 다른 공식 답변](https://devtalk.kakao.com/t/local-api/151645)은 ID·URL 저장만 가능하고 이름·주소·좌표의 저장 활용은 불가하다고 안내했습니다. 두 문의의 맥락이 다르며, 하나를 본 앱의 자동 저장·후보 캐시·파생 지역 저장 허가로 일반화하지 않습니다.

결론: 정책 조사 자체는 수행했습니다. 앱별 확인이 남아 있으므로 PLACE_STORAGE_APPROVED와 REGION_STORAGE_APPROVED 기본 차단을 유지합니다. API 호출 가능과 DB 저장 가능은 다른 조건입니다. 연결 진단은 결과를 저장하지 않고 독립적으로 실행할 수 있습니다.

공식 운영 정책: https://developers.kakao.com/terms/ko/site-policies

## 네이버 신규 신청 경로 변경

[공식 공지](https://developers.naver.com/notice/?page=1)와 [이관 가이드](https://guide.ncloud-docs.com/docs/apihub-migration)를 확인했습니다. Developers 검색 API의 신규 신청 종료 뒤 신규 앱은 NAVER API HUB를 사용합니다. 기존 Developers 인증과 신규 API HUB 인증은 서로 교환할 수 없습니다.

Backend에 아래 두 프로파일을 구현하고 인증 정보가 다른 호스트로 섞여 전송되지 않는 테스트를 추가했습니다.

| 프로파일 | 호스트와 경로 | 환경 변수 |
|---|---|---|
| hub (기본) | naverapihub.apigw.ntruss.com/search/v1/local | NAVER_HUB_CLIENT_ID, NAVER_HUB_CLIENT_SECRET |
| legacy | openapi.naver.com/v1/search/local.json | NAVER_CLIENT_ID, NAVER_CLIENT_SECRET |

API HUB는 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY 헤더를 사용합니다. 기존 키는 X-Naver-Client-Id / X-Naver-Client-Secret을 사용합니다. 양쪽 모두 안전한 HTTP 클라이언트·공급자 호출 예산을 거칩니다.

[공식 지역 검색 명세](https://api.ncloud-docs.com/docs/naver-api-hub-search-local), [공식 공통 인증 명세](https://api.ncloud-docs.com/docs/naver-api-hub-overview)를 기준으로 구현했습니다. 실제 신규 계정 키를 발급받기 전에는 성공 호출 검증으로 표시하지 않습니다.

[기존 Developers FAQ](https://developers.naver.com/products/intro/faq/faq.md)는 단순 부하 감소 캐시 외의 저장·재가공을 원칙적으로 제한합니다. 신규 API HUB에는 해당 계정의 적용 약관 확인도 필요합니다. 7일 보관이나 파생 지역 저장이 자동 허용된다고 보지 않습니다.

## 앱별 정책 문의 초안

아래는 발송하지 않은 초안입니다. 계정 소유자의 승인 없이 외부 메시지를 보내지 않았습니다.

> Duri는 사용자가 직접 공유한 장소를 개인 데이트 계획 카드에 연결하는 앱입니다. 사용자가 제출한 원문·URL과 외부 API 검색 결과를 구분합니다. 외부 원문 응답·주소·좌표·전화·분류는 DB나 로그에 보관하지 않습니다. 다음 사용 범위가 허용되는지 문의드립니다.
>
> 1. 판별 후보의 제공사 ID·이름·URL을 최대 15분 동안 보관하고 본인에게 제시하는 방식.
> 2. 이름+주소 또는 동일 제공사 ID 일치로 자동 확정한 결과와 사용자가 직접 선택한 결과를 구분하여, ID·이름·URL을 최대 7일 보관하는 방식.
> 3. 주소 또는 좌표에서 계산한 앱 자체 provinceId·districtId를 보관하고 개인 카드 필터에 사용하는 방식.
> 4. 1~3이 제한된다면, 사용자가 직접 선택한 ID·URL만 보관하고 상세 정보는 외부 지도 링크로 연결하는 대안.
> 5. 출처 표시, 만료·삭제, 다른 지도와 함께 표시할 때 필요한 조건.

## 남은 외부 의존성

- Duri 카카오맵 제품 사용 활성화와, 표시되는 경우 계정 소유자의 약관 확인.
- 신규 네이버 API HUB 계정/앱 및 키, 적용 이용 조건 확인.
- 실제 OS 공유 원문과 독립적으로 확인된 지점 정답을 이용한 종단 정확도 측정.
- 배포 대상 계정과 운영 환경. 임의 유료 서버나 서비스 가입은 하지 않습니다.

## 기존 앱 연결 확인 (2026-10-03)

사용자 선택에 따라 카카오 기존 앱 ‘대학가이드’(1289216)의 REST API 키를 Backend `.env`에 설정했습니다. 콘솔에서 카카오맵 ON 및 일간 무료 쿼터 대상임을 확인했습니다. 공식 키워드 검색 1회가 HTTP 200, 결과 1건, 158ms로 성공했습니다. 연결 검사의 공개 검색어는 국립중앙박물관입니다. 장소 응답 원문과 키는 보고서에 저장하지 않았습니다. 최신 결과: [live-provider-check-existing-app.json](live-provider-check-existing-app.json). 이전 Duri의 서비스 비활성화 기록은 과거 진단으로 보존합니다.

이 성공은 카카오 연결 확인이며 실제 공유 입력 정확도 평가가 아닙니다. 기존 앱과 쿼터를 공유합니다. 네이버 키는 미설정이고, 장소/지역 저장 정책 플래그는 확인 전 상태를 유지합니다.

## 네이버 계정 상태 (2026-10-03 후속)

사용자 로그인 후 console.ncloud.com/dashboard에서 서비스 이용이 불가능한 계정이라는 안내가 표시됐습니다. 미등록 결제수단이 원인인 경우 등록하면 정상 이용 가능하다는 안내가 함께 있습니다. 실제 원인이 미등록인지 계정의 다른 제한인지는 아직 확인되지 않았습니다. 키 발급/서비스 신청 화면에는 접근하지 못했고, 결제수단 등록이나 과금 서비스 신청은 실행하지 않았습니다.
