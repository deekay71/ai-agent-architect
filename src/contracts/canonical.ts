import { createHash } from 'node:crypto';

/** Canonical JSON for this contract version; deliberately does not invoke toJSON. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (input: unknown, path: string): string => {
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new TypeError(`Non-finite number at ${path}`);
      return JSON.stringify(input);
    }
    if (typeof input !== 'object') throw new TypeError(`Non-JSON value at ${path}`);
    if (ancestors.has(input)) throw new TypeError(`Cycle at ${path}`);
    if (Object.getOwnPropertySymbols(input).length) throw new TypeError(`Symbol key at ${path}`);
    const proto: unknown = Object.getPrototypeOf(input);
    if (!Array.isArray(input) && proto !== Object.prototype && proto !== null) {
      throw new TypeError(`Non-plain object at ${path}`);
    }
    ancestors.add(input);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(input);
      if (Array.isArray(input)) {
        const keys = Object.keys(descriptors).filter((key) => key !== 'length');
        if (keys.length !== input.length) throw new TypeError(`Sparse or extended array at ${path}`);
        const parts: string[] = [];
        for (let i = 0; i < input.length; i += 1) {
          const descriptor = descriptors[String(i)];
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            throw new TypeError(`Non-JSON array element at ${path}[${i}]`);
          }
          parts.push(visit(descriptor.value, `${path}[${i}]`));
        }
        return `[${parts.join(',')}]`;
      }
      const parts: string[] = [];
      for (const key of Object.keys(descriptors).sort()) {
        const descriptor = descriptors[key];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          throw new TypeError(`Non-JSON property at ${path}.${key}`);
        }
        parts.push(`${JSON.stringify(key)}:${visit(descriptor.value, `${path}.${key}`)}`);
      }
      return `{${parts.join(',')}}`;
    } finally {
      ancestors.delete(input);
    }
  };
  return visit(value, '$');
}

export function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

/** Omit precisely one own root field, retaining identically named nested fields. */
export function digestOmitting(record: unknown, key: string): string {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('digestOmitting expects a plain record');
  }
  canonicalJson(record); // Reject accessors, symbols and unsupported values before copying.
  if (!Object.hasOwn(record, key)) throw new TypeError(`Missing root digest field: ${key}`);
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [name, value] of Object.entries(record)) if (name !== key) copy[name] = value;
  return digest(copy);
}
