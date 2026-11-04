import type { Client } from '@libsql/client';

const wrappers = new WeakMap<Client, Client>();

/**
 * A libsql in-memory database has one connection. While a transaction holds it,
 * even an unrelated SELECT can fail with TRANSACTION_ACTIVE. Queue operations
 * on each client, retaining the lease until its transaction is closed. Writes
 * remain transactional across processes through libsql's own write lock.
 */
export function serializedClient(client: Client): Client {
  const existing = wrappers.get(client);
  if (existing) return existing;
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
  const serial = new Set(['execute', 'batch', 'executeMultiple', 'migrate', 'sync']);
  const wrapper = new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'transaction') return async (...args: any[]) => {
        const release = await acquire();
        try {
          const transaction = await value.apply(target, args);
          let released = false;
          return new Proxy(transaction, {
            get(tx, key) {
              const member = Reflect.get(tx, key, tx);
              if (key === 'close') return () => {
                try { tx.close(); }
                finally { if (!released) { released = true; release(); } }
              };
              return typeof member === 'function' ? member.bind(tx) : member;
            },
          });
        } catch (error) { release(); throw error; }
      };
      if (serial.has(String(property))) return async (...args: any[]) => {
        const release = await acquire();
        try { return await value.apply(target, args); }
        finally { release(); }
      };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  wrappers.set(client, wrapper);
  wrappers.set(wrapper, wrapper);
  return wrapper;
}
