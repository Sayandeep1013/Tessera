# Newt Clone --- Reverse-Engineering Report, PRD, Technical Architecture & Agent Build Specification

**Research date:** 10 August 2026\
**Reference product:** Newt --- https://newt.sh/\
**Purpose:** Build a functionally equivalent, code-native pixel-art
editor inspired by Newt, while clearly separating verified observations
from implementation hypotheses and proposed improvements.

------------------------------------------------------------------------

## 0. Executive summary

Newt is a browser-based pixel-art editor whose central product idea is
**"pixel art, code underneath."** Its public description says that users
can paint like a normal raster editor while every pixel remains a color
token in editable code. Public descriptions also identify SVG, CSS,
React, PNG, and GIF export.

The most important insight for a clone is therefore:

> **Do not make PNG the source of truth. Make a structured pixel-art
> document the source of truth, and render/export that document into
> images and code.**

The visible application is intentionally minimal. The current indexed UI
exposes:

-   Square / Round brush controls
-   Solid mode
-   Color input
-   Share
-   Sign in
-   "Ask Newt... 'make it angrier'" AI input
-   A `47×` canvas control/indicator

The public site does **not** expose enough information to establish
Newt's exact framework, database, authentication provider, AI provider,
network architecture, internal schema, or keyboard shortcut set. Those
details must be treated as unknowns rather than invented facts.

This document therefore has three layers:

1.  **Observed / externally documented behavior**
2.  **Reasonable technical inference**
3.  **Recommended architecture for our clone**

The recommended clone should go further than a visual copy. It should
provide a bidirectional **visual ↔ structured-code** workflow, an AI
editing agent that operates on structured pixel commands, animation,
exporters, sharing, remixing, version history, and a community layer.

------------------------------------------------------------------------

# 1. Research confidence model

Use these labels throughout implementation:

### CONFIRMED

Directly visible on the public Newt page or explicitly described by a
credible public source.

### REPORTED

Described by an independent catalog/review or public post, but not
independently verified in the application's internals.

### INFERRED

A technical conclusion that follows naturally from the observed product
behavior, but is not proof of Newt's actual implementation.

### PROPOSED

Our recommended implementation for the clone. It should not be described
as Newt's architecture.

This distinction is critical. We are reverse-engineering behavior, not
claiming access to private source code.

------------------------------------------------------------------------

# 2. Product identity

## 2.1 Product name

Newt

## 2.2 Domain

https://newt.sh/

## 2.3 Positioning

The public product positioning is essentially:

> Pixel art, code underneath.

Pablo Stanley publicly described Newt as a pixel-art tool where every
pixel is code rather than raster data, and linked to newt.sh when
introducing it.

## 2.4 Core promise

Traditional pixel editor:

``` text
draw → raster image
```

Newt concept:

``` text
draw
  ↓
structured pixel representation
  ↓
visual rendering
  +
editable code
  +
developer-oriented exports
```

This is the product's most important differentiator.

------------------------------------------------------------------------

# 3. Publicly confirmed feature inventory

## 3.1 Pixel-art editing

Confirmed/reported.

The product behaves as a pixel-art canvas rather than a conventional
freeform vector editor.

## 3.2 Code-native pixel representation

Confirmed by the product's public description and independent coverage.

The important conceptual behavior is that pixels are represented as
color tokens / editable code rather than only being stored as a
flattened raster.

## 3.3 Brush controls

The current public UI exposes:

``` text
Square
Round
```

These should be treated as confirmed brush-shape controls.

## 3.4 Solid mode

The current UI exposes:

``` text
Solid
```

The exact complete mode taxonomy is not publicly documented, so do not
invent additional Newt modes.

## 3.5 Color input

The public UI contains a color input/control associated with drawing.

## 3.6 AI editing

The current UI exposes:

``` text
Ask Newt… “make it angrier”
```

This is strong evidence that AI is positioned as an editor of the
current artwork rather than only as an unrelated image generator.

## 3.7 Sharing

The current UI exposes:

``` text
Share
```

The exact share URL format and permissions are not publicly documented.

## 3.8 Authentication

The current UI exposes:

``` text
Sign in
```

The provider and authentication implementation are not publicly
established.

## 3.9 Export

Independent public descriptions report:

-   SVG
-   CSS
-   React
-   PNG
-   GIF

The descriptions characterize these as exports from the code-native
pixel representation.

## 3.10 Animation

GIF export is publicly reported, implying animated/multi-frame output
capability.

The exact timeline UX, frame controls, frame limits, playback controls,
and timing model are not publicly documented.

## 3.11 Themes / PWA

An independent AI UX Playground entry describes dark/light themes and a
PWA-friendly layout. Treat these as reported rather than as
source-code-confirmed implementation details.

------------------------------------------------------------------------

# 4. What Newt is NOT

Do not conceptualize Newt as:

``` text
AI image generator + pixel filter
```

That misses the product.

The stronger model is:

``` text
structured pixel editor
        +
code generator
        +
AI structured editor
```

A clone that merely asks an image model to create pixel-art PNGs will
reproduce the appearance but not the core product idea.

------------------------------------------------------------------------

# 5. Current visible UI

The current indexed page exposes approximately this control surface:

``` text
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                 PIXEL ART CANVAS                        │
│                                                         │
│                                                         │
│                                                         │
│                                                         │
│                                                         │
│                                                         │
│     [Square] [Round]                                    │
│     Solid                                               │
│     [color input]                                       │
│                                                         │
│                              Share    Sign in            │
│                                                         │
│     [ Ask Newt… “make it angrier” ]                     │
│                                                         │
│                                              [47×]      │
└─────────────────────────────────────────────────────────┘
```

This is a conceptual reconstruction, not a pixel-perfect screenshot.

The source page currently exposes the text/controls but not enough
accessible information to establish exact dimensions, coordinates,
fonts, CSS tokens, or DOM structure.

------------------------------------------------------------------------

# 6. Visual design analysis

## 6.1 Design philosophy

The interface is intentionally sparse.

Instead of exposing the visual complexity of professional pixel editors,
the product puts the artwork first.

This creates a hierarchy:

``` text
1. Artwork
2. Simple editing controls
3. AI
4. Sharing/account
```

rather than:

``` text
1. Toolbar
2. Panels
3. Menus
4. Timeline
5. Inspector
6. Artwork
```

## 6.2 Recommended clone visual language

Use:

-   large unobstructed canvas
-   minimal chrome
-   compact controls
-   strong whitespace
-   small utility controls
-   keyboard-first interaction
-   AI prompt integrated into the editor rather than placed on a
    separate "AI page"

## 6.3 Do not overbuild the initial UI

Avoid starting with:

-   giant Photoshop-style toolbar
-   dozens of visible buttons
-   permanent sidebars
-   modal-heavy workflows

Advanced features can live behind contextual menus and shortcuts.

------------------------------------------------------------------------

# 7. Page / route inventory

## 7.1 Public editor

Likely primary experience:

``` text
/
```

Observed behavior:

-   editor is immediately visible
-   sign-in is available
-   sharing is available
-   AI input is available
-   drawing controls are available

