import db from './db.js';

export { db };
export const api = new Proxy({}, {
  get: (_, prop) => async () => ({ ok: true }),
});
export const fetch = globalThis.fetch;
export class BotApiError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'BotApiError';
    this.code = opts.code || 400;
  }
}
export class EndpointError extends Error {
  constructor(description, parameters = {}) {
    super(description);
    this.name = 'EndpointError';
    this.description = description;
    this.parameters = parameters;
  }
}
export class InputFile {
  constructor(data, filename) {
    this.data = data;
    this.filename = filename;
  }
}

