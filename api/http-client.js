class HttpClient {
    /**
     * Execute HTTP request with timeout and error handling
     * @param {string} url - Full URL for request
     * @param {Object} options - Request options
     * @param {string} options.method - HTTP method (GET, POST, DELETE, etc.)
     * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
     * @param {Object} options.headers - Request headers
     * @param {Object|string} options.body - Request body (will be serialized to JSON if object)
     * @param {string} options.credentials - Credentials for request (same-origin, include, etc.)
     * @returns {Promise<Object|string|null>} Parsed JSON response, text, or null
     * @throws {Error} On request error or timeout
     */
    async request(url, options = {}) {
        const {
            method = 'GET',
            timeout = 10000,
            headers = {},
            body = null,
            credentials = undefined
        } = options;

        if (body && typeof body === 'object' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        let timeoutId = null;
        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), timeout);

            const fetchOptions = {
                method,
                headers,
                signal: controller.signal
            };

            if (body !== null) {
                fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
            }

            if (credentials !== undefined) {
                fetchOptions.credentials = credentials;
            }

            const response = await fetch(url, fetchOptions);
            
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            const text = await response.text();
            return text || null;
        } catch (e) {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            if (e.name === 'AbortError') {
                throw new Error(`Request timeout (${timeout}ms)`);
            }
            
            throw e;
        }
    }

    /**
     * GET request
     * @param {string} url - URL for request
     * @param {Object} options - Request options
     * @returns {Promise<Object|string|null>}
     */
    async get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    }

    /**
     * POST request
     * @param {string} url - URL for request
     * @param {Object|string} body - Request body
     * @param {Object} options - Request options
     * @returns {Promise<Object|string|null>}
     */
    async post(url, body = null, options = {}) {
        return this.request(url, { ...options, method: 'POST', body });
    }

    /**
     * DELETE request
     * @param {string} url - URL for request
     * @param {Object} options - Request options
     * @returns {Promise<Object|string|null>}
     */
    async delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    }
}

export default HttpClient;
