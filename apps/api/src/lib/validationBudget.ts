export const validationBudget = { depth: 64, collectionSize: 10000, nodes: 200000 } as const;

// Bound validation work even for schemas with unbounded collections. Walk
// iteratively so deeply nested JSON cannot overflow the JavaScript call stack.
export function assertValidationBudget(input: unknown) {
  const pending = [{ value: input, depth: 0 }];
  let nodes = 0;
  const reject = () => {
    throw Object.assign(new Error("Request contains too many entries or nesting levels. Reduce the request size and try again."), { statusCode: 400 });
  };
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > validationBudget.nodes || depth > validationBudget.depth) reject();
    if (value === null || typeof value !== "object") continue;
    const keys = Object.keys(value);
    if (keys.length > validationBudget.collectionSize || nodes + pending.length + keys.length > validationBudget.nodes) reject();
    for (const key of keys) pending.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 });
  }
}
