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
    showSaveStatus: tier === 'wide' || tier === 'compact',
    showUnbuilt: tier === 'wide',
  }
}
