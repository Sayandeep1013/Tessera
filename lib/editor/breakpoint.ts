'use client'

/**
 * Viewport tiers. See docs/research/ui-audit.md §3 and docs/specs/13 §3.5.
 *
 * The reference product does not handle these well — at 768 its right-hand group
 * runs off the edge — so this is one of the places we deliberately stop cloning.
 *
 * Tiers rather than a continuous scale because the chrome does not shrink
 * smoothly: below a point, controls have to be removed rather than made smaller,
 * and a 24px target is a floor that does not bend.
 */

import { useEffect, useState } from 'react'

export type Tier = 'mobile' | 'tablet' | 'compact' | 'wide'

/** Measured against the audit's failure points, not round numbers. */
export const BREAKPOINTS = { mobile: 640, tablet: 900, compact: 1100 } as const

export function tierFor(width: number): Tier {
  if (width < BREAKPOINTS.mobile) return 'mobile'
  if (width < BREAKPOINTS.tablet) return 'tablet'
  if (width < BREAKPOINTS.compact) return 'compact'
  return 'wide'
}

/**
 * Starts at 'wide' and corrects on mount. The editor does not server-render
 * (app/page.tsx), so there is no hydration mismatch to avoid here — but the
 * first client paint still needs a value before the listener fires.
 */
export function useTier(): Tier {
  const [tier, setTier] = useState<Tier>(() =>
    typeof window === 'undefined' ? 'wide' : tierFor(window.innerWidth),
  )

  useEffect(() => {
    const onResize = () => setTier(tierFor(window.innerWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return tier
}

/** Chrome dimensions per tier. One place, so the layout cannot drift per component. */
export function chromeFor(tier: Tier) {
  const large = tier === 'wide'
  return {
    headerHeight: large ? 56 : 48,
    /** The tool rail lies down along the bottom edge on mobile. */
    railHorizontal: tier === 'mobile',
    railButton: large ? 52 : 44,
    railIcon: large ? 28 : 24,
    glyphButton: large ? 40 : 36,
    glyphIcon: large ? 22 : 20,
    inset: tier === 'mobile' ? 8 : 16,
    /** Secondary header controls are dropped before essential ones. */
    showBrushOptions: tier === 'wide' || tier === 'compact',
    showDither: tier === 'wide',
    /**
     * The filename is absolutely centred across the whole header, so it can
     * collide with whatever the left group grows into. `compact` is exactly the
     * tier where the brush group is still shown but the header is narrow enough
     * for the two to overlap — measured at 900px. Below that the brush group is
     * gone and the centre is free again.
     */
    showFilename: tier === 'wide' || tier === 'tablet',
    /**
     * The word "Tessera" beside the mark, which is decoration rather than a
     * control.
     *
     * Dropped on a phone because unit C added the Code button and the header ran
     * 38px off a 320px screen — measured by `check-responsive.ts`, which is
     * exactly the failure it exists to catch. The wordmark is ~70px and the
     * logo alone still opens the File menu, still carries the caret that says it
     * is a menu, and is still the product's mark. A live control does not lose
     * its place to a word, which is the same rule that keeps the dead controls
     * out of a narrow header.
     */
    showWordmark: tier !== 'mobile',
    showSaveStatus: tier === 'wide' || tier === 'compact',
    /**
     * Layers are built now, so they are not gated with the dead controls. Not on
     * a phone though: a 248px panel over a 320px canvas is not a layer panel,
     * and layers are a desk activity. The agent's layer actions still work
     * there, and every layer in a document still renders.
     */
    /**
     * How far the vertical tool rail is lifted above the centre of <main>.
     *
     * <main> starts below the header, so centring the rail in it put the rail
     * low: a wide gap above, and the agent panel crowding it below. Lifting it
     * by half the panel's idle footprint centres it on the space that is
     * actually free. Shared rather than inlined because AgentPanel derives its
     * own height cap from where the rail's bottom edge ends up, and the two
     * drifting apart is how a panel starts overlapping a rail again.
     *
     * 58 is half of the panel's idle footprint plus its inset (16 + 100) / 2.
     * Zero on a phone, where the rail lies along the bottom instead.
     */
    railLift: tier === 'mobile' ? 0 : 58,
    showLayers: tier !== 'mobile',
    /**
     * Share is built, so it leaves the dead-control group too. It survives to
     * tablet but not to a phone: the popover is 320px wide and the whole point
     * of it is text the user has to read before their artwork leaves the
     * browser. Squeezed onto a 320px screen that text is the first thing to go,
     * and it is the part that must not.
     */
    showShare: tier !== 'mobile',
    /**
     * The code panel is built, so it leaves the dead-control group as Layers and
     * Share did. It survives all the way down to a phone, unlike either of them:
     * below 640 it is a full-screen sheet rather than a split (spec 07 §7), so
     * it never has to fit beside the canvas — and it is the one surface where a
     * phone can do something the canvas cannot, which is read the document.
     */
    showCode: true,
    /**
     * The timeline is built (unit F). Withheld below the tablet breakpoint,
     * same as Layers and Share — a 72px strip has nowhere to go on a phone
     * that is not already spoken for by the horizontal tool rail and the
     * agent panel. See docs/specs/10-animation.md §0.4.
     */
    showTimeline: tier !== 'mobile',
  }
}
