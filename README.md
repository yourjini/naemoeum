# 내모음

네이버·구글 지도, 크롬 즐겨찾기, 네이버 Keep, 유튜브 재생목록, 직접 모은 링크와 스크린샷 글을 한곳에 모아
출처·종류·주제별로 정리하는 정적 웹페이지입니다. 빌드 과정 없이 `index.html` 하나로 동작합니다.

- 저장: 이메일로 로그인하면 Supabase(`notes` 표)에 저장되어 어느 기기에서나 같은 목록. 로그인 전에는 이 브라우저의 localStorage
  - 표 만들기: `supabase.sql`을 Supabase SQL Editor에서 실행
  - 연결: `supabase-config.json`에 Project URL과 공개용 키(publishable/anon) 입력. 비어 있으면 브라우저 저장만 사용
  - `api/ping.js`: 하루 한 번(vercel.json crons) 요청을 보내 무료 프로젝트가 잠들지 않게 함
- 이미지 글자 읽기: tesseract.js (한국어·영어), 언어 데이터는 `lang/` 에 포함
- AI 분류·AI 읽기는 claude.ai 아티팩트 버전에서만 동작

## Vercel 배포
Vercel에서 이 저장소를 Import → Framework Preset: Other → Deploy. 설정할 것 없음.
