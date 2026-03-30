# ZUTOMAYO Discography Fanpage

이 프로젝트는 **AI 딸깎으로 만든 결과물**입니다. 리드미도 codex가 적어줌.  
핵심 목적은 **AI Agent Driven Development**입니다.


현생 바빠서 한동안 안 건들일 거 같아요,,, (26.03.31.)

## 프로젝트 소개
ZUTOMAYO 디스코그래피를 `Single → Mini Album → Full Album` 흐름으로 시각화한 인터랙티브 웹앱입니다.

- 그래프 노드/엣지 인터랙션
- 줌/팬 기반 탐색
- 하단 포커스 카드 슬라이드업 UI
- 보라 네온 + CRT 무드 테마

## AI Agent Driven Development 실습 포인트

- 요구사항을 자연어로 전달
- AI 에이전트가 코드 구조/레이아웃/인터랙션을 반복 수정
- 사용자 피드백 기반으로 즉시 재수정(빠른 루프)
- 결과물까지 GitHub Pages 배포

즉, 이 저장소는 “직접 코드를 일일이 치기보다, AI 에이전트를 조종해 제품을 완성하는” 실습 기록입니다.

## 로컬 실행

```bash
python3 -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173` 접속.

## 접속 통계

GA4를 붙일 수 있게 기본 코드가 들어 있습니다.

- 설정 파일: `site-config.js`
- 측정 ID: `window.APP_CONFIG.gaMeasurementId = "G-XXXXXXXXXX"`

측정 ID를 넣지 않으면 분석 스크립트는 로드되지 않습니다.

## 데이터

- 관리용 원본
  - `data/single.json`
  - `data/mini.json`
  - `data/full-album.json`
  - `data/live.json`
  - `data/title-map.json`
  - `data/work-aliases.json`
- 배포용 그래프 데이터: `data/graph.json`
- 생성 스크립트: `scripts/build_dataset.py`

현재 구조는 `원본 JSON들 -> graph.json 생성 -> app.js가 graph.json 로드` 흐름입니다.

## 곡 추가 가이드

곡/앨범/라이브 세션을 추가할 때는 `graph.json`을 직접 수정하지 말고 원본 JSON 파일을 수정해야 합니다.

1. 곡이 싱글이라면 `data/single.json`에 항목을 추가합니다.
   - 필수값: `title`, `releaseDate`, `artworkPath`, `targetTitle`
   - 선택값: `collectionName`, `metadataSource`, `youtubeUrl`
2. 곡이 미니/정규/라이브 세션 수록곡이라면 해당 파일에 앨범 항목 또는 `trackTitles`를 수정합니다.
   - 미니: `data/mini.json`
   - 정규: `data/full-album.json`
   - 라이브/블루레이: `data/live.json`
   - 선택값: `collectionName`, `artworkPath`, `youtubeUrl`
3. 국문명이 필요하면 `data/title-map.json`에 추가합니다.
   - 곡명은 `song`
   - 미니는 `mini`
   - 정규는 `full`
   - 라이브/블루레이는 `live`
4. 같은 곡의 표기 변형을 하나로 묶어야 하면 `data/work-aliases.json`에 추가합니다.
   - 예: 라이브 표기, 즉흥 표기, 커뮤니티 별칭
5. 수정 후 아래 명령으로 `graph.json`을 다시 생성합니다.

```bash
python3 scripts/build_dataset.py
```

6. 필요하면 로컬 서버에서 확인합니다.

```bash
python3 -m http.server 4173
```

### 예시

싱글 1곡을 추가할 때는 `data/single.json`에 아래 형태로 넣습니다.

```json
{
  "title": "곡명",
  "releaseDate": "2026-03-30",
  "artworkPath": "asset/artwork/singles/song-slug.jpg",
  "collectionName": "Single Name - Single",
  "metadataSource": "manual",
  "youtubeUrl": "https://www.youtube.com/watch?v=example",
  "targetTitle": "곡명"
}
```

정규 앨범 수록곡을 추가할 때는 `data/full-album.json`의 해당 앨범 `trackTitles`에 곡명을 넣으면 됩니다.

## 앨범아트 로드맵

현재는 로컬에 저장한 이미지를 `artworkPath` 기준으로 우선 사용합니다.

- 싱글: `asset/artwork/singles`
- 미니/정규: `asset/artwork/albums`
- 라이브/블루레이: `asset/artwork/live`

필요하면 원본 JSON에 `artworkUrl`을 임시 fallback 값으로 넣을 수 있지만, 기본 운영 기준은 로컬 이미지입니다.

## 배포

GitHub Pages로 배포:

- https://js4ngu.github.io/zutomayo-discography-fanpage/
