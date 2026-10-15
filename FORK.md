# Fork-only code

This repository is a fork of [pblsketch/openoffice](https://github.com/pblsketch/openoffice). Features that exist only here are not sent upstream.

## Where fork code lives

- Put a fork-only feature in its own folder under `fork/<name>/`. The sync engine, its tests, its settings screen, and its wording stay in that folder.
- Do not change document engines to support a fork feature. Saved documents must stay interchangeable with upstream.
- Touch upstream files only for a thin wire: one import, one start call, one stop call, and the screen that mounts the fork component. Do not add fork wording to the upstream string tables.
- Do not read subscription login files. A fork feature that needs a password stores it with the operating system keychain (Electron `safeStorage` on macOS), never in a settings file as plaintext.

`fork/nas-sync/` is the company NAS sync feature. It is not part of upstream.

`fork/company-templates/` is the company document template library. It is not part of upstream. The templates folder is a path on this PC. A later NAS sync can point that path at a folder inside the synced workspace. This feature does not import the NAS sync code.

## Company templates

See the Korean section below, and the user notes in `README.md`.

## Upstream sync

`.github/workflows/upstream-sync.yml` runs every day (`17 6 * * *` UTC) and when someone starts it by hand (`workflow_dispatch`).

- It fetches `main` from `pblsketch/openoffice`.
- If that history is already contained in this fork's `main`, it stops.
- Otherwise it resets a branch named `upstream-sync` onto fork `main`, merges upstream `main` into it, and pushes that branch.
- It opens a pull request, or updates the open one, titled `Upstream sync from pblsketch/openoffice`.
- The workflow uses `GITHUB_TOKEN` with `contents: write` and `pull-requests: write`. It also sets `actions: write` so it can start CI.

Pull requests created by `GITHUB_TOKEN` do not trigger other workflows. GitHub blocks that so the token cannot call itself in a loop. After a clean merge this workflow dispatches `.github/workflows/ci.yml` on `upstream-sync`. If that dispatch does not run, start CI on `upstream-sync` by hand.

If the merge conflicts, the branch is still pushed and the pull request is still opened. The merge is aborted first, so neither side is overwritten. The pull request body lists the conflicting paths, and `UPSTREAM-SYNC-CONFLICTS.md` on `upstream-sync` repeats that list. CI is not dispatched for a conflict branch, because the upstream commits are not on it yet.

The script is `.github/scripts/upstream-sync.mjs`. `npm run test:upstream-sync` covers a clean merge, a conflict, and the case with nothing new.

## 포크에서만 두는 코드

이 저장소는 pblsketch/openoffice 의 포크다. 여기서만 쓰는 기능은 업스트림으로 보내지 않는다.

- 포크 전용 코드는 `fork/<이름>/` 폴더에 둔다. 동기화 엔진, 테스트, 설정 화면, 문구를 그 폴더 안에 둔다.
- 문서 엔진은 포크 기능을 위해 고치지 않는다. 저장한 문서는 업스트림과 서로 열 수 있어야 한다.
- 업스트림 파일은 얇은 연결만 고친다. 불러오기 하나, 시작 호출 하나, 멈춤 호출 하나, 그리고 포크 화면을 붙이는 자리뿐이다. 업스트림 문구 사전에는 포크 문구를 넣지 않는다.
- 구독 로그인 파일은 읽지 않는다. 암호가 필요하면 macOS 키체인에 넣고, 설정 파일에 평문으로 적지 않는다.

`fork/nas-sync/` 는 회사 NAS 동기화다. 업스트림에 없다.

`fork/company-templates/` 는 회사 문서 양식이다. 업스트림에 없다. 양식 폴더는 이 PC의 경로다. 나중에 NAS 동기화가 생기면 그 경로를 동기화되는 작업 폴더 안으로 가리키면 된다. 이 기능은 NAS 동기화 코드를 불러오지 않는다.

## 회사 문서 양식 넣기

설정 → 일반 → 회사 문서 양식에서 폴더를 고른다. 그 폴더가 NAS에 올라가는 폴더여도 된다. 연결이 잠시 끊겨 있으면 목록만 비고, 경로는 지워지지 않는다.

양식 파일 옆에 같은 이름의 JSON을 두면 이름, 분류, 설명을 읽는다.

```json
{
  "name": "월간 업무 보고서",
  "category": "보고서",
  "description": "실적과 다음 계획"
}
```

분류 값은 `report`, `draft`, `minutes`, `quote`, `official`, `slides`, `other` 이거나 `보고서`, `기안문`, `회의록`, `견적서`, `공문`, `발표자료`, `기타` 다. JSON이 없으면 상위 폴더 이름을 분류로 쓴다.

마크다운, 텍스트, HTML은 파일 맨 위의 머리말로 같은 값을 적을 수 있다.

```markdown
---
name: 회의 메모
category: minutes
description: 안건과 결정
---
```

자리표시자는 `{{날짜}}`, `{{작성자}}`, `{{부서}}`, `{{회사명}}` 이다. 문서를 만들 때 바꾼다. 날짜와 설정에 저장한 이름, 부서, 회사가 미리 채워진다. 설정 파일은 사용자 데이터 폴더의 `company-templates.json` 이고, 암호는 들어 있지 않다.

미리보기는 `양식.docx.thumb.svg` 또는 `양식.docx.thumb.png` 다. 없으면 앱이 간단한 그림을 그린다.

파일 메뉴의 양식으로 저장은 디스크에 있는 현재 문서를 그 폴더의 분류 하위 폴더로 복사하고, 옆 JSON을 만든다. 이진 `.hwp` 안의 글자는 바꾸지 않고 파일만 복사한다.

앱에 들어 있는 기본 양식(보고서, 회의록, 기안문, 견적서, 공문, 발표자료)은 `fork/company-templates/src/builtin.ts` 에서 만든다. 기안문 HWPX 바이트는 `scripts/build-draft-hwpx.mjs` 가 `src/draft-hwpx.ts` 에 적는다.

## 업스트림 동기화

`.github/workflows/upstream-sync.yml` 은 매일 UTC 6시 17분에 돌고, 손으로도 시작할 수 있다.

- `pblsketch/openoffice` 의 `main` 을 가져온다.
- 그 커밋이 이미 포크 `main` 에 있으면 멈춘다.
- 아니면 `upstream-sync` 가지를 포크 `main` 으로 다시 잡고, 업스트림 `main` 을 병합한 뒤 푸시한다.
- 풀 리퀘스트 제목은 `Upstream sync from pblsketch/openoffice` 이다. 이미 열려 있으면 본문을 갱신한다.
- `GITHUB_TOKEN` 에 contents 와 pull-requests 쓰기 권한을 준다. CI 를 직접 시작하려고 actions 쓰기 권한도 준다.

`GITHUB_TOKEN` 으로 만든 풀 리퀘스트는 다른 워크플로를 시작하지 않는다. 토큰이 자기 자신을 반복해서 부르지 못하게 한 깃허브의 제한이다. 병합이 깨끗하면 이 워크플로가 `upstream-sync` 가지에서 `ci.yml` 을 직접 시작한다. 그 시작이 빠지면 `upstream-sync` 에서 CI 를 손으로 돌린다.

충돌이 나도 가지를 푸시하고 풀 리퀘스트를 연다. 병합은 먼저 취소해서 어느 쪽도 덮어쓰지 않는다. 본문에 충돌한 파일 경로를 적고, 같은 목록을 `UPSTREAM-SYNC-CONFLICTS.md` 에도 남긴다. 충돌 가지에는 업스트림 커밋이 아직 없으므로 CI 는 시작하지 않는다.
