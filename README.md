# ZUTOMAYO Discography Fanpage

이 프로젝트는 **AI 딸깎으로 만든 결과물**입니다. 리드미도 codex가 적어줌.  
핵심 목적은 **AI Agent Driven Development 실습**입니다.

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

## 데이터

- 관계 원본: `data/data.uml`
- 생성 스크립트: `scripts/build_dataset.py`
- 그래프 데이터: `data/discography.js`

## 배포

GitHub Pages로 배포:

- https://js4ngu.github.io/zutomayo-discography-fanpage/

