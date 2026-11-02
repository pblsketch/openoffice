/**
 * The theme panel: the look of the whole map on the sheet that is open.
 *
 * A theme is three choices, and the panel has one list for each: the shape
 * (skeleton), the colour band and the ground variant. Picking in one list
 * keeps the other two, so every click is one of the 96 themes.
 *
 * Below them are two switches for the lines of the whole sheet: lines that
 * taper towards the main topics, and a colour of the band for each main
 * branch. Like a theme, they are written to the sheet when switched, are not
 * steps of the history, and stay when another theme is picked.
 *
 * The panel itself is chrome and takes the app's colours from tokens. The
 * small pictures in it show map colours: those are document content, come
 * straight from the engine's theme data and look the same whether the app is
 * light or dark. They are drawn here as schematic maps, not copied from
 * anywhere.
 */
import type { ReactNode } from 'react'
import type { MapLineSettings } from '../map/line-resolve'
import {
  parseThemeId,
  THEME_BAND_IDS,
  THEME_BANDS,
  THEME_SKELETON_IDS,
  THEME_VARIANT_IDS,
  themeId,
  themeLook,
  type ThemeBandId,
  type ThemeId,
  type ThemeLook,
  type ThemeParts,
  type ThemeSkeletonId,
  type ThemeVariantId,
} from '@genoffice/xmind-engine'
import { type StringKey, useI18n } from '../i18n/locale'
import { IconClose } from './icons'

export interface ThemePanelProps {
  /** the theme the open sheet is drawn with */
  themeId: ThemeId
  /** false while that is the default look standing in for a theme this app did not write */
  written: boolean
  disabled: boolean
  /** the map-wide line settings the sheet is drawn with */
  lines: MapLineSettings
  onPick(id: ThemeId): void
  onTapered(on: boolean): void
  onRainbow(on: boolean): void
  onClose(): void
}

export const SKELETON_NAME: Readonly<Record<ThemeSkeletonId, StringKey>> = {
  pill: 'skeletonPill',
  capsule: 'skeletonCapsule',
  line: 'skeletonLine',
  block: 'skeletonBlock',
}

export const BAND_NAME: Readonly<Record<ThemeBandId, StringKey>> = {
  paper: 'bandPaper',
  slate: 'bandSlate',
  moss: 'bandMoss',
  harbor: 'bandHarbor',
  clay: 'bandClay',
  plum: 'bandPlum',
  signal: 'bandSignal',
  poppy: 'bandPoppy',
}

export const VARIANT_NAME: Readonly<Record<ThemeVariantId, StringKey>> = {
  light: 'groundLight',
  dark: 'groundDark',
  tint: 'groundTint',
}

