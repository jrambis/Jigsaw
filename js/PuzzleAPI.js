/**
 * PuzzleAPI - Client for communicating with PHP backend
 * Handles save/load/list/delete operations for puzzle states
 * @version 1.0.0
 */
class PuzzleAPI {
    constructor(baseUrl = './api.php') {
        this.baseUrl = baseUrl;
    }

    /**
     * Make API request
     * @param {string} action - API action
     * @param {string} method - HTTP method
     * @param {Object} data - Request data
     * @param {Object} params - URL parameters
     * @returns {Promise<Object>} API response
     */
    async request(action, method = 'GET', data = null, params = {}) {
        const url = new URL(this.baseUrl, window.location.origin);
        url.searchParams.set('action', action);

        // Add additional URL parameters
        Object.keys(params).forEach(key => {
            url.searchParams.set(key, params[key]);
        });

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url.toString(), options);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'API request failed');
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    /**
     * Save puzzle state
     * @param {string} puzzleId - Unique puzzle identifier
     * @param {string} name - Puzzle name
     * @param {Object} state - Puzzle state object
     * @returns {Promise<Object>}
     */
    async savePuzzle(puzzleId, name, state) {
        return await this.request('save', 'POST', {
            puzzleId,
            name,
            state,
            createdAt: state.createdAt || Date.now()
        });
    }

    /**
     * Load puzzle state
     * @param {string} puzzleId - Puzzle identifier
     * @returns {Promise<Object>}
     */
    async loadPuzzle(puzzleId) {
        return await this.request('load', 'GET', null, { id: puzzleId });
    }

    /**
     * List all saved puzzles
     * @returns {Promise<Array>}
     */
    async listPuzzles() {
        const result = await this.request('list', 'GET');
        return result.data || [];
    }

    /**
     * Delete puzzle
     * @param {string} puzzleId - Puzzle identifier
     * @returns {Promise<Object>}
     */
    async deletePuzzle(puzzleId) {
        return await this.request('delete', 'POST', null, { id: puzzleId });
    }
}
