/**
 * Per-serial state store (M7, REQ-MULTIDEV-003/004).
 *
 * Namespaces transient in-process state by device serial so an operation
 * on one device never observes or clobbers another device's state.
 * Node.js is single-threaded/single-process — there is no shared
 * external state to guard against here; a plain `Map` keyed by serial is
 * sufficient and correct, and this class exists to make that namespacing
 * an explicit, reusable, testable primitive rather than an ad hoc local
 * variable pattern repeated per call site.
 *
 * A `Map.set()` on an existing key overwrites rather than accumulates, so
 * the store never grows unbounded across repeated calls for the same
 * serial (REQ-IDEMP-001) — its size is capped by the number of distinct
 * serials ever tracked, not the number of calls made.
 */
export class PerSerialState<T> {
  private readonly store = new Map<string, T>();

  set(serial: string, value: T): void {
    this.store.set(serial, value);
  }

  get(serial: string): T | undefined {
    return this.store.get(serial);
  }

  has(serial: string): boolean {
    return this.store.has(serial);
  }

  delete(serial: string): void {
    this.store.delete(serial);
  }

  get size(): number {
    return this.store.size;
  }
}
