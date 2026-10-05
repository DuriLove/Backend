# API 호출 예시와 오류 계약

기본 주소는 http://127.0.0.1:3000/api/v1 입니다. TOKEN은 회원가입/로그인에서 받은 accessToken, CATALOG_VERSION은 인증된 GET /region-catalog의 version입니다. 실제 토큰·공유 원문은 Git과 로그에 올리지 않습니다.

```bash
curl -s http://127.0.0.1:3000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"테스트 사용자","email":"tester@example.com","password":"your-own-password"}'

curl -s http://127.0.0.1:3000/api/v1/region-catalog \
  -H "Authorization: Bearer $TOKEN"

curl -i http://127.0.0.1:3000/api/v1/place-resolutions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: card-001-revision-1' \
  -d '{"clientCardId":"card-001","inputRevision":1,"sourceType":"kakao_map","sharedText":"실제 장소명\n실제 주소\nhttps://place.map.kakao.com/실제숫자ID","regionCatalogVersion":"GET 응답의 version"}'

curl -s "http://127.0.0.1:3000/api/v1/place-resolutions/$RESOLUTION_ID" \
  -H "Authorization: Bearer $TOKEN"

curl -i "http://127.0.0.1:3000/api/v1/place-resolutions/$RESOLUTION_ID/selection" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"candidateId":"조회 응답의 candidateId","expectedRevision":3}'

curl -i "http://127.0.0.1:3000/api/v1/place-resolutions/$RESOLUTION_ID/retry" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: card-001-retry-1' -d '{"expectedRevision":3}'
```

위 장소 URL과 필드값은 형식 설명용이며 유효한 실제 샘플이 아닙니다. 요청과 결과의 완전한 스키마는 openapi.json에 포함합니다.

| 상태 | 예시 reason/error | 처리 |
|---|---|---|
| queued / processing | PENDING | 202 접수 뒤 GET으로 조회 |
| resolved | NAME_AND_ADDRESS_MATCH / PROVIDER_ID_AND_NAME_MATCH / USER_SELECTED | place와 region을 별도로 판단 |
| needs_confirmation | INSUFFICIENT_UNIQUE_MATCH_EVIDENCE | 후보 선택, 자동 지역 적용 금지 |
| needs_confirmation | PLACE_NAME_REQUIRED | 원문에 이름·주소를 추가해 inputRevision을 증가시키고 새 키로 접수 |
| no_match | NO_SEARCH_RESULTS | 원문 카드 유지 |
| unsupported | NOT_A_SINGLE_PLACE / MULTIPLE_URLS / UNSUPPORTED_OR_UNSAFE_URL | 원문 유지, 입력 보완 |
| failed | PROVIDER_TIMEOUT / PROVIDER_RATE_LIMIT / PROVIDER_UNAVAILABLE | retryable과 nextRetryAt 확인; 자동 재시도 중일 수 있음 |
| failed | PROVIDER_NOT_CONFIGURED / PLACE_STORAGE_POLICY_BLOCKED | 관리자 설정 필요; 오류를 장소 없음으로 바꾸지 않음 |

지역은 mapped / partial / unmapped / policy_blocked이며, 모르는 ID는 null입니다. 날짜 계획의 지역과 독립적입니다. 공급자별 장소 ID는 다른 네임스페이스이며 네이버의 제공되지 않는 ID는 null입니다.

| HTTP | 의미 |
|---|---|
| 202 | 영구 접수됨; 장소 확정을 의미하지 않음 |
| 200 | GET/선택 요청 성공; 작업 status가 failed일 수도 있음 |
| 400 | DTO 제한, 비어 있는 입력, 잘못된 후보, 안전하지 않은 미리보기 URL |
| 401 | 토큰 없음/위조/만료 |
| 403 | 보드 구성원이 아님 |
| 404 | 작업 없음·만료·삭제 또는 다른 사용자 작업 |
| 409 | 키 재사용 충돌, 낮은 입력 revision, 후보 만료, 상태/revision 충돌, 재시도 시점 전, 카탈로그 불일치 |
| 410 | 삭제 차단 기록이 있는 공유 카드의 재변환 |
| 413 | HTTP JSON 본문 32KB 초과 |
| 429 | 사용자/IP 요청 제한 |
| 5xx | 서버·저장 장애; 접수된 제공사 장애는 작업 error로 조회 |

`Idempotency-Key`는 8~128자의 영문·숫자·점·밑줄·콜론·하이픈입니다. 같은 사용자·키·입력은 현재 같은 작업을 반환하며 다른 입력이면 409입니다. sharedUrl 앞뒤 공백만 정규화하고 sharedText는 원문을 유지하며 입력 지문에 포함합니다. 같은 카드에 다른 키를 사용하려면 inputRevision을 증가시켜야 합니다. 요청 본문의 userId 같은 미정의 필드는 거부합니다.

선택 요청은 서버가 반환한 candidateId와 조회 시 revision을 제출합니다. 동일한 성공 선택을 같은 expectedRevision으로 재전송하면 확정 결과를 반환합니다. 다른 후보로 바꾸는 재전송은 409입니다. 후보 유효기간이 지나면 새 inputRevision 작업으로 재검색합니다.

Frontend 연동 시에는 clientCardId, inputRevision, resolutionId를 저장하고 기존 coordinator에서만 결과를 적용해야 합니다. 삭제·사용자 수동 편집·날짜/반응 보존 처리는 앱 연동 담당 범위이며 이번 Backend 변경으로 완료된 것이 아닙니다.