## 7.2 Share/public artwork route

A share mechanism is confirmed, but the exact route is unknown.

Recommended clone:

``` text
/a/:artworkId
```

or:

``` text
/art/:slug
```

## 7.3 Authentication

Recommended routes:

``` text
/login
/auth/callback
```

The exact Newt routes/provider are unknown.

## 7.4 User workspace

Recommended:

``` text
/me
/me/artworks
/me/drafts
/me/remixes
```

This is a clone enhancement, not a claim about Newt.

## 7.5 Explore/community

Recommended:

``` text
/explore
/trending
/latest
```

Again, this is proposed functionality rather than confirmed Newt
functionality.

------------------------------------------------------------------------

# 8. Interaction model

## 8.1 Drawing

Minimum interaction:

``` text
pointer down
→ calculate pixel coordinate
→ apply brush
→ update canonical artwork state
→ render
→ record command in history
```

## 8.2 Brush shape

Square:

``` text
████
████
████
████
```

Round:

``` text
 ▄██▄
██████
██████
 ▀██▀
```

The actual brush-size controls are not publicly established, so the
clone should support a configurable brush size while keeping
Square/Round as the visible shape selector.

## 8.3 Color

Recommended:

``` text
color picker
hex input
eyedropper
recent colors
palette
```

Only the basic color input is confirmed for Newt.

## 8.4 Zoom

The public page exposes a `47×` control/indicator.

Treat the exact semantics as unresolved.

For the clone, explicitly separate:

``` text
canvas resolution
from
display zoom
```

Example:

``` text
Artwork: 32×32
Display: 1600% zoom
```

Do not overload a single value for both concepts.

------------------------------------------------------------------------

# 9. Coordinate system

Use integer pixel coordinates:

``` ts
type PixelCoordinate = {
  x: number;
  y: number;
};
```

Canvas dimensions:

``` ts
type CanvasSize = {
  width: number;
  height: number;
};
```

Never store pointer coordinates directly as pixel positions.

Convert:

``` text
screen coordinate
→ canvas-local coordinate
→ integer pixel coordinate
```

Formula:

``` text
pixelX = floor((mouseX - canvasLeft) / displayPixelSize)
pixelY = floor((mouseY - canvasTop) / displayPixelSize)
```

------------------------------------------------------------------------

# 10. Canonical artwork model

The clone's most important architectural decision.

Do NOT use:

``` text
PNG
```

as the canonical document.

Use a structured document.

Recommended:

``` ts
type ArtworkDocument = {
  version: number;
  id: string;

  name: string;

  width: number;
  height: number;

  palette: PaletteEntry[];

  frames: Frame[];

  activeFrame: number;

  metadata: ArtworkMetadata;
};
```

Palette:

``` ts
type PaletteEntry = {
  id: string;
  name?: string;
  color: string;
  alpha: number;
};
```

Frame:

``` ts
type Frame = {
  id: string;
  durationMs: number;

  // palette index per pixel
  pixels: Uint16Array;
};
```

------------------------------------------------------------------------

# 11. Why palette indices are preferable

Instead of storing:

``` text
#ff0000
#ff0000
#ff0000
#ff0000
```

for every pixel, store:

``` text
palette[3]
palette[3]
palette[3]
palette[3]
```

Canvas memory becomes:

``` text
pixel → palette index
```

Example:

``` text
palette:

0 = transparent
1 = outline
2 = skin
3 = shirt
4 = shadow
5 = highlight
```

Pixel matrix:

``` text
0 0 1 1 1 0 0
0 1 2 2 2 1 0
1 2 2 3 2 2 1
1 1 3 3 3 1 1
0 1 1 1 1 1 0
```

Benefits:

-   compact storage
-   easy recoloring
-   semantic palette operations
-   clean source-code export
-   deterministic rendering
-   AI-friendly representation
-   easy animation
-   easy diffing

------------------------------------------------------------------------

# 12. Recommended semantic layer

This is a proposed improvement over the minimal token model.

Add optional semantic regions:

``` ts
type Region = {
  id: string;
  name: string;
  bounds: Rectangle;
  pixels: number[];
  semanticType?: string;
};
```

Examples:

``` text
head
hair
eyes
mouth
body
weapon
background
cloud
tree
```

This allows the AI to understand:

``` text
“make the eyes glow”
```

without having to rediscover the eyes from raw pixels every time.

------------------------------------------------------------------------

# 13. AI architecture

## 13.1 Product behavior to reproduce

The visible prompt:

``` text
Ask Newt… “make it angrier”
```

suggests conversational editing of existing artwork.

The clone should therefore support:

``` text
User instruction
+
Current artwork
→
structured edit
→
preview
→
accept/reject
```

## 13.2 Do not make the AI return PNG

Bad architecture:

``` text
prompt
→ image generation model
→ PNG
→ replace artwork
```

Problems:

-   destroys editability
-   difficult to diff
-   difficult to undo precisely
-   destroys palette identity
-   unpredictable dimensions
-   poor code export
-   difficult animation editing

Preferred:

``` text
prompt
→ LLM / multimodal model
→ structured editing operations
→ validator
→ document mutation
→ render
```

------------------------------------------------------------------------

# 14. AI tool API

Recommended tool set:

``` ts
inspect_artwork()
inspect_palette()
inspect_frame(frameId)
inspect_region(regionId)

set_pixel(x, y, paletteIndex)
set_pixels(pixels)
draw_line(x1, y1, x2, y2, paletteIndex)
draw_rect(x, y, width, height, paletteIndex)
fill_region(x, y, paletteIndex)

recolor_region(regionId, paletteIndex)
replace_color(from, to)
add_palette_color(color)

create_region(name, bounds)
modify_region(regionId, operations)

add_frame()
duplicate_frame(frameId)
delete_frame(frameId)
set_frame_duration(frameId, durationMs)

preview()
validate()
commit()
```

------------------------------------------------------------------------

# 15. AI operation example

User:

``` text
Make it angrier.
```

Agent flow:

``` text
1. inspect_artwork
2. identify face region
3. identify eyes / brows / mouth
4. generate small pixel edits
5. preview
6. validate
7. return proposed diff
```

Possible structured output:

``` json
{
  "operations": [
    {
      "type": "set_pixel",
      "x": 13,
      "y": 8,
      "paletteIndex": 2
    },
    {
      "type": "set_pixel",
      "x": 14,
      "y": 8,
      "paletteIndex": 2
    }
  ]
}
```

The exact coordinates are illustrative.

------------------------------------------------------------------------

# 16. AI safety / validation layer

Every AI mutation should pass:

``` text
schema validation
→ bounds validation
→ palette validation
→ frame validation
→ max-operation validation
→ rendering validation
```

Reject:

``` text
x < 0
y < 0
x >= width
y >= height
invalid palette index
invalid frame
```

Also impose an operation budget:

``` text
simple edit: <= 2,000 pixel operations
complex edit: <= 20,000
```

Use configurable limits.

------------------------------------------------------------------------

# 17. AI conversational history

Recommended:

