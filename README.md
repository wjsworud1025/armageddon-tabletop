# 워해머 40,000 스타터 세트 PC 전장

두 플레이어가 같은 PC에서 44 × 30인치 전장에 미니어처 46개와 지형 15개를 배치해 대전한다. 공개 소스에는 코드로 그린 보드와 3D 조형, 두 팩션의 컴뱃 패트롤 편성이 들어 있다. 공식 사진을 갖춘 개발용 전장에서는 실제 도색 모습과 회전 사진도 볼 수 있다.

## 바로 실행하기

저장소를 복제하면 기본 브랜치 `main`에 검증된 게임 소스가 있다. 그 폴더에서 `python -m http.server 8000 --bind 127.0.0.1`을 실행하고 브라우저에서 `http://127.0.0.1:8000`을 연다. Windows 전용 창은 아래 빌드 명령을 실행한 뒤 `dist/ArmageddonTable.exe`를 더블클릭한다. 64비트 Windows와 Microsoft Edge WebView2 Runtime이 필요하다.

## 제품 배치 둘러보기

1. 처음 열리는 전장에서 미니어처를 드래그해 옮긴다. 휠로 확대하고 모델을 더블클릭하면 가까이 볼 수 있다.
2. 전장에서 우클릭 드래그하면 시점이 바뀐다. 로컬 촬영 자료가 설치된 경우 **제품 사진**으로 원본과 대조하고, 캡틴 등 대상 기물의 **실물 360° 보기**에서 12방향과 세 높이로 살펴볼 수 있다. 개발용 웹 서버에서 로컬 촬영 자료를 사용하려면 주소 끝에 `/?studio=1`을 붙인다.
3. **거리 측정**에서 기물 두 개를 클릭하면 줄자의 양 끝이 두 베이스의 가장 가까운 지점에 놓인다. 차량을 돌리면 타원 베이스 방향에 따라 거리가 달라진다. 기물과 빈 지면을 선택해 베이스부터 그 지점까지 잴 수도 있다. 표시 단위는 인치이며, 높이 차이도 반영한다. 지형은 지면 점유 치수의 외접 사각형으로 측정한다.
4. **경로 이동**은 경유 지점을 클릭할 때마다 누적 거리를 표시한다. **경로대로 이동**을 누르면 적용된다. **분대 단위로 이동**을 켜면 부착된 지휘관도 분대와 함께 이동한다.
5. **편성**에서 회전, 높이, 제거·복귀를 조절한다. **이 기물에서 시선 확인**을 누르고 표적을 선택하면 기물 높이에서 지형을 볼 수 있다. 왼쪽·오른쪽 보드는 따로 뒤집을 수 있다.

## 두 사람이 대전하기

처음이라면 **대전 → 핸드북 첫 훈련 시작**을 누른다. 중앙에서 캡틴과 워보스가 베이스를 맞대고, 양쪽 플레이어가 번갈아 명중·상처·방어 주사위를 굴린다. 승리 조건은 상대 지휘관 제거다. **원래 전장으로**를 누르면 훈련 직전의 배치와 대전 상태로 돌아간다. 굴림 사이에 저장해 훈련을 이어갈 수도 있다. [핸드북 훈련 1 자료](rules/TRAINING.md)

1. **대전 → 컴뱃 패트롤 전장 배치**에서 A, B, C 가운데 하나와 진영을 고른 뒤 **전장에 배치**를 누른다. 15개 지형은 배치도에 따라 옮겨지고, 두 군대는 각각의 배치 구역 안에 임시로 정렬된다. 배치도를 열어 치수를 확인하고 원하는 분대 위치를 조정한다.
2. 선공을 결정하고 **대전 시작**을 누른다. 기본 5라운드에서 스페이스 마린과 오크는 각자의 패트롤 임무에 따라 점수를 얻는다.
3. 이동은 분대를 골라 선언한 뒤 기물을 끌고 **분대 이동 완료**를 누른다. 사격은 무기와 표적을 고르고 **분대 전체 선언 확정**을 누른다. 돌격은 2D6을 굴린 뒤 표적을 고르고 기물을 옮긴다. 근접전은 화면이 안내하는 진영 순서에 따라 밀착 이동, 분대별 공격, 재정비를 진행한다. 피해와 승점은 **기록**에서 확인한다.
4. 매 변경 사항은 이 PC에 자동 저장된다. 다른 PC에서 이어 하려면 **저장 파일 ↓**로 JSON을 받아 새 전장의 **불러오기**에서 연다.
5. **대전 → 팩션 룰북과 스타터 규칙**에서 [스페이스 마린 코덱스](https://www.warhammer.com/shop/codex-space-marines-2026-eng), [오크 코덱스](https://www.warhammer.com/shop/codex-orks-2026-eng)와 [공식 무료 컴뱃 패트롤 규칙 안내](https://www.warhammer-community.com/en-gb/articles/2akzkx92/combat-patrol-is-now-live-in-your-app/)를 열 수 있다. 이 세트로 대전할 때 사용할 편성 이름은 **Assault Force**와 **’Ardmob**다.

## 빌드 및 검증

Windows PowerShell에서 저장소 루트를 기준으로 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build.ps1
node --test tests/*.test.mjs rules/*.test.mjs
node tests/windows-smoke.mjs
node rules/browser-acceptance.mjs
```

Windows 빌드는 최초 한 번 공식 NuGet에서 WebView2 SDK를 설치한다. Windows 스모크 검사는 테스트 전용 브라우저 프로필에서 패키지의 실제 전장을 조작한다. 실행 중인 게임은 먼저 닫는다. 캡처는 `.build/qa`에 저장된다. 별도 대전 검사는 임시 포트에서 5라운드를 끝까지 진행해 판정과 저장 상태를 검사한다. 로컬 Windows 실행본은 127.0.0.1:41946에서 자신의 내장 파일만 제공한다.

## 재현 근거

제품 구성, 사진 배치 좌표, 보드 아트는 [전장 자료 기록](data/REFERENCES.md)에, 전투 수치와 적용 범위는 [규칙 자료 기록](rules/SOURCES.md)에 정리했다. 모델 이름과 UI는 프로젝트에서 한국어로 옮겼다. 배치 구역·거점 경계는 지도에서 디지털화했고, 최초 대전 배치의 병력 정렬은 플레이어가 조정할 수 있는 시작 위치다.

Warhammer 40,000 제품 및 촬영물은 Games Workshop의 자료다. 전체 배치의 기준은 [2026년 7월 공식 발표](https://www.warhammer-community.com/en-gb/articles/qqcxxrmm/sunday-preview-new-warhammer-40000-starter-sets-are-coming/)다. 개별 도색 기물은 [스페이스 마린 공식 촬영판](https://www.warhammer.com/app/resources/catalog/product/920x950/60010199082_WH40KStarterSet02.jpg), [오크 공식 촬영판](https://www.warhammer.com/app/resources/catalog/product/920x950/60010199082_WH40KStarterSet03.jpg), [지형 공식 촬영판](https://www.warhammer.com/app/resources/catalog/product/920x950/60010199082_WH40KStarterSet04.jpg)에서 분리했다. 렌더러와 Windows 창에는 [Three.js](vendor/LICENSE)와 [Microsoft WebView2 SDK](desktop/webview2/LICENSE.txt)를 사용한다.
