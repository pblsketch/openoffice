# packages/google-drive (`@genoffice/google-drive`)

Google 드라이브 연결의 뒷단(main) 코드다. 시스템 브라우저로 하는 Google 로그인(OAuth PKCE, 루프백 주소)과 같은 흐름의 Google 선택 창, 접근 토큰을 새로 받아 두는 연결 하나, 앱이 쓰는 드라이브 REST 호출(목록, 검색, 내려받기, 내보내기, 올리기)을 담는다. 결정 기록 0033, 0085.

## 맡은 범위

- 로그인과 고르기: `signInWithGoogle`(`pick`을 주면 Google 선택 창, 고른 ID는 `pickedFileIds`로 거른다), `exchangeGoogleCode`, `refreshGoogleToken`, `revokeGoogleToken`(`src/oauth.ts`).
- 연결: `DriveConnection`(`src/connection.ts`)의 `connect`와 `pick`. 갱신 토큰은 호출자가 주는 금고(`TokenVault`)에, 접근 토큰은 메모리에 둔다.
- 드라이브 호출: `DriveApi`(`src/drive-api.ts`). 결과는 `{ ok: true, … }` 또는 `{ ok: false, kind }`이고 던지지 않는다.
- 형식: 앱이 여는 확장자, Google 문서 형식의 내보내기 형식, PC 사본 이름(`src/formats.ts`).

## 맡지 않는 것 (경계)

- 토큰 암호화는 껍데기 앱의 금고가 한다(Electron `safeStorage`). 이 패키지는 Electron을 import하지 않는다.
- 클라이언트 ID와 비밀값은 빌드가 넣고 껍데기 앱이 넘긴다. 이 패키지에 적지 않는다.
- 파일을 탭으로 여는 일, 저장 뒤 올리기를 정하는 일, 충돌을 사람에게 묻는 일, AI 도구는 껍데기 앱과 편집기의 범위다.
- 받은 파일의 글을 읽는 일은 `packages/file-parse`의 `parseFileToText`가 한다. 가리기가 거기서 적용된다.

## 항상 지켜야 하는 것

- 권한은 `DRIVE_SCOPE`(`drive.file`) 하나다. 다른 권한(`openid`, `email`, `drive` 등)을 더하지 않는다. Google 선택 창은 이 권한 하나만 허락하고, 넓히면 제한 권한 심사와 보안 심사가 돌아온다(결정 0085). 계정 표시는 드라이브의 `about`에서 읽는다.
- 고르기로 받은 새 토큰으로 바꿀 때 이전 갱신 토큰을 폐기하지 않는다. 폐기는 앱의 허락 전체를 끝내 전에 고른 파일에 닿지 못하게 할 수 있다. 폐기는 `disconnect` 하나뿐이다.
- 돌아온 `picked_file_ids`는 `pickedFileIds`로만 읽는다(드라이브 ID 모양, 중복 없이, `MAX_PICKED_FILES`까지).
- 로그인 화면은 Google의 것이다. 앱 안에 로그인 양식을 만들지 않는다. 브라우저가 돌아오는 서버는 `127.0.0.1`에만 열고, `/callback` 요청 가운데 `state`가 맞는 하나에만 답한다. 돌려주는 페이지는 스크립트도 바깥 자원도 없는 고정 글이다.
- 실행마다 새 PKCE 검증값과 `state`를 만든다. 클라이언트 비밀값은 브라우저로 가는 주소에 넣지 않는다.
- 토큰과 파일 내용을 로그나 오류 글에 싣지 않는다.
- 갱신이 `invalid_grant`로 거절될 때만 연결을 끝낸다. 네트워크 실패로는 끊지 않는다.
- 드라이브 검색어는 `queryLiteral`로만 쿼리에 넣는다. 모델이나 사람이 준 글이 쿼리 구조를 바꾸지 못하게 한다.
- 올리기 세션 주소(`Location`)는 Google의 올리기 주소(`DRIVE_UPLOAD_API`)로 시작할 때만 따라간다. 접근 토큰이 다른 곳으로 가지 않게 하기 위해서다.
- 내려받기는 크기 상한(`MAX_OPEN_BYTES`, `MAX_READ_BYTES`)을 지키고, 넘으면 읽기를 멈춘다.

## 테스트

- 실행: `npm run test -w @genoffice/google-drive`, `npm run typecheck -w @genoffice/google-drive`.
- 테스트는 Google에 닿지 않는다. 모든 호출은 주입한 `fetch`를 지난다. 로그인 테스트는 루프백 서버를 실제로 열고, 브라우저 대신 테스트가 그 주소를 부른다.
- 바꾸면 반드시 테스트하는 것: 선택 창 요청의 `trigger_onepick`·`allow_multiple`, 고른 ID 거르기, 고르기가 이전 토큰을 폐기하지 않는지, `state`가 다른 콜백을 무시하는지, 갱신 실패 종류별로 연결이 남거나 끝나는지, 동시에 들어온 호출이 갱신을 한 번만 하는지, 올리기 세션 주소 검사, 크기 상한.
