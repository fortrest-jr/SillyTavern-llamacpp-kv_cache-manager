import { textgen_types, textgenerationwebui_settings } from '../../../../textgen-settings.js';

import HttpClient from './http-client.js';
import { LLAMA_API_TIMEOUTS } from '../settings.js';

class LlamaApi {
    constructor() {
        this.httpClient = new HttpClient();
    }

    /**
     * Get base server URL
     * @returns {string} Base URL
     */
    _getBaseUrl() {
        const provided_url = textgenerationwebui_settings.server_urls[textgen_types.LLAMACPP];
        return provided_url;
    }

    /**
     * Build full URL for request
     * @param {string} path - Endpoint path
     * @returns {string} Full URL
     */
    _buildUrl(path) {
        const baseUrl = this._getBaseUrl();
        const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        return `${base}${cleanPath}`;
    }

    /**
     * Get information about all slots
     * @param {Object} options - Request options
     * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
     * @returns {Promise<Array|Object|null>} Slot information or null on error
     * @throws {Error} On request error
     */
    async getSlots(options = {}) {
        const url = this._buildUrl('slots');
        const requestOptions = {
            timeout: LLAMA_API_TIMEOUTS.GET_SLOTS,
            ...options
        };
        
        return await this.httpClient.get(url, requestOptions);
    }

    /**
     * Save cache for slot
     * @param {number} slotId - Slot index
     * @param {string} filename - Filename for saving
     * @param {Object} options - Request options
     * @param {number} options.timeout - Timeout in milliseconds (default: 300000)
     * @returns {Promise<void>}
     * @throws {Error} On request error
     */
    async saveSlotCache(slotId, filename, options = {}) {
        const url = this._buildUrl(`slots/${slotId}?action=save`);
        const requestOptions = {
            timeout: LLAMA_API_TIMEOUTS.SAVE_CACHE,
            ...options
        };
        
        return await this.httpClient.post(url, { filename }, requestOptions);
    }

    /**
     * Load cache for slot
     * @param {number} slotId - Slot index
     * @param {string} filename - Filename to load
     * @param {Object} options - Request options
     * @param {number} options.timeout - Timeout in milliseconds (default: 300000)
     * @returns {Promise<void>}
     * @throws {Error} On request error
     */
    async loadSlotCache(slotId, filename, options = {}) {
        const url = this._buildUrl(`slots/${slotId}?action=restore`);
        const requestOptions = {
            timeout: LLAMA_API_TIMEOUTS.LOAD_CACHE,
            ...options
        };
        
        return await this.httpClient.post(url, { filename }, requestOptions);
    }

    /**
     * Clear cache for slot
     * @param {number} slotId - Slot index
     * @param {Object} options - Request options
     * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
     * @returns {Promise<void>}
     * @throws {Error} On request error
     */
    async clearSlotCache(slotId, options = {}) {
        const url = this._buildUrl(`slots/${slotId}?action=erase`);
        const requestOptions = {
            timeout: LLAMA_API_TIMEOUTS.CLEAR_CACHE,
            ...options
        };
        
        return await this.httpClient.post(url, null, requestOptions);
    }
}

export default LlamaApi;

