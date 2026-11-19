---
name: Journal
description: A personal Growth journal set as one botanical folio plate, on Android and the web.
colors:
  plate-cream: "#f3eee2"
  plate-paper: "#faf7ef"
  fruit-black-ink: "#1d1c19"
  graphite: "#57544c"
  sepia-hairline: "#d3c8ae"
  sepia-edge: "#8c8268"
  leaf-green: "#2f5e34"
  pressed-tint: "#e7dfcc"
  weed-scarlet: "#a8261c"
  stage-seed: "#7a5a1e"
  stage-sprout: "#3f7a3a"
  stage-plant: "#2f5e34"
  stage-tree: "#1f4224"
  series-mood: "#2f5e34"
  series-tense: "#8a5a12"
  series-low: "#2f5a8a"
  series-tired: "#2b6660"
  series-sleep: "#6a4a86"
  night-ground: "#141811"
  night-paper: "#1c2118"
  night-cream-ink: "#ece6d4"
  night-graphite: "#b3ad9b"
  night-hairline: "#3a4033"
  night-edge: "#6f7864"
  night-leaf: "#9cc78e"
  night-pressed-tint: "#262c21"
  night-scarlet: "#ec7f70"
typography:
  display:
    fontFamily: "Alegreya_500Medium_Italic"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.25
  headline:
    fontFamily: "Alegreya_400Regular_Italic"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.25
  title:
    fontFamily: "Alegreya_400Regular_Italic"
    fontSize: "1.25rem"
    fontWeight: 400
  body:
    fontFamily: "AlegreyaSans_400Regular"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"tnum"'
  label:
    fontFamily: "AlegreyaSansSC_500Medium"
    fontSize: "0.95rem"
    fontWeight: 500
    letterSpacing: "0.025em"
  label-strong:
    fontFamily: "AlegreyaSansSC_700Bold"
    fontSize: "1rem"
    fontWeight: 700
    letterSpacing: "0.025em"
  stage:
    fontFamily: "Alegreya_400Regular_Italic"
    fontSize: "0.95rem"
    fontWeight: 400
rounded:
  button: "3px"
  sm: "0.225rem"
  arch: "9999px 9999px 0 0"
spacing:
  xs: "0.375rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.75rem"
  page-gutter: "1rem"
  page-frame: "64rem"
  touch-min: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.leaf-green}"
    textColor: "{colors.plate-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 1rem"
    height: "3rem"
  button-outline:
    backgroundColor: "{colors.plate-paper}"
    textColor: "{colors.fruit-black-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 1rem"
    height: "3rem"
  button-outline-pressed:
    backgroundColor: "{colors.pressed-tint}"
  button-ghost-pressed:
    backgroundColor: "{colors.pressed-tint}"
    textColor: "{colors.fruit-black-ink}"
  choice-chip:
    backgroundColor: "{colors.plate-paper}"
    textColor: "{colors.fruit-black-ink}"
    rounded: "{rounded.button}"
    padding: "0 0.875rem"
    height: "3rem"
  choice-chip-selected:
    backgroundColor: "{colors.leaf-green}"
    textColor: "{colors.plate-paper}"
  input:
    backgroundColor: "{colors.plate-cream}"
    textColor: "{colors.fruit-black-ink}"
    rounded: "{rounded.button}"
    height: "3rem"
  zone-plate:
    backgroundColor: "{colors.plate-paper}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.arch}"
  zone-plate-half-on:
    backgroundColor: "{colors.leaf-green}"
    textColor: "{colors.plate-paper}"
  tracker-cell:
    textColor: "{colors.fruit-black-ink}"
    rounded: "{rounded.button}"
    height: "3rem"
  tracker-cell-done:
    backgroundColor: "{colors.leaf-green}"
    textColor: "{colors.plate-paper}"
  tracker-cell-weed-logged:
    backgroundColor: "{colors.fruit-black-ink}"
    textColor: "{colors.plate-cream}"
  tab:
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
  tab-active:
    textColor: "{colors.leaf-green}"
---

# Design System: Journal

<!-- Ported from the `journal` repo's DESIGN.md (2026-11-09). The folio is the target; "Implementation Gaps" lists where src/ui still differs. -->

## Overview

**Creative North Star: "The Botanical Folio"**

Every screen is one engraved plate from a naturalist's folio. A cream ground carries sepia hairline rules and fruit-black ink. Leaf green is the only colour that says "this is chosen" or "this is done". Scarlet appears in one place only: a weed over its ceiling.

