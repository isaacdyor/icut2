/**
 * Type-safe event emitter for the playback engine
 */

type EventMap = Record<string, (...args: never[]) => void>;

export class EventEmitter<T extends EventMap> {
  private readonly listeners = new Map<keyof T, Set<T[keyof T]>>();

  on<K extends keyof T>(event: K, listener: T[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(listener as T[keyof T]);
    }

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  off<K extends keyof T>(event: K, listener: T[K]): void {
    this.listeners.get(event)?.delete(listener as T[keyof T]);
  }

  protected emit<K extends keyof T>(
    event: K,
    ...emitArgs: Parameters<T[K]>
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        (listener as (...fnArgs: Parameters<T[K]>) => void)(...emitArgs);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
