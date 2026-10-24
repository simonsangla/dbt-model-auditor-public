/** Last-request-wins guard: only the most recently started request may apply its result. */
export function latestOnly() {
  let current = 0
  return {
    start: () => ++current,
    isLatest: (token: number) => token === current,
  }
}
