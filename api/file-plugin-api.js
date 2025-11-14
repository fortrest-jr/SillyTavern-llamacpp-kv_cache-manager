import HttpClient from './http-client.js';
import { FILE_PLUGIN_API_TIMEOUTS } from '../settings.js';

class FilePluginApi {
    constructor() {
        this.httpClient = new HttpClient();
        this._csrfTokenCache = null;
    }

    /**
     * Get CSRF token (cached)
     * @param {Object} options - Request options
     * @param {number} options.timeout - Timeout in milliseconds (default: 5000)
     * @returns {Promise<string|null>} CSRF token or null on error
     */
    async getCsrfToken(options = {}) {
        if (this._csrfTokenCache) {
            return this._csrfTokenCache;
        }

        try {
            const url = '/csrf-token';
            const requestOptions = {
                timeout: FILE_PLUGIN_API_TIMEOUTS.CSRF_TOKEN,
                ...options
            };
            
            const response = await this.httpClient.get(url, requestOptions);

            if (response && response.token) {
                this._csrfTokenCache = response.token;
                return this._csrfTokenCache;
            }
        } catch (e) {
            // Silent error handling - return null
        }

        return null;
    }

    /**
     * Get list of files
     * @param {Object} options - Request options
     * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
     * @returns {Promise<Object|null>} File list or null on error
     * @throws {Error} On request error
     */
    async getFilesList(options = {}) {
        const url = '/api/plugins/kv-cache-manager/files';
        const requestOptions = {
            timeout: FILE_PLUGIN_API_TIMEOUTS.GET_FILES,
            ...options
        };
        
        return await this.httpClient.get(url, requestOptions);
    }

    /**
     * Delete file
     * @param {string} filename - Filename to delete
     * @param {Object} options - Request options
     * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
     * @returns {Promise<void>}
     * @throws {Error} On request error
     */
    async deleteFile(filename, options = {}) {
        const url = `/api/plugins/kv-cache-manager/files/${filename}`;
        const requestOptions = {
            timeout: FILE_PLUGIN_API_TIMEOUTS.DELETE_FILE,
            ...options
        };
        
        const csrfToken = await this.getCsrfToken();
        const headers = { ...requestOptions.headers };
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        return await this.httpClient.delete(url, {
            ...requestOptions,
            headers,
            credentials: 'same-origin'
        });
    }
}

export default FilePluginApi;