``` text
AI HISTORY

You:
Make it angrier.

AI:
Changed eyebrows, eyes and mouth.

You:
Make the armor darker.

AI:
Adjusted armor palette.

You:
Animate it blinking.

AI:
Created 4-frame blink animation.
```

Every AI turn should be associated with a document revision.

------------------------------------------------------------------------

# 18. Accept / reject AI edits

Preferred UI:

``` text
┌──────────────────────────────┐
│ AI proposed changes          │
│                              │
│ + 38 pixels                  │
│ ~ 2 palette colors           │
│                              │
│ [Reject]          [Accept]   │
└──────────────────────────────┘
```

This is significantly safer than silently modifying the user's work.

------------------------------------------------------------------------

# 19. Undo / redo architecture

Use command-based history.

``` ts
type EditorCommand =
  | PaintPixelsCommand
  | FillCommand
  | RecolorCommand
  | AddFrameCommand
  | DeleteFrameCommand
  | AIEditCommand;
```

History:

``` text
past[]
present
future[]
```

Each operation should be reversible.

Do not snapshot enormous full canvases for every mouse event.

Group continuous strokes:

``` text
pointer down
→ many pixels
→ pointer up
→ one history command
```

------------------------------------------------------------------------

# 20. Version history

Recommended:

``` text
Revision 1
Revision 2
Revision 3
AI change
Revision 4
```

Each revision:

``` ts
type Revision = {
  id: string;
  artworkId: string;
  parentRevisionId?: string;

  authorId?: string;
  source: "human" | "ai" | "import";

  createdAt: string;

  operations: EditorCommand[];
};
```

This gives you Git-like creative history.

------------------------------------------------------------------------

# 21. Animation system

Minimum model:

``` ts
type Frame = {
  id: string;
  durationMs: number;
  pixels: Uint16Array;
};
```

Timeline:

``` text
[00] [01] [02] [03] [04]
 80  80  120  80  80 ms
```

Controls:

``` text
play
pause
previous
next
duplicate
delete
add frame
```

Export:

``` text
GIF
PNG sequence
sprite sheet
```

------------------------------------------------------------------------

# 22. Sprite-sheet export

Recommended additional export:

``` text
sprite-sheet.png
```

with:

``` text
columns
rows
frame size
padding
spacing
```

This is particularly valuable for game developers.

------------------------------------------------------------------------

# 23. Export architecture

All exporters consume the same canonical document:

``` text
ArtworkDocument
      │
      ├── PNG exporter
      ├── SVG exporter
      ├── GIF exporter
      ├── CSS exporter
      ├── React exporter
      ├── sprite-sheet exporter
      └── engine exporters
```

Never make one exporter depend on another.

------------------------------------------------------------------------

# 24. PNG exporter

Pipeline:

``` text
palette + pixel indices
→ RGBA ImageData
→ PNG encoder
```

Preserve integer pixel boundaries.

No interpolation.

------------------------------------------------------------------------

# 25. SVG exporter

Generate one rectangle per non-transparent pixel or optimize contiguous
runs.

Basic:

``` xml
<rect
  x="10"
  y="4"
  width="1"
  height="1"
  fill="#ff0000"
/>
```

Better optimization:

``` text
contiguous horizontal pixels
→ one rectangle
```

This can massively reduce SVG size.

------------------------------------------------------------------------

# 26. CSS exporter

Possible strategies:

### Strategy A --- box-shadow

``` css
.pixel-art {
  width: 1px;
  height: 1px;
  box-shadow: ...;
}
```

### Strategy B --- CSS gradients

Use carefully constructed gradients.

### Strategy C --- positioned elements

Easy but verbose.

Recommended default:

``` text
CSS custom properties
+
background/gradient representation
```

where practical.

------------------------------------------------------------------------

# 27. React exporter

Generate a self-contained component.

Conceptual output:

``` tsx
export function PixelArt() {
  return (
    <svg
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
    >
      {/* generated pixel geometry */}
    </svg>
  );
}
```

Support options:

``` text
TypeScript
JavaScript
SVG
React
React + CSS
```

------------------------------------------------------------------------

# 28. GIF exporter

Pipeline:

``` text
frames
→ RGBA frame buffers
→ GIF encoder
→ animated GIF
```

Use frame durations from the document.

For very large projects, perform encoding in a Web Worker.

------------------------------------------------------------------------

# 29. Sharing architecture

Recommended public URL:

``` text
https://yourdomain.com/a/{artworkId}
```

Public artwork page:

``` text
┌─────────────────────────────┐
│                             │
│        ARTWORK              │
│                             │
├─────────────────────────────┤
│ creator                     │
│ title                       │
│ ❤️ likes                    │
│                             │
│ [Remix] [Edit] [Export]     │
└─────────────────────────────┘
```

The exact Newt URL format is not publicly established.

------------------------------------------------------------------------

# 30. Share permissions

Recommended states:

``` text
private
unlisted
public
```

Optional:

``` text
allow remix
allow download
allow source
```

------------------------------------------------------------------------

# 31. Remix architecture

Every public artwork can become:

``` text
Original
   │
   ├── Remix A
   ├── Remix B
   └── Remix C
```

Store:

``` ts
parentArtworkId
parentRevisionId
```

This creates a creative lineage graph.

------------------------------------------------------------------------

# 32. Community architecture

A full clone can include:

``` text
Explore
Trending
Latest
Following
AI creations
Animations
Characters
Tiles
Icons
Backgrounds
```

Artwork card:

``` text
┌─────────────────┐
│                 │
│     ARTWORK     │
│                 │
├─────────────────┤
│ creator         │
│ title            │
│ ♥ 142            │
│ Remix   Export  │
└─────────────────┘
```

This community layer is a proposed extension; do not represent it as a
confirmed current Newt feature.

------------------------------------------------------------------------

# 33. Community moderation

Required if public sharing exists:

``` text
report artwork
report user
block user
admin hide
admin delete
rate limits
spam detection
AI moderation
```

Do not launch public community without moderation controls.

------------------------------------------------------------------------

# 34. User accounts

Recommended profile:

``` text
username
avatar
bio
artworks
likes
remixes
followers
following
```

Keep the initial MVP simpler:

``` text
id
email
username
avatarUrl
createdAt
```

------------------------------------------------------------------------

# 35. Database schema

Recommended PostgreSQL model:

``` text
users
artworks
artwork_revisions
artwork_frames
artwork_palettes
artwork_regions
artwork_likes
artwork_remixes
artwork_views
artwork_exports
ai_sessions
ai_operations
reports
```

For early MVP, palette and frame data can be stored inside a versioned
JSON document to reduce relational complexity.

------------------------------------------------------------------------

# 36. Recommended Supabase architecture

For a fast full-stack implementation:

``` text
Supabase Auth
        │
        ▼
Postgres
        │
        ├── artwork metadata
        ├── revisions
        ├── user data
        └── community data

Supabase Storage
        │
        ├── exported PNG
        ├── GIF
        ├── preview thumbnails
        └── avatars
```

The use of Supabase here is a recommendation for our clone, not evidence
that Newt uses Supabase.

