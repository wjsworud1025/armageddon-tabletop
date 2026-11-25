# 전투 규칙과 기준 자료

이 전장은 2026년판 스타터 세트의 **Assault Force** 및 **’Ardmob** 전용 편성으로 로컬 2인 대전을 진행한다. 한국어 버튼 이름은 이 프로젝트에서 번역했다.

| 항목 | 구현에 사용한 자료 |
| --- | --- |
| 5개 페이즈와 턴 종료, 전장 충격, 지휘 포인트, 측정, 돌격, 공격 판정, 엄폐, 목표 점유 | [Games Workshop 11판 코어 규칙](https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf), 특히 01, 03–05, 07–14, 24절 |
| 패트롤 소속 군대, 데이터시트와 임무의 공식 배포처 | [Warhammer Community의 공식 앱 공지](https://www.warhammer-community.com/en-gb/articles/2akzkx92/combat-patrol-is-now-live-in-your-app/) |
| 마린 전투 교리와 점유 보너스, 오크 전력 이동 재굴림과 와아!, 4종 업그레이드, 진영별 전술 6종 | GW에서 제공한 실물 세트의 독일어 인쇄 참조표 앞뒷면. [Brückenkopf-Online 직접 촬영 사진 42, 43, 45, 46](https://www.brueckenkopf-online.com/2026/unboxing-warhammer-40-000-starterset/) |
| 패트롤 모델의 무장·수치·부대별 특수 능력, 임무별 승점 조건 | [Assault Force 앱 2.7.1 자료 전사본](https://wahapedia.ru/wh40k11ed_cp/factions/assault-force/), [’Ardmob 앱 2.7.1 자료 전사본](https://wahapedia.ru/wh40k11ed_cp/factions/ardmob/), [Combat Patrol Archive의 별도 앱 채록본](https://combat-patrol-companion.pages.dev/). 전용 프로필은 두 채록본을 비교했다. 공식 앱을 이 PC에서 직접 열어 대조한 상태는 아니다. |
| 44″×30″ 전장, A/B/C 배치도, 수비 측 선배치, 선공 대결, 5라운드 | [앱 임무 순서와 배치도 전사본](https://wahapedia.ru/wh40k11ed_cp/the-rules/combat-patrol-mission/) |

## 수치 판본

### 2026년 두 팩션의 코덱스

- **Codex: Space Marines**. 2026년 9월 19일 공식 발매 예고에서 확인한 일반판이다. 공개된 군대 규칙은 강습·데바스테이터·전술 교리이며 기본적으로 각 교리는 전투당 한 번 사용한다. [공식 도서](https://www.warhammer.com/shop/codex-space-marines-2026-eng) · [직접 읽을 수 있는 공식 교리 설명](https://www.warhammer-community.com/en-gb/articles/ifgezlgu/space-marines-rules-first-look/)
- **Codex: Orks**. 2026년 8월 22일 공식 발매 예고에서 확인한 일반판이다. 공개된 군대 규칙에는 전력 이동 재굴림과 전투 함성이 있다. 코덱스의 격앙 상태는 5+ 무적 방어, 원거리 무기의 Assault, 전력 이동 후 돌격을 부여한다. [공식 도서](https://www.warhammer.com/shop/codex-orks-2026-eng) · [직접 읽을 수 있는 공식 와아! 규칙](https://www.warhammer-community.com/en-gb/articles/ckwgwgyx/new-codex-orks-army-rules-to-get-you-riled-up/)

스타터 세트 대전의 수치와 효과는 전용 패트롤을 기준으로 한다. Games Workshop은 두 패트롤에 각각 데이터시트, 팩션 규칙, 강화와 임무를 무료로 제공한다고 명시한다. 예를 들어 오크의 세트 전용 방어 효과는 높은 힘의 공격이 받는 상처 굴림 보정으로 구현했다. 코덱스 전체 본문 열람 여부와 전용 룰 검증은 별개로 기록한다. [공식 컴뱃 패트롤 배포 안내](https://www.warhammer-community.com/en-gb/articles/2akzkx92/combat-patrol-is-now-live-in-your-app/)

일부 채록본의 값이 다르다. 재현 기준은 2026년 10월 앱 2.7.1로 표기된 판본이다. 랜드 스피더 멀티 멜타 S10, 그레친 기본 OC 1, 커스텀 슈타 놉 분대 보이의 슈타에는 속사 보너스가 없는 것으로 입력했다. 마린 인터세서의 데이터시트 OC 3에 충격이 없으면 진영 규칙의 +1을 적용한다. 6월 발행된 [아마겟돈 마린](https://www.warhammer-community.com/en-gb/articles/nnyskcbr/new40k-rules-space-marines-datasheets-from-armageddon/) 및 [아마겟돈 오크](https://www.warhammer-community.com/en-gb/articles/rtgp72pg/new40k-rules-ork-datasheets-from-armageddon/) 카드는 일반 게임 프로필로서 패트롤 프로필과 차이가 있다.

## 플레이 범위

- 대전 시작에서 임무 이름을 비우고 5라운드와 패트롤 배치도를 선택하면 진영별 임무가 해당 판정 시점에 점수를 준다. 자유 임무는 점수판을 직접 조정한다. 도색 보너스는 플레이어가 합의해 승점으로 입력한다.
- 한 분대의 모든 사수·무기·표적을 적고 **분대 전체 선언 확정**을 누른다. 플레이어는 사수별 가시선을 확인한다. 사격 무기 하나에 적 분대 하나를 선언한다. 근접전에서는 각 교전 모델의 무기 하나를 고르고 공격 수를 여러 적 분대에 나눌 수 있다. 같은 표적의 동일 공격을 함께 굴리며 해당 표적을 마친 후 다음 표적을 고른다. 같은 분대에서 앞선 공격으로 표적이 전멸하면 남은 화력을 옮기지 않는다. 다른 규칙에 의해 선언 직후 표적이 부적격해진 경우 양측이 확인하고 첫 판정 전에 선언을 다시 열 수 있다. 속사·멜타는 선언 당시 사거리를, 폭발·단일 표적 Cleave는 선언 당시 표적 모델 수를 쓴다. 개별 재굴림과 지형 예외는 양측이 판정한다. [11판 기본 규칙 04.01–04.03 및 24절](https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf)
- 위험 무기를 사용한 분대는 사격 또는 근접전 공격을 모두 마치면 **분대 공격 종료 · 위험 판정**을 누른다. 선택한 위험 무기 한 개당 D6 하나를 동시에 굴리고, 1·2마다 해당 분대가 모탈 운드 1점을 받는다. 생존 모델이 모두 몬스터 또는 비히클이면 실패당 3점이다. 부상한 일반 모델, 다른 일반 모델, 부상한 캐릭터, 다른 캐릭터 순으로 한 점씩 적용한다. 우선순위가 같은 모델이 여러 개면 해당 분대의 플레이어가 배정할 대상을 고른다. [11판 기본 규칙 06.02, 06.03, 24.15](https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf)
- 이동 페이즈에는 분대를 선택하고 일반 이동·전력 이동·후퇴·정지를 선언한다. 드래그 한 번은 직선 한 구간이며, 돌아가려면 **경로 이동**에서 경유점을 지정한다. 각 모델의 수평 이동과 등반 거리를 누적하고 회전·비행·비히클의 통과 예외를 적용한다. 전력 이동 D6는 분대가 공유하고 이동 특성 M은 모델별로 적용한다. **분대 이동 완료**에서 각 모델의 이웃(수평 2″, 수직 5″), 모든 모델 쌍의 최대 간격(수평 9″, 수직 5″), 베이스 겹침과 적 교전 거리를 검증한다. 필사적 탈출은 이동 전 위험 피해와 이동 후 필요한 전장 충격 판정을 처리한다. 벽·층의 실제 간격, 증원 배치, 반응 이동, 밀착·재정비는 두 플레이어가 확인한다. [11판 기본 규칙 03, 06, 09, 13, 17, 21절](https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf)
- 핸드북 안의 개별 훈련 시나리오와 배치도는 공개 제품 갤러리, 독일어 리뷰 사진 및 [영문 실물 사진](https://spruesandbrews.com/2026/07/11/warhammer-40000-starter-set-unboxing-and-review-40k-11th-edition/)에서 본문을 판독할 수 없었다. 패트롤 매치와 별도로 대조가 필요한 자료는 핸드북의 각 훈련 임무 시작 조건, 종료 조건, 승리 조건 및 배치 그림이다.
