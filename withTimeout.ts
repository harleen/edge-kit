// _shared/withTimeout.ts

export async function withTimeout<T>(
    p: PromiseLike<T>,
    ms: number,
    onTimeout?: () => void
  ): Promise<T> {
    let t: number | undefined;

    return Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => {
          try {
            onTimeout?.();
          } catch {
            /* ignore */
          }
          reject(new DOMException("Operation timed out", "TimeoutError"));
        }, ms) as unknown as number;
      }),
    ]).finally(() => {
      if (t) clearTimeout(t);
    });
  }