The plate is calm and quiet, built for a phone and for low capacity. Structure comes from rules and frames, not from cards or shadows. Headings are set in Alegreya italic, like a plate caption. Running text is Alegreya Sans. Small labels on controls are Alegreya Sans SC. Imagery is line engraving: hatching and cross-hatching stand in for tone.

At night the plate turns to pressed-leaf green-black with cream ink. Night follows the device setting only (`userInterfaceStyle: automatic`); there is no manual toggle.

The world rejects the wellness stack of rounded cards and emoji faces, and the wide spreadsheet tracker.

**Key Characteristics:**

- Cream plate, sepia rules, fruit-black ink.
- Leaf green marks done and selected; scarlet marks only a weed over its ceiling.
- Italic serif headings, humanist sans text, small-caps labels.
- Engraved double hairlines divide sections.
- Arch-topped frames and engraved line art, never filled illustration.
- Flat: depth comes from inner hairlines and offset outlines, not drop shadows.

## Colors

A warm, low-contrast paper palette with one green voice and one red warning. The tokens live in `src/ui/tokens.css` under shadcn names, so React Native Reusables classes resolve; the frontmatter slugs map to them as below.

### Primary

- **Leaf Green** (`leaf-green`, `--color-primary`, `--color-ring`): selected chips, a lit zone half, done tracker cells, today's day label, the active tab, links and focus rings.

### Tertiary

- **Weed Scarlet** (`weed-scarlet`, `--color-destructive`): the progress text of a bad Habit over its ceiling. Also the destructive token.

### Neutral

- **Plate Cream** (`plate-cream`, `--color-background`): the page ground; the Offline bar's label.
- **Plate Paper** (`plate-paper`, `--color-card`, `--color-popover`): raised paper inside a frame: zone plates, sheets, outline buttons. Also text on leaf green.
- **Fruit-Black Ink** (`fruit-black-ink`, `--color-foreground`): body text and headings; the fill of a logged weed day and of the Offline bar, whose status bar icons invert to match.
- **Graphite** (`graphite`, `--color-muted-foreground`): hints, legends, inactive tabs and day labels.
- **Sepia Hairline** (`sepia-hairline`, `--color-border`): row dividers, form borders, the offset outer outline of frames.
- **Sepia Edge** (`sepia-edge`, `--color-input`): the stronger engraved line: double rules, plate borders, input and outline-button strokes.
- **Pressed Tint** (`pressed-tint`, `--color-muted`, `--color-accent`, `--color-secondary`): pressed backgrounds; a missed good-Habit cell; the ground beside the wide page frame.

### Garden Stages

The stage name under each Habit takes its own ink: **Seed** (`stage-seed`), **Sprout** (`stage-sprout`), **Plant** (`stage-plant`), **Tree** (`stage-tree`). These colour text only, never fills.

### Night

Each light token has a night twin under Uniwind's `@variant dark`: `night-ground`, `night-paper`, `night-cream-ink`, `night-graphite`, `night-hairline`, `night-edge`, `night-leaf`, `night-pressed-tint`, `night-scarlet`. Stage and series inks lighten to stay readable on the green-black ground.

### Chart series

The Check-ins chart draws each series in its own token: `series-mood` (leaf green), `series-tense` (ochre), `series-low` (ink blue), `series-tired` (slate teal, dotted) and `series-sleep` (plum). Each has a night twin and stays above 5:1 on plate paper. Mood always shows; the others are toggle chips under the plot.

### Named Rules

**The One Green Voice Rule.** Leaf green means selected, done, today or a link. Never use it for decoration.

**The Single Red Rule.** Scarlet marks only a weed over its ceiling and destructive actions. A logged weed day is plain ink; a missed day is neutral tint.

## Typography

**Display Font:** Alegreya Variable, italic (with serif)
**Body Font:** Alegreya Sans (with sans-serif)
**Label Font:** Alegreya Sans SC (with sans-serif)

**Character:** One family in three voices. The italic serif captions the plate; the sans reads; the small caps label the controls.

Body text is 17px with tabular numerals, so counts and dates line up.

Each role names one loaded face, not a family plus a weight: Android can't pick a weight or italic out of a custom family. `src/lib/fonts.ts` loads the seven faces with `expo-font` behind the splash screen; the `--font-*` tokens in `tokens.css` name them, as the classes `font-sans`, `font-sans-medium`, `font-sans-bold`, `font-caption`, `font-display`, `font-label` and `font-label-bold`. `Text` carries the roles as variants: `display`, `headline`, `title`, `label` and `muted`. Never add `font-bold`, `font-semibold` or `italic` on top; pick the face instead.