------------------------------------------------------------------------

# 37. Frontend architecture

Recommended stack:

``` text
Next.js
React
TypeScript
Tailwind CSS
Zustand
Immer
```

Canvas:

``` text
HTML Canvas 2D
```

Start with Canvas 2D.

Only move to WebGL if profiling proves it necessary.

------------------------------------------------------------------------

# 38. State architecture

Separate:

``` text
document state
editor UI state
history state
AI state
session state
```

Example:

``` text
useArtworkStore
useEditorStore
useHistoryStore
useAIStore
useAuthStore
```

Do not put everything into one enormous store.

------------------------------------------------------------------------

# 39. Rendering architecture

``` text
ArtworkDocument
      ↓
Renderer
      ↓
Canvas
```

Renderer should be pure:

``` ts
renderArtwork(
  ctx,
  artwork,
  frameIndex,
  viewport
)
```

No network calls.

No database operations.

No AI logic.

------------------------------------------------------------------------

# 40. Pixel-perfect rendering

Use:

``` css
image-rendering: pixelated;
```

and canvas settings:

``` ts
ctx.imageSmoothingEnabled = false;
```

When exporting, never apply smoothing.

------------------------------------------------------------------------

# 41. Efficient rendering

For a small pixel-art canvas, redraw is cheap.

Still, structure the renderer for:

``` text
dirty rectangle
```

updates.

For example:

``` text
stroke changed:
x=10..17
y=8..13
```

Only redraw the affected region if performance requires it.

------------------------------------------------------------------------

# 42. Large canvas limits

Recommended MVP:

``` text
8×8
16×16
32×32
64×64
128×128
256×256
```

Warn at:

``` text
512×512
```

and impose configurable limits for AI editing.

Do not allow AI to blindly mutate millions of pixels.

------------------------------------------------------------------------

# 43. Import system

Recommended import:

``` text
PNG
SVG
```

Pipeline:

``` text
image
→ pixelize
→ quantize colors
→ generate palette
→ generate document
```

For PNG:

``` text
user selects target pixel resolution
```

Example:

``` text
512×512 image
→ 32×32 pixel art
```

------------------------------------------------------------------------

# 44. Image-to-pixel-art conversion

Proposed AI-assisted pipeline:

``` text
input image
 ↓
resize
 ↓
palette quantization
 ↓
edge/shape preservation
 ↓
optional AI cleanup
 ↓
structured pixel document
```

Keep this separate from the normal drawing editor.

------------------------------------------------------------------------

# 45. Keyboard shortcuts

The exact Newt shortcut set is not publicly established.

For the clone, use conventional editor shortcuts:

``` text
B          brush
F          fill
I          eyedropper
E          eraser
Ctrl+Z     undo
Ctrl+Shift+Z redo
Ctrl+C     copy
Ctrl+V     paste
Ctrl+S     save
+ / -      zoom
Space      pan
1          100%
2          200%
```

Provide a shortcut reference panel.

Do not claim these are Newt's shortcuts.

------------------------------------------------------------------------

# 46. Mouse interaction

Support:

``` text
left click = draw
drag = stroke
right click = contextual/eyedropper if desired
wheel = zoom
middle drag = pan
space + drag = pan
```

Handle pointer capture so strokes do not break when the pointer leaves
the canvas.

------------------------------------------------------------------------

# 47. Touch support

Support:

``` text
one finger = draw
two fingers = pan/zoom
```

Avoid accidental browser scrolling while drawing.

------------------------------------------------------------------------

# 48. Responsive design

Desktop:

``` text
large canvas
compact floating controls
```

Tablet:

``` text
canvas centered
controls moved toward edges
```

Mobile:

``` text
canvas
bottom tool strip
AI composer
export/share menu
```

The public product is described as PWA-friendly, so a
responsive/installable approach is appropriate for the clone.

------------------------------------------------------------------------

# 49. PWA

Recommended:

``` text
manifest.json
service worker
offline editor shell
local draft storage
install prompt
```

Important:

The editor should remain usable offline for drawing.

AI obviously requires network connectivity unless a local model is
supported.

------------------------------------------------------------------------

# 50. Local-first draft storage

Use IndexedDB.

Model:

``` text
IndexedDB
  └── artwork documents
```

Autosave:

``` text
edit
→ debounce 300–1000ms
→ IndexedDB
```

This protects users from refreshes and connection loss.

------------------------------------------------------------------------

# 51. Cloud synchronization

When authenticated:

``` text
local document
      ↓
sync queue
      ↓
server
```

Conflict handling:

``` text
revision graph
```

rather than "last write wins" for complex edits.

------------------------------------------------------------------------

# 52. Network architecture

Newt's actual network architecture is not publicly established.

Do NOT claim:

``` text
Next.js
Supabase
Vercel
OpenAI
Anthropic
```

as facts.

For the clone, recommended network structure:

``` text
Browser
  │
  ├── HTTPS → API
  │
  ├── HTTPS → Auth
  │
  ├── HTTPS → Storage
  │
  └── HTTPS → AI gateway
```

AI requests should go through your backend.

Never expose a provider API key in browser JavaScript.

------------------------------------------------------------------------

# 53. AI gateway

Recommended:

``` text
POST /api/ai/edit
```

Request:

``` json
{
  "artworkId": "...",
  "revisionId": "...",
  "instruction": "make it angrier"
}
```

Server:

``` text
authenticate
→ rate limit
→ load artwork
→ prepare AI context
→ call model
→ validate operations
→ return proposal
```

Do not automatically commit AI edits until the client accepts them.

------------------------------------------------------------------------

# 54. AI context compression

Do not always send the entire verbose document.

Construct context:

``` text
canvas dimensions
palette
non-transparent bounding box
selected region
semantic regions
compressed pixel map
```

For small art:

``` text
32×32
```

the full map is cheap.

For large art, send only relevant regions when possible.

------------------------------------------------------------------------

# 55. AI model strategy

Start with a general multimodal/structured-output LLM.

Do not train a custom model in MVP.

The model's job is:

``` text
understand instruction
+
understand pixel document
+
produce valid editing operations
```

Later, consider specialized models for:

``` text
image-to-pixel-art
semantic region detection
animation generation
style transfer
palette generation
```

------------------------------------------------------------------------

# 56. AI prompt design

System instruction concept:

``` text
You are a pixel-art editing agent.

You never return a raster image.

You operate only through the provided structured editing tools.

Preserve canvas dimensions unless explicitly instructed otherwise.

Prefer minimal edits.

Preserve existing palette colors when possible.

Do not destroy unrelated regions.

Before committing:
1. inspect the relevant region
2. validate bounds
3. preview the result
4. summarize the changes
```

This is much more reliable than "generate pixel art."

------------------------------------------------------------------------

# 57. AI operation granularity

Use high-level operations when possible:

``` text
recolor_region
mirror_region
move_region
scale_region
replace_palette
```

and low-level operations for exact modifications:

``` text
set_pixel
set_pixels
```

This dramatically reduces token usage.

------------------------------------------------------------------------

# 58. AI intent classes