export function ThemePanel(p: ThemePanelProps) {
  const { t } = useI18n()
  const parts = parseThemeId(p.themeId)!
  const pick = (change: Partial<ThemeParts>): void => p.onPick(themeId({ ...parts, ...change }))
  return (
    <aside className="mm-theme-panel" aria-label={t('themeTitle')} data-theme-id={p.themeId}>
      <header className="mm-theme-head">
        <h2 className="mm-theme-title">{t('themeTitle')}</h2>
        <button
          type="button"
          className="mm-theme-close"
          data-action="theme-close"
          aria-label={t('btnClose')}
          data-tip={t('btnClose')}
          onClick={p.onClose}
        >
          <IconClose />
        </button>
      </header>
      <div className="mm-theme-body">
        {!p.written && (
          <p className="mm-theme-note" data-theme-note="not-written">
            {t('themeNotWritten')}
          </p>
        )}

        <Group label={t('themeSkeleton')} kind="skeleton">
          {THEME_SKELETON_IDS.map((skeleton) => (
            <Option
              key={skeleton}
              kind="skeleton"
              value={skeleton}
              name={t(SKELETON_NAME[skeleton])}
              selected={parts.skeleton === skeleton}
              disabled={p.disabled}
              onPick={() => pick({ skeleton })}
            >
              <SkeletonPicture look={themeLook(themeId({ ...parts, skeleton }))} />
            </Option>
          ))}
        </Group>

        <Group label={t('themeBand')} kind="band">
          {THEME_BAND_IDS.map((band) => (
            <Option
              key={band}
              kind="band"
              value={band}
              name={t(BAND_NAME[band])}
              selected={parts.band === band}
              disabled={p.disabled}
              onPick={() => pick({ band })}
            >
              <span className="mm-band-strip" aria-hidden="true">
                {THEME_BANDS[band].map((color, at) => (
                  <span key={at} style={{ background: color }} />
                ))}
              </span>
            </Option>
          ))}
        </Group>

        <Group label={t('themeGround')} kind="variant">
          {THEME_VARIANT_IDS.map((variant) => (
            <Option
              key={variant}
              kind="variant"
              value={variant}
              name={t(VARIANT_NAME[variant])}
              selected={parts.variant === variant}
              disabled={p.disabled}
              onPick={() => pick({ variant })}
            >
              <GroundPicture look={themeLook(themeId({ ...parts, variant }))} />
            </Option>
          ))}
        </Group>

        <section className="mm-theme-group" data-theme-group="lines">
          <h3 className="mm-theme-label">{t('themeLines')}</h3>
          <div className="mm-theme-switches">
            <Switch
              action="theme-tapered"
              label={t('themeTapered')}
              on={p.lines.tapered}
              disabled={p.disabled}
              onSwitch={p.onTapered}
            />
            <Switch
              action="theme-rainbow"
              label={t('themeRainbow')}
              on={p.lines.rainbow}
              disabled={p.disabled}
              onSwitch={p.onRainbow}
            />
          </div>
        </section>

        <p className="mm-theme-hint">{t('themePerSheet')}</p>
      </div>
    </aside>
  )
}

function Group(p: { label: string; kind: string; children: ReactNode }) {
  return (
    <section className="mm-theme-group" data-theme-group={p.kind}>
      <h3 className="mm-theme-label">{p.label}</h3>
      <div
        className={`mm-theme-options mm-theme-${p.kind}s`}
        role="radiogroup"
        aria-label={p.label}
      >
        {p.children}
      </div>
    </section>
  )
}

function Option(p: {
  kind: 'skeleton' | 'band' | 'variant'
  value: string
  name: string
  selected: boolean
  disabled: boolean
  onPick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={p.selected}
      className={`mm-theme-option${p.selected ? ' on' : ''}`}
      data-theme-pick={`${p.kind}:${p.value}`}
      disabled={p.disabled}
      // the map keeps the keyboard, as with the toolbar
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onPick}
    >
      <span className="mm-theme-picture">{p.children}</span>
      <span className="mm-theme-name">{p.name}</span>
    </button>
  )
}

/** A setting that is on or off, switched by a press. */
function Switch(p: {
  action: string
  label: string
  on: boolean
  disabled: boolean
  onSwitch(on: boolean): void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={p.on}
      className={`mm-theme-switch${p.on ? ' on' : ''}`}
      data-action={p.action}
      disabled={p.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => p.onSwitch(!p.on)}
    >
      <span className="mm-theme-switch-track" aria-hidden="true">
        <span className="mm-theme-switch-knob" />
      </span>
      <span className="mm-theme-switch-label">{p.label}</span>
    </button>
  )
}

// ---- the small pictures: schematic maps in the colours of a look ----

/** A topic of the schematic map: its box as the skeleton draws it, and a bar where its text would be. */
function SketchTopic(p: {
  x: number
  y: number
  width: number
  height: number
  radius: number
  fill: string | null
  border: string | null
  text: string
  textWidth: number
}) {
  const middle = p.y + p.height / 2
  const inset = (p.width - p.textWidth) / 2
  return (
    <>
      <rect
        x={p.x}
        y={p.y}
        width={p.width}
        height={p.height}
        rx={Math.min(p.radius, p.height / 2)}
        fill={p.fill ?? 'none'}
        stroke={p.border ?? 'none'}
        strokeWidth={p.border ? 1.25 : 0}
      />
      <path
        d={`M${p.x + inset} ${middle}H${p.x + p.width - inset}`}
        stroke={p.text}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </>
  )
}

