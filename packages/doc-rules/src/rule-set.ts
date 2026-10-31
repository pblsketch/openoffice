/** Every rule this build can check. An institution rule set picks from these. */
export const RULE_IDS = [
  'font.hangul-only',
  'font.outside-recommended',
  'table.nested',
  'table.deep-merge',
  'table.no-caption',
  'table.decorative',
  'figure.no-caption',
  'numbering.mixed',
  'numbering.order',
  'blank.run',
] as const

export type RuleId = (typeof RULE_IDS)[number]

/**
 * violation: the document structure settles it, so it is safe to call it wrong.
 * check: the structure is known but a person has to decide what it means.
 * suggestion: a matter of habit or taste; off by default.
 */
export type Severity = 'violation' | 'check' | 'suggestion'

/** Which of the guideline's three principles a rule comes from. */
export type Principle = 'prose' | 'compatibility' | 'tables'

export type RuleSetting = {
  id: RuleId
  severity: Severity
  /** on by default */
  enabled: boolean
  /** shown as the finding's title (Korean: the rule set targets Korean documents) */
  title: string
  /** one line under the title, saying why it matters */
  why: string
  principle: Principle
}

/** Numbers a rule set can move without changing code. */
export type RuleLimits = {
  /** share of a table's grid slots a merge may cover before the table counts as merged-heavy */
  mergedShare: number
  /** a vertical merge starting below the first row, this many rows tall, is a body merge */
  mergedRowSpan: number
  /** empty paragraphs in a row before it counts as filler */
  blankRun: number
}

export type RuleSet = {
  id: string
  version: number
  /** shown once at the top of the panel: whose guideline this is */
  title: string
  /** where the rules come from, for the "read the original" link */
  source: string
  limits: RuleLimits
  rules: readonly RuleSetting[]
}
