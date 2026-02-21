/**
 * THROTTLED FETCH
 *
 * Global concurrency limiter for fetch requests.
 * Prevents burst-loading 50+ requests at once.
 * Max concurrent requests defaults to 6 (browser default per origin).
 */

const MAX_CONCURRENT = 6;

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
 */
export function throttledFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject, input, init });
    processQueue();
  });
}