/** Half of a schematic map: the centre, two main branches to the right and what hangs below them. */
function SkeletonPicture({ look }: { look: ThemeLook }) {
  const { shapes } = look
  const underlined = shapes.main.border === 'underline'
  const elbow = look.lines.sub.shape === 'rounded-elbow'
  const centre = { x: 9, y: 25, width: 36, height: 18 }
  const mains = [
    { y: 9, branch: look.branches[0]! },
    { y: 47, branch: look.branches[1]! },
  ]
  return (
    <svg viewBox="0 0 120 68" aria-hidden="true" focusable="false">
      <rect width="120" height="68" fill={look.ground} />
      {mains.map(({ y, branch }, at) => {
        const middle = y + 6
        const base = y + 12
        const end = underlined ? base : middle
        const subs = [middle - 6, middle + 6]
        return (
          <g key={at} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path
              d={`M45 34C55 34 54 ${end} 64 ${end}${underlined ? 'H94' : ''}`}
              stroke={branch.color}
              strokeWidth="1.75"
            />
            {subs.map((sub, index) => {
              const from = underlined ? base : middle
              const to = underlined ? sub + 3.5 : sub
              const path = elbow
                ? `M94 ${from}H97V${to}H100`
                : `M94 ${from}C97.5 ${from} 97 ${to} 100.5 ${to}`
              return (
                <g key={index}>
                  <path
                    d={underlined ? `${path}H113` : path}
                    stroke={branch.color}
                    strokeWidth="1.1"
                    opacity={look.lines.sub.opacity}
                  />
                  {branch.sub.fill && (
                    <rect
                      x="100"
                      y={sub - 3.75}
                      width="14"
                      height="7.5"
                      rx="2.5"
                      fill={branch.sub.fill}
                      stroke="none"
                    />
                  )}
                  <path
                    d={`M103 ${sub}H${branch.sub.fill ? 111 : 113}`}
                    stroke={branch.sub.text}
                    strokeWidth="1.75"
                    opacity="0.8"
                  />
                </g>
              )
            })}
            <SketchTopic
              x={64}
              y={y}
              width={30}
              height={12}
              radius={shapes.main.radius}
              fill={branch.main.fill}
              border={shapes.main.border === 'outline' ? branch.main.border : null}
              text={branch.main.text}
              textWidth={underlined ? 24 : 16}
            />
          </g>
        )
      })}
      <g fill="none">
        <SketchTopic
          {...centre}
          radius={shapes.central.radius * 0.45}
          fill={look.central.fill}
          border={look.central.border}
          text={look.central.text}
          textWidth={20}
        />
      </g>
    </svg>
  )
}

/** A whole map from afar: what the ground variant does to the band. */
function GroundPicture({ look }: { look: ThemeLook }) {
  const ends = [
    { x: 58, y: 9, side: 1 },
    { x: 58, y: 35, side: 1 },
    { x: 14, y: 9, side: -1 },
    { x: 14, y: 35, side: -1 },
  ]
  return (
    <svg viewBox="0 0 72 44" aria-hidden="true" focusable="false">
      <rect width="72" height="44" fill={look.ground} />
      <g fill="none" strokeLinecap="round">
        {ends.map(({ x, y, side }, at) => {
          const branch = look.branches[at % look.branches.length]!
          const from = 36 + side * 10
          return (
            <g key={at} stroke={branch.color}>
              <path
                d={`M${from} 22C${from + side * 7} 22 ${x - side * 7} ${y} ${x} ${y}`}
                strokeWidth="1.5"
              />
              <path d={`M${x} ${y}h${side * 8}`} strokeWidth="3.5" />
            </g>
          )
        })}
      </g>
      <rect
        x="24"
        y="16"
        width="24"
        height="12"
        rx="5"
        fill={look.central.fill ?? look.ground}
        stroke={look.central.border ?? 'none'}
        strokeWidth={look.central.border ? 1.25 : 0}
      />
    </svg>
  )
}
