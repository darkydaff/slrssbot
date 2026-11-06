export function table(name, columns, extra) {
  return { name, columns, extra };
}

export function integer(name, opts = {}) {
  return { type: 'integer', name, ...opts, notNull: () => ({ ...opts, notNull: true }), primaryKey: (pOpts) => ({ ...opts, primaryKey: true, ...pOpts }), default: (val) => ({ ...opts, default: val }) };
}

export function text(name, opts = {}) {
  return { type: 'text', name, ...opts, notNull: () => ({ ...opts, notNull: true }), primaryKey: () => ({ ...opts, primaryKey: true }), default: (val) => ({ ...opts, default: val }) };
}

export function boolean(name, opts = {}) {
  return { type: 'boolean', name, ...opts, default: (val) => ({ ...opts, default: val }) };
}

export function json(name, opts = {}) {
  return { type: 'text', mode: 'json', name, ...opts, default: (val) => ({ ...opts, default: val }) };
}

export function index(name) {
  return { on: (...cols) => ({ name, cols, type: 'index' }) };
}

export function uniqueIndex(name) {
  return { on: (...cols) => ({ name, cols, type: 'uniqueIndex' }) };
}

export function eq(a, b) {
  return { op: '=', a, b };
}

export function ne(a, b) {
  return { op: '!=', a, b };
}

export function gt(a, b) {
  return { op: '>', a, b };
}

export function gte(a, b) {
  return { op: '>=', a, b };
}

export function lt(a, b) {
  return { op: '<', a, b };
}

export function lte(a, b) {
  return { op: '<=', a, b };
}

export function and(...conditions) {
  return { op: 'AND', conditions };
}

export function or(...conditions) {
  return { op: 'OR', conditions };
}

export function desc(col) {
  return { col, order: 'DESC' };
}

export function asc(col) {
  return { col, order: 'ASC' };
}

export function sql(strings, ...values) {
  const obj = { sql: strings, values };
  return obj;
}

sql.raw = function(str) {
  return { raw: str, type: 'raw' };
};

export const db = {
  select: () => {
    const chain = {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      groupBy: () => chain,
      all: async () => [],
      get: async () => null,
      values: async () => [],
    };
    return {
      from: () => chain,
      ...chain,
    };
  },
  insert: () => ({
    values: () => ({
      onConflictDoNothing: () => ({ run: async () => ({ rowsAffected: 1 }) }),
      onConflictDoUpdate: () => ({ run: async () => ({ rowsAffected: 1 }) }),
      run: async () => ({ rowsAffected: 1 }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => ({
        run: async () => ({ rowsAffected: 1 }),
      }),
    }),
  }),
  delete: () => ({
    where: () => ({
      run: async () => ({ rowsAffected: 1 }),
    }),
  }),
  get: async () => null,
  all: async () => [],
  run: async () => ({ rowsAffected: 1 }),
};

export default db;
