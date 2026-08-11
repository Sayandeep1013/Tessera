/** 20x20 stroke icons, currentColor, no fills. See docs/specs/02-design-system.md §10. */

type P = { className?: string }
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const BrushIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14.5 3.5a2.1 2.1 0 0 1 3 3L9 15l-4 1 1-4 8.5-8.5Z" />
    <path d="M12.5 5.5l3 3" />
  </svg>
)

export const EraserIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M11 3.5 3.9 10.6a1.5 1.5 0 0 0 0 2.1l3.4 3.4h4l7.2-7.2a1.5 1.5 0 0 0 0-2.1l-3.4-3.3a1.5 1.5 0 0 0-2.1 0Z" />
    <path d="M7.5 16.1 14 9.6" />
  </svg>
)

export const FillIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 3.5 3.9 7.6a1.5 1.5 0 0 0 0 2.1l4.6 4.6a1.5 1.5 0 0 0 2.1 0l4.1-4.1L8 3.5Z" />
    <path d="M16.5 12.5c0 1-.7 1.8-1.5 1.8s-1.5-.8-1.5-1.8c0-.8 1.5-2.5 1.5-2.5s1.5 1.7 1.5 2.5Z" />
  </svg>
)

export const EyedropperIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15.5 3.2a2.2 2.2 0 0 1 1.3 3.8L14.6 9l-3.6-3.6L13.2 3a2.2 2.2 0 0 1 2.3.2Z" />
    <path d="m12.6 7-7 7L4 17l3-1.6 7-7" />
  </svg>
)

export const RectIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4.5" width="13" height="11" rx="1" />
  </svg>
)

export const UndoIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9h8a4 4 0 0 1 0 8h-2" />
    <path d="M7 6 4 9l3 3" />
  </svg>
)

export const RedoIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M16 9H8a4 4 0 0 0 0 8h2" />
    <path d="m13 6 3 3-3 3" />
  </svg>
)

export const GridIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="1" />
    <path d="M8 3.5v13M12 3.5v13M3.5 8h13M3.5 12h13" />
  </svg>
)

export const PlusIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </svg>
)

export const MinusIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 10h11" />
  </svg>
)

export const SunIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="10" r="3.4" />
    <path d="M10 2.5v1.6M10 15.9v1.6M2.5 10h1.6M15.9 10h1.6M4.7 4.7l1.1 1.1M14.2 14.2l1.1 1.1M15.3 4.7l-1.1 1.1M5.8 14.2l-1.1 1.1" />
  </svg>
)

export const MoonIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M16 11.7A6.5 6.5 0 0 1 8.3 4a6.5 6.5 0 1 0 7.7 7.7Z" />
  </svg>
)

export const CodeIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m7 6.5-3.5 3.5L7 13.5M13 6.5 16.5 10 13 13.5" />
  </svg>
)

export const SparkIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m10 3 1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6L10 3Z" />
  </svg>
)
