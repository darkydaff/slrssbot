/**
 * Client-side Telegram Serverless API caller
 */

import { tg } from './telegram.js';

export class ApiError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'ApiError';
    this.type = opts.type || 'ENDPOINT_ERROR';
    this.parameters = opts.parameters || {};
  }
}

/**
 * Call a serverless endpoint on tgcloud
 * @param {string} endpointName - name of endpoint under tgcloud/endpoints/
 * @param {object} input - JSON payload
 * @returns {Promise<any>}
 */
export function callApi(endpointName, input = {}) {
  return new Promise((resolve, reject) => {
    // 1. Try native Telegram WebApp Serverless call
    if (tg?.Serverless?.call) {
      tg.Serverless.call(endpointName, input, (err, result) => {
        if (err) {
          const apiErr = new ApiError(err.message || 'Endpoint request failed', {
            type: err.type,
            parameters: err.parameters,
          });
          return reject(apiErr);
        }
        resolve(result);
      });
      return;
    }

    // 2. Fallback to standard fetch (for local dev or direct web preview)
    const headers = {
      'Content-Type': 'application/json',
    };

    if (tg?.initData) {
      headers['Authorization'] = `tma ${tg.initData}`;
    }

    fetch(`/api/${endpointName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    })
      .then(async (res) => {
        const text = await res.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          throw new ApiError(`Invalid server response: HTTP ${res.status}`);
        }

        if (!res.ok || json.ok === false) {
          throw new ApiError(json.description || json.error || `HTTP ${res.status}`, {
            type: json.error_type,
            parameters: json.parameters,
          });
        }
        resolve(json.result ?? json);
      })
      .catch((err) => {
        reject(err instanceof ApiError ? err : new ApiError(err.message));
      });
  });
}