Classify requests:

``` text
EDIT
RECOLOR
ADD
REMOVE
STYLE
ANIMATE
RESIZE
PALETTE
EXPORT
EXPLAIN
```

Example:

``` text
“make it angry”
→ EDIT

“make the armor blue”
→ RECOLOR

“add a sword”
→ ADD

“make a blinking animation”
→ ANIMATE
```

------------------------------------------------------------------------

# 59. AI preview / diff

Display:

``` text
Before
After
Diff
```

Diff colors can represent:

``` text
green = added
red = removed
yellow = modified
```

Do not hard-code colors into accessibility-critical meaning; provide
patterns/icons too.

------------------------------------------------------------------------

# 60. Export UX

Recommended:

``` text
Export
 ├── PNG
 ├── GIF
 ├── SVG
 ├── CSS
 ├── React
 ├── Sprite Sheet
 └── Source JSON
```

Advanced:

``` text
Game engines
 ├── Godot
 ├── Unity
 ├── Phaser
 └── Generic
```

------------------------------------------------------------------------

# 61. Source JSON export

This is essential for a code-native product.

Export:

``` text
artwork.newt.json
```

or your own project format.

This guarantees users can back up/edit their source.

------------------------------------------------------------------------

# 62. Developer experience

A developer should be able to:

``` text
create art
→ export React
→ paste into project
```

or:

``` text
create art
→ export SVG
→ use in website
```

or:

``` text
create sprite
→ export PNG sprite sheet
→ use in Godot
```

The developer workflow is part of the product, not an afterthought.

------------------------------------------------------------------------

# 63. Proposed game-engine integrations

## Godot

Generate:

``` text
sprite.png
sprite_frames.tres
```

## Unity

Generate:

``` text
sprite.png
metadata JSON
```

## Phaser

Generate:

``` text
sprite.png
atlas.json
```

## Generic

Generate:

``` text
PNG
sprite sheet
JSON metadata
```

------------------------------------------------------------------------

# 64. Community feed ranking

For the proposed community:

``` text
score =
recent engagement
+ quality signals
+ creator reputation
- spam
```

Avoid simple raw likes as the only ranking metric.

------------------------------------------------------------------------

# 65. Search

Support:

``` text
title
username
tags
palette
dimensions
animation
```

Later:

``` text
semantic search
```

Example:

``` text
“blue pixel knight with sword”
```

AI embeddings can power this later.

------------------------------------------------------------------------

# 66. Tags

Allow:

``` text
character
enemy
environment
item
icon
UI
background
animation
```

plus style tags:

``` text
gameboy
8-bit
16-bit
retro
cute
dark
fantasy
sci-fi
```

------------------------------------------------------------------------

# 67. Likes / saves

Separate:

``` text
like
bookmark
remix
```

A bookmark is private.

A like is social.

A remix creates a derivative artwork.

------------------------------------------------------------------------

# 68. Attribution

Every remix should preserve:

``` text
Original by X
Remixed by Y
```

This is especially important if community sharing becomes central.

------------------------------------------------------------------------

# 69. Privacy

Default new work:

``` text
private
```

Public only when explicitly shared.

Do not make unpublished drafts indexable.

------------------------------------------------------------------------

# 70. Security

Required:

``` text
auth
RLS
rate limits
CSRF protection where applicable
signed storage URLs
server-side AI key storage
upload validation
content moderation
abuse prevention
```

For Supabase:

``` text
RLS on every user-owned table
```

Never trust `userId` supplied by the browser.

------------------------------------------------------------------------

# 71. Storage strategy

Database:

``` text
metadata
source document
revisions
community relationships
```

Object storage:

``` text
PNG
GIF
thumbnails
avatars
large export artifacts
```

Generate thumbnails server-side or in a worker for public galleries.

------------------------------------------------------------------------

# 72. Background jobs

Use jobs for:

``` text
GIF encoding
large exports
thumbnail generation
AI-heavy processing
moderation
search indexing
```

MVP can do small exports client-side.

------------------------------------------------------------------------

# 73. Performance targets

Target:

``` text
60 FPS drawing interaction
<16ms pointer-to-render for normal canvas sizes
```

AI:

``` text
show streaming/progress state
```

Exports:

``` text
do not block the editor
```

Use Web Workers for expensive encoding.

------------------------------------------------------------------------

# 74. Testing strategy

## Unit

Test:

``` text
coordinate conversion
brush geometry
fill
palette
serialization
deserialization
export
history
AI command validation
```

## Integration

Test:

``` text
draw
→ save
→ reload
→ export
```

## E2E

Test:

``` text
open editor
→ draw
→ undo
→ redo
→ AI edit
→ accept
→ share
```

------------------------------------------------------------------------

# 75. Golden rendering tests

For pixel editors, rendering correctness matters.

Store known documents:

``` text
fixture-01.json
fixture-02.json
```

Render to PNG.

Compare output against golden images.

This catches:

``` text
off-by-one errors
wrong palette
wrong transparency
wrong frame
```

------------------------------------------------------------------------

# 76. Accessibility

Canvas alone is not accessible.

Provide:

``` text
canvas title
keyboard operations
screen-reader status
tool labels
focus states
shortcut help
```

AI changes should have textual summaries.

------------------------------------------------------------------------

# 77. Error states

Design explicitly:

``` text
AI unavailable
AI timeout
export failed
save failed
network offline
authentication expired
invalid document
unsupported import
canvas too large
```

Never silently discard artwork.

------------------------------------------------------------------------

# 78. Autosave UX

Show subtle state:

``` text
Saved
Saving…
Offline
Syncing…
```

Never interrupt drawing with a modal for ordinary saves.

------------------------------------------------------------------------

# 79. Mobile editor UX

Suggested layout:

``` text
┌───────────────────────┐
│        canvas          │
│                       │
│                       │
│                       │
├───────────────────────┤
│ brush fill erase      │
├───────────────────────┤
│ Ask AI…               │
└───────────────────────┘
```

Export/share should live under a compact menu.

------------------------------------------------------------------------

# 80. Visual measurement plan for a true clone

Because public indexing does not provide exact CSS measurements, do a
manual measurement pass before attempting pixel-perfect reproduction.

Record:

``` text
viewport width
viewport height
canvas bounding box
canvas aspect ratio
control bounding boxes
gap sizes
font family
font size
font weight
line height
border radius
border width
shadow
background color
foreground color
accent color
input height
button height
AI composer height
```

Capture at:

``` text
1440×900
1280×800
1024×768
768×1024
390×844
```

Use browser DevTools.

------------------------------------------------------------------------

# 81. Browser reverse-engineering checklist

When manually inspecting Newt:

### DOM

Record:

``` text
root element
canvas element
SVG elements
buttons
inputs
dialogs
```

### CSS

Record:

``` text
computed font
colors
spacing
dimensions
positioning
media queries
```

### JS

Record only publicly delivered client assets and behavior.

Do not attempt to bypass authentication or access private endpoints.

### Network

Observe normal browser traffic:

``` text
document
JS
CSS
fonts
images
API calls
WebSocket calls
```

