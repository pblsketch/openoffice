/**
 * A small LRU for rendered pages. Pages on the screen are pinned: the cache may
 * hold at most `max` pages, but it never evicts one being looked at.
 */
export class LruPages<T> {
  private readonly order: number[] = []
  private readonly values = new Map<number, T>()
  private readonly pinned = new Set<number>()

  constructor(
    private readonly max: number,
    private readonly dispose: (key: number, value: T) => void,
  ) {
    if (max < 1) throw new Error('the page cache needs room for at least one page')
  }

  get size(): number {
    return this.values.size
  }

  has(key: number): boolean {
    return this.values.has(key)
  }

  get(key: number): T | undefined {
    const value = this.values.get(key)
    if (value === undefined) return undefined
    this.touch(key)
    return value
  }

  set(key: number, value: T): void {
    const previous = this.values.get(key)
    if (previous !== undefined) this.dispose(key, previous)
    this.values.set(key, value)
    this.touch(key)
    this.trim()
  }

  /** The pages on the screen; they are not evicted until unpinned. */
  pin(keys: readonly number[]): void {
    this.pinned.clear()
    for (const key of keys) this.pinned.add(key)
    this.trim()
  }

  delete(key: number): void {
    const value = this.values.get(key)
    if (value === undefined) return
    this.values.delete(key)
    this.forget(key)
    this.dispose(key, value)
  }

  clear(): void {
    for (const [key, value] of this.values) this.dispose(key, value)
    this.values.clear()
    this.order.length = 0
    this.pinned.clear()
  }

  private touch(key: number): void {
    this.forget(key)
    this.order.push(key)
  }

  private forget(key: number): void {
    const at = this.order.indexOf(key)
    if (at >= 0) this.order.splice(at, 1)
  }

  private trim(): void {
    while (this.values.size > this.max) {
      const victim = this.order.find((key) => !this.pinned.has(key))
      if (victim === undefined) return
      this.delete(victim)
    }
  }
}
