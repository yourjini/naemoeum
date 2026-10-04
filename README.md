# 내모음

네이버·구글 지도, 크롬 즐겨찾기, 네이버 Keep, 유튜브 재생목록, 직접 모은 링크와 스크린샷 글을 한곳에 모아
출처·종류·주제별로 정리하는 정적 웹페이지입니다. 빌드 과정 없이 `index.html` 하나로 동작합니다.

- 저장: 이 브라우저의 localStorage (다른 기기와 동기화되지 않음)
- 이미지 글자 읽기: tesseract.js (한국어·영어), 언어 데이터는 `lang/` 에 포함
- AI 분류·AI 읽기는 claude.ai 아티팩트 버전에서만 동작

## Vercel 배포
Vercel에서 이 저장소를 Import → Framework Preset: Other → Deploy. 설정할 것 없음.