Do not attempt credential theft, bypasses, or unauthorized access.

------------------------------------------------------------------------

# 82. Network inspection worksheet

For each request record:

``` text
method
URL/path
status
request payload shape
response payload shape
authentication mechanism
content type
cache headers
timing
```

Categorize:

``` text
STATIC
AUTH
ARTWORK
AI
EXPORT
SHARE
ANALYTICS
```

Do not store secrets in the reverse-engineering notes.

------------------------------------------------------------------------

# 83. URL/share reverse-engineering checklist

Test:

``` text
Share
Copy link
Open link logged out
Open link incognito
Open link on another browser
Edit shared artwork
Remix shared artwork
```

Record:

``` text
URL format
public/private behavior
metadata shown
owner controls
download controls
source visibility
```

------------------------------------------------------------------------

# 84. Authentication reverse-engineering checklist

Test:

``` text
Sign in
Sign out
refresh
expired session
new browser
private window
```

Record only observable behavior.

Do not infer the provider from button styling.

------------------------------------------------------------------------

# 85. AI workflow reverse-engineering checklist

Test categories:

``` text
simple modification
recolor
add object
remove object
style change
palette change
animation
ambiguous instruction
impossible instruction
```

For every prompt record:

``` text
input
loading state
streaming state
preview
confirmation behavior
final mutation
error state
history behavior
```

------------------------------------------------------------------------

# 86. Suggested AI test matrix

``` text
“make it angrier”
“make it happier”
“make the outline black”
“change the shirt to blue”
“add a sword”
“remove the sword”
“make the character bigger”
“add a shadow”
“make it night”
“turn it into a Game Boy palette”
“animate it blinking”
“make four walking frames”
```

Do not assume Newt supports every request above. These are probes for
behavior.

------------------------------------------------------------------------

# 87. Export test matrix

For every format:

``` text
1×1
8×8
16×16
32×32
transparent
one color
many colors
animation
```

Check:

``` text
dimensions
alpha
colors
crispness
frame timing
file size
metadata
```

------------------------------------------------------------------------

# 88. Browser/device test matrix

Desktop:

``` text
Chrome
Firefox
Edge
Safari
```

Mobile:

``` text
Chrome Android
Safari iOS
```

Minimum:

``` text
desktop Chromium
desktop Firefox
mobile Chromium
mobile Safari
```

------------------------------------------------------------------------

# 89. Proposed project structure

``` text
pixel-studio/
├── apps/
│   ├── web/
│   └── worker/
│
├── packages/
│   ├── artwork-core/
│   ├── renderer/
│   ├── exporters/
│   ├── editor/
│   ├── ai-protocol/
│   ├── ui/
│   └── validation/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── seed/
│
└── docs/
```

------------------------------------------------------------------------

# 90. `artwork-core`

Responsibilities:

``` text
document schema
palette
frames
regions
serialization
deserialization
commands
diff
validation
```

This package must have no React dependency.

------------------------------------------------------------------------

# 91. `renderer`

Responsibilities:

``` text
canvas rendering
SVG rendering
preview rendering
thumbnail rendering
```

Input:

``` ts
ArtworkDocument
```

Output:

``` text
Canvas / SVG / pixel buffers
```

------------------------------------------------------------------------

# 92. `exporters`

Modules:

``` text
png.ts
gif.ts
svg.ts
css.ts
react.tsx
spriteSheet.ts
json.ts
```

All depend on `artwork-core`.

------------------------------------------------------------------------

# 93. `editor`

Responsibilities:

``` text
pointer input
brush
fill
selection
clipboard
zoom
pan
history
keyboard shortcuts
```

------------------------------------------------------------------------

# 94. `ai-protocol`

Responsibilities:

``` text
AI command schemas
tool definitions
validation
diff generation
AI context building
```

Keep AI provider-specific code outside this package.

------------------------------------------------------------------------

# 95. `ui`

Responsibilities:

``` text
buttons
dialogs
menus
palette
AI composer
export menu
share modal
timeline
account UI
```

------------------------------------------------------------------------

# 96. Backend API

Recommended endpoints:

``` text
POST   /api/artworks
GET    /api/artworks/:id
PATCH  /api/artworks/:id

POST   /api/artworks/:id/revisions
GET    /api/artworks/:id/revisions

POST   /api/artworks/:id/share
POST   /api/artworks/:id/remix

POST   /api/ai/edit

POST   /api/exports
GET    /api/exports/:id

POST   /api/reports
```

------------------------------------------------------------------------

# 97. Database relationships

``` text
User
 │
 ├── Artwork
 │     ├── Revision
 │     ├── Frame
 │     ├── Palette
 │     ├── Like
 │     ├── Remix
 │     └── Export
 │
 └── AI Session
```

------------------------------------------------------------------------

# 98. MVP scope

Do NOT build everything at once.

### MVP 1

``` text
pixel canvas
square brush
round brush
eraser
color picker
palette
undo/redo
zoom
pan
save locally
PNG export
JSON export
```

### MVP 2

``` text
authentication
cloud save
sharing
SVG export
React export
CSS export
```

### MVP 3

``` text
AI editing
AI diff
AI history
GIF animation
timeline
```

### MVP 4

``` text
community
profiles
likes
remix
explore
```

### MVP 5

``` text
game-engine exports
semantic regions
advanced AI
collaboration
```

------------------------------------------------------------------------

# 99. What should be cloned exactly

Clone the **product principles** and observable interaction patterns:

``` text
minimal editor
pixel-first canvas
code-native representation
AI editing
developer exports
sharing
```

Do not blindly clone:

``` text
branding
logo
copyrighted artwork
proprietary text
exact source code
private backend implementation
```

Create an independent brand and implementation.

------------------------------------------------------------------------

# 100. What should be improved over Newt

Recommended improvements:

### 1. Visible code panel

Make the code-native concept tangible.

``` text
Canvas | Code
```

### 2. AI diff preview

Make AI changes reviewable.

### 3. Version history

Git-like artwork history.

### 4. Semantic regions

Make AI much more reliable.

### 5. Sprite-sheet export

Game-dev friendly.

### 6. Godot export

Especially useful for the target audience.

### 7. Local-first editing

Never lose artwork.

### 8. Community remix graph

Turn artwork into an ecosystem.

### 9. Public API

Allow developers to fetch artwork as:

``` text
JSON
SVG
React
PNG
```

### 10. Embeddable viewer

``` html
<pixel-art src="..."></pixel-art>
```

------------------------------------------------------------------------

# 101. Embedding API

A future embed could be:

``` html
<script src="https://yourdomain.com/embed.js"></script>

<pixel-art
  artwork="abc123"
  animated
></pixel-art>
```

Or:

``` tsx
<PixelArt id="abc123" />
```

This directly extends the code-native philosophy.

------------------------------------------------------------------------

# 102. Public API

Potential endpoints:

``` text
GET /api/public/artworks/:id
GET /api/public/artworks/:id/png
GET /api/public/artworks/:id/svg
GET /api/public/artworks/:id/source
```

Later:

``` text
POST /api/v1/ai/edit
```