### Hierarchy

- **Display** (Alegreya italic 500, 2rem, 1.25): the date at the top of Today.
- **Headline** (Alegreya italic 400, 1.5rem, 1.25): section headings such as "How's the weather?".
- **Title** (Alegreya italic 400, 1.25rem): sheet and sub-panel headings.
- **Body** (Alegreya Sans 400, 17px, 1.5): text, Habit names (500), hints and legends in graphite.
- **Label** (Alegreya Sans SC 500, 0.95rem, slight tracking): buttons, tabs, day headers (0.85rem), zone halves (0.9rem).
- **Label Strong** (Alegreya Sans SC 700, 1rem): zone names under the plates.
- **Stage** (Alegreya italic, 0.95rem): the garden stage under a Habit name, in its stage ink.

### Named Rules

**The Caption Rule.** Headings are always Alegreya italic. Never set a heading in the sans or in small caps.

**The Small Caps Labels Controls Rule.** Small caps name a control or a column: a button, a tab, a day, a zone. They never float above a heading as a decorative label.

## Layout

- **Phones (below 768px)**: one column with a 1rem gutter and a bottom tab bar.
- **Wide (768px and up)**: the tabs move to a compact top bar sized to each label (at most 144px a tab), and list screens show their detail beside them (two panes).
- **Page frame (1024px and up)**: the app keeps a centred 64rem frame with sepia hairlines at its sides, on a pressed-tint ground. Tab bar, headers and panes share its edges.
- **Zone plates**: four columns on one shared baseline, Storm left to Sun right.
- **Habit tracker**: each row stacks name over a fixed seven-day strip on phones; on wide screens the name sits left and the strip right. The strip never scrolls sideways.
- **Rhythm**: sections open with a double rule and 1.25rem above the heading; fields step 1.25rem apart; chips and buttons sit 0.5rem apart.
- **Touch**: every tap target is at least 3rem (48dp) tall, Android's minimum, because a miss in Storm edits the wrong day. Web keeps the same sizes, since it runs on phones too.
- No horizontal scroll at 390px.

## Elevation & Depth

The folio is flat. No element casts a drop shadow. Depth reads as engraving: a frame gets a solid border plus a second hairline outline offset 3px outside it, and filled buttons carry a thin inner hairline 2px inside the edge. React Native has no inset `box-shadow` on Android, so draw the inner hairline as a nested view with its own 1px border.

### Shadow Vocabulary

- **Inner hairline, filled**: a 1px border in paper at 45% opacity, inset 2px inside primary buttons, selected chips and done cells.
- **Inner hairline, outline**: a 1px sepia-hairline border, inset 2px inside outline buttons and chips at rest.
- **Offset frame**: a 1px sepia-hairline border 3px outside zone plates and sheets.

### Named Rules

**The Engraved Not Lifted Rule.** Show depth with doubled lines. Never add a blur shadow, an offset drop shadow or Android elevation.

## Shapes

Corners are nearly square. Buttons, chips and inputs use a 3px radius; panels use a small radius (about 0.225rem). The one curved form is the arch: a zone plate is a column with a fully rounded top and square foot. Avatars stay round.

Sections are divided by an engraved double hairline (3px double, sepia edge). Rows inside a section are split by a single sepia hairline.

**The Arch Rule.** The arch frames a Storm to Sun zone. It is the system's signature silhouette; reuse it for zone-like specimens, not for generic cards.

## Components

The shared components live in `src/ui/components`. App-only components live in `src/components`.

### Buttons

Pressed into the paper, not floating on it. `Button` in `src/ui`.

- **Shape:** near-square corners (3px).
- **Primary:** leaf green fill, paper text, small-caps label, inner hairline. Pressed lightens to 85%.
- **Outline:** paper fill, sepia-edge stroke, inner sepia hairline. Pressed shifts to pressed tint.
- **Ghost:** no fill; pressed tint when pressed.
- **Destructive:** scarlet text on a 10% scarlet wash.
- **Focus (web):** a 2px leaf-green ring, offset 2px.

### Chips

- **Style:** outline buttons at 3rem tall with a 3px radius and a sepia-edge stroke, 0.875rem side padding, body-size text.
- **State:** selected becomes the primary fill; tapping again clears it. Lists of chips end with an "Other" choice that reveals a text field.
- **Rating scale:** six chips 0 to 5 in one row, with "Not at all" and "Extremely" in graphite below.

