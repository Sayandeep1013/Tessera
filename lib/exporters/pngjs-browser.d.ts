/**
 * `pngjs` ships a second entry point, `pngjs/browser` — a pre-browserified
 * build with its own bundled Buffer/zlib shims that runs unmodified in Node
 * and in a browser bundle alike (see docs/specs/08-exporters.md §12.4). It has
 * no types of its own; it is the same API as the package's main entry.
 */
declare module 'pngjs/browser' {
  export * from 'pngjs'
}