with API keys.

------------------------------------------------------------------------

# 103. Monetization possibilities

Free:

``` text
basic editor
limited cloud projects
PNG export
limited AI
```

Pro:

``` text
unlimited projects
advanced AI
GIF
React/CSS/SVG exports
private projects
version history
larger canvases
```

Team:

``` text
shared projects
comments
collaboration
team libraries
```

Developer/API:

``` text
API access
embeds
higher AI limits
automation
```

Do not assume Newt currently follows this model.

------------------------------------------------------------------------

# 104. AI cost controls

Never let every keystroke call AI.

Use:

``` text
explicit submit
debounce
request limits
token limits
operation limits
per-user quotas
```

Cache repeated operations where appropriate.

------------------------------------------------------------------------

# 105. Observability

Track:

``` text
editor load time
canvas FPS
save latency
AI latency
AI failure rate
export failure rate
share opens
remix rate
```

Do not log raw private artwork or prompts unnecessarily.

------------------------------------------------------------------------

# 106. Product analytics events

Recommended:

``` text
editor_opened
artwork_created
pixel_drawn
stroke_completed
artwork_saved
artwork_shared
artwork_remixed
ai_prompt_submitted
ai_edit_accepted
ai_edit_rejected
export_started
export_completed
export_failed
```

------------------------------------------------------------------------

# 107. Agent development rules

Every coding agent working on this project must follow:

``` text
1. Read artwork-core before editing editor code.
2. Never bypass the canonical document model.
3. Never make PNG the source of truth.
4. Never mutate canvas state outside the state layer.
5. Every user edit must be undoable.
6. Every AI edit must be validated.
7. Every exporter must consume ArtworkDocument.
8. Never expose AI provider keys.
9. Never silently discard unsaved artwork.
10. Add tests for every new editor command.
```

------------------------------------------------------------------------

# 108. Agent task format

Every implementation task should contain:

``` text
OBJECTIVE
CONTEXT
FILES TO MODIFY
FILES NOT TO MODIFY
DATA CONTRACT
UI REQUIREMENTS
BEHAVIOR
EDGE CASES
TESTS
ACCEPTANCE CRITERIA
```

Do not give agents vague prompts like:

``` text
“Build the editor.”
```

------------------------------------------------------------------------

# 109. Master agent prompt

The following is intended to be given to a coding agent.

------------------------------------------------------------------------

## MASTER BUILD PROMPT

You are building an independent web application inspired by the product
concept of Newt: a code-native pixel-art editor where visual pixel
editing and structured source representation are two views of the same
artifact.

The application must not use a flattened image as its source of truth.

The canonical source of truth is an `ArtworkDocument` containing:

-   canvas dimensions
-   palette
-   palette indices
-   frames
-   optional semantic regions
-   metadata
-   document version

The system must provide a bidirectional workflow:

``` text
visual editor ↔ structured artwork document
```

Every drawing operation must mutate the document through editor
commands.

Every command must support undo/redo.

The renderer must consume the document and render to Canvas.

Exporters must consume the same document and independently produce:

-   PNG
-   SVG
-   CSS
-   React
-   GIF
-   source JSON
-   sprite sheet

The editor must include:

-   pixel canvas
-   square brush
-   round brush
-   color picker
-   palette
-   eraser
-   fill
-   zoom
-   pan
-   undo
-   redo
-   keyboard shortcuts
-   autosave

The editor UI should be intentionally minimal and artwork-first.

Add an AI composer with behavior conceptually similar to:

``` text
Ask AI… “make it angrier”
```

The AI must never directly replace the artwork with a generated raster
image.

Instead:

``` text
user prompt
→ AI reasoning
→ structured editing operations
→ validation
→ preview/diff
→ user acceptance
→ command history
```

Implement an AI tool protocol supporting operations such as:

-   inspect artwork
-   inspect palette
-   inspect frame
-   inspect region
-   set pixel
-   set multiple pixels
-   draw line
-   draw rectangle
-   fill
-   recolor region
-   replace palette color
-   add frame
-   duplicate frame
-   delete frame
-   set frame duration
-   preview
-   validate
-   commit

The AI must prefer minimal edits and preserve unrelated artwork.

All AI-generated operations must be validated for:

-   schema correctness
-   coordinate bounds
-   palette validity
-   frame validity
-   operation count
-   document invariants

The UI must show an AI change summary and allow Accept/Reject.

Use:

-   Next.js
-   React
-   TypeScript
-   Tailwind
-   Zustand
-   Immer
-   Supabase for auth/database/storage
-   Canvas 2D initially

Do not introduce WebGL unless performance profiling demonstrates a need.

Structure the code into independent packages:

``` text
artwork-core
renderer
editor
exporters
ai-protocol
ui
validation
```

The core document package must not depend on React.

Implement IndexedDB local drafts so the editor works even when offline.

When authenticated, synchronize documents with the backend.

Use revision-based persistence.

Never expose AI provider credentials in the browser.

Use server-side AI calls.

Implement public artwork sharing using stable artwork IDs.

Implement privacy states:

-   private
-   unlisted
-   public

For public artworks, provide:

-   viewer
-   creator
-   title
-   like
-   remix
-   export
-   share

Implement remix lineage using parent artwork/revision IDs.

Create a community layer after the editor and persistence layers are
stable.

Community features:

-   explore
-   latest
-   trending
-   profiles
-   likes
-   bookmarks
-   remix
-   tags
-   reports

Build moderation primitives before public community launch.

Use deterministic rendering.

Use `imageSmoothingEnabled = false`.

Use crisp pixel rendering.

Do not use DOM elements for every pixel.

Use typed arrays/palette indices for pixel storage.

Implement automated golden rendering tests.

For every new editor command, create unit tests.

For every major user flow, create integration/E2E tests.

The implementation must be incremental.

Do not attempt to implement the entire application in one file.

Do not create fake backend responses once backend integration begins.

Do not claim any architecture belongs to Newt unless the project
documentation explicitly establishes it.

The product should be independently branded and implemented.

------------------------------------------------------------------------

# 110. Agent implementation phases

## Phase 0 --- Repository foundation

Deliver:

``` text
monorepo
TypeScript
lint
formatting
tests
CI
```

Acceptance:

``` text
clean install
build
lint
test
```

------------------------------------------------------------------------

## Phase 1 --- Artwork core

Implement:

``` text
ArtworkDocument
Palette
Frame
serialization
commands
history
validation
```

Acceptance:

``` text
create
mutate
undo
redo
serialize
deserialize
```

------------------------------------------------------------------------

## Phase 2 --- Renderer

Implement:

``` text
Canvas renderer
zoom
pan
crisp rendering
```

Acceptance:

``` text
fixture document renders identically
```

------------------------------------------------------------------------

## Phase 3 --- Drawing editor

Implement:

``` text
brush
round brush
eraser
fill
color
palette
```

Acceptance:

``` text
draw → undo → redo
```

------------------------------------------------------------------------

## Phase 4 --- Persistence

Implement:

``` text
IndexedDB
Supabase Auth
Postgres
Storage
```

