import type { RuleSet } from '../rule-set'

/**
 * The Ministry of the Interior and Safety guideline, in force from 2026-08-24 for the
 * ministry's own reports. Only a few of its rules can be settled by looking at a document,
 * so the set is deliberately short and the weak ones start off.
 *
 * The Korean titles and lines below are screen text, not code prose: this rule set targets
 * Korean documents and is shown untranslated (see the package AGENTS.md).
 */
export const ADMINISTRATION_RULES: RuleSet = {
  id: 'administration-ko',
  version: 1,
  title: '행정안전부 행정문서 작성 가이드라인 2.0',
  source:
    'https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=128940',
  limits: {
    mergedShare: 1 / 3,
    mergedRowSpan: 2,
    // Three blank lines are ordinary spacing in a Korean report; five is filler
    // (measured: at 3, all 40 press releases fired).
    blankRun: 5,
  },
  rules: [
    {
      id: 'font.hangul-only',
      severity: 'violation',
      enabled: true,
      principle: 'compatibility',
      title: '다른 프로그램에서 열리지 않는 글꼴',
      why: '한글 전용 글꼴은 다른 프로그램에서 대체 글꼴로 바뀝니다. 함초롬바탕·함초롬돋움·맑은고딕 같은 호환 글꼴을 씁니다.',
    },
    {
      id: 'font.outside-recommended',
      severity: 'suggestion',
      enabled: false,
      principle: 'compatibility',
      title: '권장 목록 밖의 글꼴',
      why: '가이드라인이 예로 든 글꼴이 아닙니다. 기관 서식에 정해진 글꼴이 있으면 그대로 두어도 됩니다.',
    },
    {
      id: 'table.nested',
      severity: 'violation',
      enabled: true,
      principle: 'tables',
      title: '표 안의 표',
      why: '표 안의 표는 읽는 순서가 흐트러져 사람도 AI도 구조를 잃습니다. 바깥 표의 칸으로 나누어 담습니다.',
    },
    {
      id: 'table.deep-merge',
      severity: 'check',
      enabled: true,
      principle: 'tables',
      title: '병합이 많은 표',
      why: '가이드라인은 간단한 병합은 허용하지만 여러 층으로 얽힌 병합은 지양합니다. 표의 줄과 칸이 데이터 구조를 드러내게 합니다.',
    },
    {
      id: 'table.no-caption',
      severity: 'check',
      // Fires on 40 of 40 ministry press releases, 119 of the 131 hits being the masthead
      // table at the top of the page (docs/plans/ai-friendly-docs.md 8.1).
      enabled: false,
      principle: 'tables',
      title: '제목 없는 표',
      why: '가이드라인은 표와 그림의 위에 제목을 적으라고 합니다. 제목이 없으면 무엇을 보는 표인지 알 수 없습니다.',
    },
    {
      id: 'table.decorative',
      severity: 'check',
      enabled: true,
      principle: 'tables',
      title: '1칸짜리 표',
      why: '"표를 활용한 제목" 같은 꾸미기용 표인지 확인합니다. 제목은 본문 문단으로 씁니다.',
    },
    {
      id: 'figure.no-caption',
      severity: 'check',
      // Every picture of every press release fires: those images are illustrations, not
      // figures that need a title (docs/plans/ai-friendly-docs.md 8.1).
      enabled: false,
      principle: 'tables',
      title: '제목 없는 그림',
      why: '가이드라인은 그림의 위에 제목을 적으라고 합니다.',
    },
    {
      id: 'numbering.mixed',
      severity: 'check',
      enabled: false,
      principle: 'prose',
      title: '같은 깊이에 다른 번호',
      why: '가이드라인은 번호 체계를 Ⅰ. → 1. → 가. → 1) → 가) → (1) → (가) → ① → ㉮ 로 정했습니다. 한 깊이에서 두 가지를 섞으면 순서가 흐려집니다.',
    },
    {
      id: 'numbering.order',
      severity: 'check',
      enabled: false,
      principle: 'prose',
      title: '건너뛴 번호 단계',
      why: '가이드라인의 번호 사다리를 건너뛰면 어느 항목이 어느 항목 아래인지 드러나지 않습니다.',
    },
    {
      id: 'blank.run',
      severity: 'suggestion',
      enabled: false,
      principle: 'prose',
      title: '이어진 빈 줄',
      why: '가이드라인은 분량을 채우려고 빈 줄을 늘리는 "보고서 꾸미기"를 하지 말라고 합니다.',
    },
  ],
}