### Cards / Containers

- **Corner Style:** small radius (about 0.225rem).
- **Background:** plate paper.
- **Shadow Strategy:** offset frame only (see Elevation & Depth).
- **Border:** sepia hairline.
- **Internal Padding:** 1rem, 1.25rem on wide screens.

### Inputs / Fields

- **Style:** sepia-edge stroke, plate-cream fill, at least 3rem tall, leaf-green caret. `Input` in `src/ui`.
- **Dates and times:** an outline button that opens Android's date or clock dialog (`DateField`, `TimeField` in `src/ui`); never a typed text box. Oxlint's `journal/prefer-date-time-picker` enforces it.
- **Focus:** leaf-green border and a solid 2px leaf-green ring; a 50% ring falls under 3:1 on paper.

### Switches

- **Style:** a small leaf-green track beside its label; the whole row is one switch, at least 3rem tall. `Switch` in `src/ui` takes the label as children.

### Navigation

- **Tabs:** Today, Habits, Check-ins, Connections and Notes, each a 1.5px line icon (lucide) with a small-caps label. Five is Android's maximum, so nothing hides behind a More sheet.
- **Phones:** a bottom tab bar on the cream ground, under a double rule.
- **Wide:** a compact top bar inside the page frame, icon beside label.
- **States:** inactive in graphite; active in leaf green.

### Zone Plate

The Check-in's four arch-topped plates (`check-in-card.tsx`). Each plate is a paper column with a sepia-edge border and offset frame. Its taller upper half holds a line engraving; its shorter lower half sits under a hairline. Both halves are buttons labelled "upper" and "lower" in small caps. A tapped half fills leaf green and stays lit. The zone name sits beneath in bold small caps.

### Zone Engraving

Line art for Storm, Rain, Cloud and Sun, drawn in the current text colour with round caps. Tone deepens from Sun to Storm through hatching: Cloud hatches its lower body, Rain adds cross-hatching and rain strokes, Storm cross-hatches everything and adds a bolt.

### Habit Tracker Row

A Habit name, its stage in italic stage ink, and progress text ("0 of 7 this week") in graphite. Below or beside sits the seven-day strip. Empty cells are bare outline squares. A done cell is leaf green with a line check. A missed good Habit is pressed tint with a line cross. A logged weed day is ink-filled. A day not due shows an en dash. Over a weed's ceiling, the progress text turns bold scarlet.

### Field Row

Each field of a Habit, Check-in or Connection is one full-width row: a small-caps label in graphite, the value in ink, and a sepia chevron. Rows are split by sepia hairlines and are at least 3rem tall. An empty field reads "Add" in graphite. Tapping a row edits that one field in a bottom sheet with Cancel and Save side by side.

## Do's and Don'ts

### Do

- **Do** open each section with the engraved double rule (3px double, sepia edge).
- **Do** set every heading in Alegreya italic and every control label in Alegreya Sans SC.
- **Do** keep every tap target at least 3rem (48dp) tall.
- **Do** draw icons and illustration as thin line engravings in the current text colour, with hatching for tone.
- **Do** give every light colour token a night twin under `@variant dark` in `tokens.css`.
- **Do** use the shadcn token classes (`bg-primary`, `text-muted-foreground`), never raw hex in components.

### Don't

- **Don't** use scarlet for anything except a weed over its ceiling or a destructive action.
- **Don't** use leaf green as decoration; it means selected, done, today or a link.
- **Don't** add blur shadows, offset drop shadows or Android elevation; depth is doubled hairlines.
- **Don't** use rounded wellness cards, emoji faces or filled illustrations.
- **Don't** let the seven-day strip scroll sideways or grow into a wide spreadsheet.
- **Don't** put small-caps labels above headings as decoration.

## Implementation Gaps

Where `src/ui` still ships React Native Reusables defaults instead of the folio (as of 2026-11-09). Close these in design passes; don't copy the defaults into new work.

- **Today's date:** it sits in the header in the caption face at the header's size, not in Display.
- **Corners:** `Button` and `Input` use `rounded-md` (about 6px), and some panels use `rounded-lg`, not 3px.
- **Shadows:** `Button` variants carry `shadow-sm shadow-black/5`; one surface uses `shadow-lg`.
- **Rules:** sections have no engraved double rule.
- **Zone editor:** editing a saved Check-in's zone uses plain chips, not the plates.