Acceptance:

``` text
refresh
close browser
reopen
artwork persists
```

------------------------------------------------------------------------

## Phase 5 --- Export

Implement:

``` text
PNG
SVG
CSS
React
JSON
```

Acceptance:

``` text
same artwork produces correct output from every exporter
```

------------------------------------------------------------------------

## Phase 6 --- Animation

Implement:

``` text
frames
timeline
playback
GIF
sprite sheet
```

------------------------------------------------------------------------

## Phase 7 --- AI

Implement:

``` text
AI gateway
tool protocol
operation validation
diff
accept/reject
history
```

Start with a small number of deterministic editing commands.

------------------------------------------------------------------------

## Phase 8 --- Sharing

Implement:

``` text
public viewer
share URL
privacy
remix
```

------------------------------------------------------------------------

## Phase 9 --- Community

Implement:

``` text
profiles
explore
likes
bookmarks
tags
reports
```

------------------------------------------------------------------------

## Phase 10 --- Advanced AI

Add:

``` text
semantic regions
style editing
animation generation
palette intelligence
image-to-pixel-art
```

------------------------------------------------------------------------

# 111. Definition of done

The clone is not considered complete merely because:

``` text
“the canvas works”
```

It is complete when:

``` text
draw
↓
structured document
↓
undo/redo
↓
save
↓
reload
↓
AI edit
↓
review diff
↓
accept
↓
version
↓
share
↓
remix
↓
export
```

all work without breaking the canonical document.

------------------------------------------------------------------------

# 112. Research findings about the original Newt

## Confirmed from current public site

The page currently exposes:

``` text
Square
Round
Solid
color input
Share
Sign in
Ask Newt… “make it angrier”
47×
```

Source:

https://newt.sh/

## Independently reported

AI UX Playground's June 15, 2026 entry describes Newt as a code-native
pixel-art editor where every pixel remains a color token in editable
code and reports export to:

``` text
SVG
CSS
React
PNG
GIF
```

It also describes dark/light themes and a PWA-friendly layout.

## Public launch/discovery evidence

Pablo Stanley publicly posted on June 1, 2026 that he had made a
pixel-art tool where every pixel is code rather than raster and linked
to Newt.

A June 2026 design roundup similarly describes Newt as an online pixel
editor where each pixel is code rather than raster and mentions code
export, animation, and drawing/editing.

A public social post from Pablo Stanley later highlighted pixelated
gradients at Newt.

These establish that the product was publicly circulating in June 2026
and that its code-native pixel-art concept is central to its
positioning.

------------------------------------------------------------------------

# 113. What remains unknown about Newt

The following should remain explicitly marked UNKNOWN until manually
inspected or documented by the creators:

``` text
exact frontend framework
exact backend framework
database provider
authentication provider
AI provider/model
AI prompt
AI tool schema
exact document schema
exact pixel serialization format
exact URL structure
exact export implementation
exact keyboard shortcuts
exact brush algorithm
exact fill algorithm
exact canvas renderer
exact animation timeline behavior
exact pricing
exact user limits
exact community features
exact moderation system
exact analytics provider
exact deployment provider
```

Never turn an assumption into a "fact" in engineering documentation.

------------------------------------------------------------------------

# 114. Manual reverse-engineering session checklist

Before declaring the clone UI complete, manually inspect the live Newt
application and record:

### Canvas

-   default dimensions
-   visible pixel grid
-   zoom behavior
-   zoom controls
-   pan
-   cursor
-   brush size
-   brush preview
-   square brush
-   round brush
-   fill
-   erase
-   color sampling
-   selection

### AI

-   prompt submission
-   loading
-   streaming
-   errors
-   preview
-   confirmation
-   undo
-   repeated prompts
-   context retention

### Export

-   menu
-   formats
-   filenames
-   dimensions
-   transparency
-   animation
-   source export

### Sharing

-   URL
-   permissions
-   public viewer
-   editing
-   authentication requirement

### Auth

-   provider
-   sign in
-   sign out
-   session persistence

### Keyboard

Test common shortcuts and record only those that actually work.

### Responsive

Measure desktop, tablet, and mobile.

### Network

Inspect normal application requests using browser DevTools without
attempting to bypass access controls.

------------------------------------------------------------------------

# 115. Recommended final product architecture

``` text
                         USER
                           │
             ┌─────────────┴─────────────┐
             │                           │
          VISUAL                        AI
          EDITOR                        AGENT
             │                           │
             └─────────────┬─────────────┘
                           │
                    ARTWORK DOCUMENT
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     HISTORY            PERSISTENCE        RENDERER
        │                  │                  │
        │             ┌────┴────┐             │
        │             │         │             │
        │          IndexedDB  Supabase      Canvas
        │                                      │
        └──────────────────┬───────────────────┘
                           │
                        EXPORTERS
                           │
       ┌────────┬──────────┼────────┬──────────┐
       │        │          │        │          │
      PNG      SVG        CSS     React       GIF
       │        │          │        │          │
       └────────┴──────────┼────────┴──────────┘
                           │
                         SHARE
                           │
                       COMMUNITY
```

------------------------------------------------------------------------

# 116. Strategic conclusion

The clone should not be positioned internally as:

> "A copy of Newt."

The engineering goal should be:

> **A code-native pixel-art IDE with an AI editing agent.**

Newt provides the product inspiration:

``` text
pixel art
+
code
+
AI
```

Our implementation can turn that into:

``` text
pixel art
+
structured source
+
AI agent
+
animation
+
developer exports
+
version history
+
remixing
+
community
+
game-engine integration
```

That creates a substantially stronger product while preserving the core
idea that makes Newt interesting.

------------------------------------------------------------------------

# 117. Primary research sources

1.  Newt --- public application: https://newt.sh/

2.  AI UX Playground --- Newt entry:
    https://aiuxplayground.com/playground/newt-sh/

3.  Pablo Stanley public post introducing Newt:
    https://substack.com/@pablostanley/note/c-268469083

4.  Ahmad Awais --- Awesome Random Stuff, June 2026 discovery entry:
    https://github.com/ahmadawais/awesome-random-stuff

5.  Design-resource coverage: https://resourcesfor.design/

6.  June 2026 Chinese design roundup mentioning Newt:
    https://www.uisdc.com/design-source-material-40

7.  June 2026 product roundup:
    https://moonvy.com/blog/post/设计素材周刊/213/

------------------------------------------------------------------------

# 118. Important final note

This document deliberately avoids pretending that private implementation
details were discovered.

The public evidence establishes the product's concept and several
user-facing capabilities. It does not establish the private source code
or backend architecture.

For a truly pixel-perfect behavioral clone, the next
engineering/research action should be a **manual browser session against
the live application** using DevTools to measure:

``` text
DOM
CSS
computed styles
canvas dimensions
pointer behavior
keyboard shortcuts
URL changes
normal network requests
export behavior
authentication behavior
AI request/response behavior
```

The results should then be added to a second revision of this
specification.

**Recommended document status:**
`v0.1 — Public-Evidence Reverse Engineering + Clone Architecture`
