/**
 * THROTTLED FETCH
 *
 * Global concurrency limiter for fetch requests.
 * Prevents burst-loading 50+ requests at once.
 * Max concurrent requests defaults to 6 (browser default per origin).
 */

const MAX_CONCURRENT = 5; // Balanced: faster loading while staying within Binance 2400 weight/min

let activeCount = 0;
const queue: Array<{
  resolve: (value: Response) => void;
  reject: (reason: unknown) => void;
  input: RequestInfo | URL;
  init?: RequestInit;
}> = [];

function processQueue() {
  while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
    const item = queue.shift()!;
    activeCount++;
    fetch(item.input, item.init)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeCount--;
        processQueue();
      });
  }
}

/**
 * Drop-in replacement for `fetch()` with global concurrency limiting.
 * Queues requests when MAX_CONCURRENT is reached.
 * Supports AbortSignal — aborts queued requests before they start.
 */
export function throttledFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return new Promise((resolve, reject) => {
    // Already aborted — reject immediately
    if (init?.signal?.aborted) {
      reject(init.signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }

    const item = { resolve, reject, input, init };
    queue.push(item);

    // If signal fires while queued, remove from queue and reject
    if (init?.signal) {
      const onAbort = () => {
        const idx = queue.indexOf(item);
        if (idx !== -1) {
          queue.splice(idx, 1);
          reject(init.signal!.reason ?? new DOMException('Aborted', 'AbortError'));
        }
      };
      init.signal.addEventListener('abort', onAbort, { once: true });
    }

    processQueue();
  });
}
