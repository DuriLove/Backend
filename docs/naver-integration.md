# 네이버 실제 연동 검증 — 2026-10-05

NAVER API HUB의 duri-backend / 지역 검색을 백엔드에 연결했습니다. 발급된 인증 정보는 로컬 `.env`에만 저장했고 파일 권한은 0600입니다. 소스·검증 보고서에는 키를 포함하지 않습니다.

- NAVER_API_MODE=hub
- NAVER_HUB_CLIENT_ID, NAVER_HUB_CLIENT_SECRET 사용
- 실제 검색 HTTP 200, 결과 1개 확인
- 공개 기관 10개 검색: API 오류 0개, 정확 이름 일치 9개, 해당 9개 지역 일치
- 수원시청 질의는 정확 이름 후보가 없어 자동 확정 성공으로 집계하지 않음
- 네이버 호출 총 12회(연결 1회, 공개 질의 및 재조회 11회)
- 콘솔 한도: 일 1,000회, 월 10,000회. 유료 API 추가 없음

근거: naver-live-connectivity.json, public-query-results-20261005.json. 공개 기관 질의이며 Android/iOS 공유 검증이 아닙니다. 응답의 장소 필드는 보고서에 저장하지 않았습니다.

## 재현

Node 24에서 `npm run providers:check`, `npm run probe:public -- /tmp/new-report.json`을 실행합니다. 실제 API 호출을 사용하므로 설정된 한도를 소비합니다. 출력 파일은 기존에 없는 경로를 사용합니다.

## 현재 실행 범위와 제한

2026-10-05 사용자가 네이버 결과 저장을 명시적으로 승인하여 로컬 저장을 활성화했습니다. `data/local/settings.json`의 `naverStorageEnabled=true`, `lookupProvider=source`를 사용합니다. `start:local` 실행 시 NAVER_PLACE_STORAGE_APPROVED와 NAVER_REGION_STORAGE_APPROVED를 true로 적용합니다. 제공사 허가를 취득했다는 의미는 아닙니다.

실행 중 로컬 서버에 적용 후 실제 네이버 검색 → 후보 조회 → 사용자 선택 API → resolved → mapped → SQLite 저장을 확인했습니다. 검증용 작업은 삭제했습니다. `naver-storage-verification.json`에 결과가 있습니다. 합성한 직접 장소 URL을 사용했으므로 실제 모바일 공유 정확도 검증은 아닙니다. 검증 3회 중 첫 2회는 질의에서 기대한 정확 이름 후보가 없어 중단했으며 마지막 서울특별시청 입력은 성공했습니다. 첫 후보를 자동 확정하도록 완화하지 않았습니다.

Frontend 연결은 담당 친구, Render 배포는 사용자 담당입니다. 운영 배포는 수행하지 않았습니다. Render에서 `npm run start:prod`를 사용할 경우 로컬 settings.json은 적용되지 않습니다. 다음 환경변수를 별도로 설정해야 합니다.

- NAVER_API_MODE=hub
- NAVER_HUB_CLIENT_ID / NAVER_HUB_CLIENT_SECRET: 발급된 비밀값
- PLACE_LOOKUP_PROVIDER=source
- NAVER_PLACE_STORAGE_APPROVED=true
- NAVER_REGION_STORAGE_APPROVED=true

기존 JWT·DB·CORS·카카오 설정은 배포 지침을 따릅니다. `.env`를 공개 저장소에 올리지 않습니다. 실제 모바일 공유 입력 검증은 별도 남아 있습니다.
