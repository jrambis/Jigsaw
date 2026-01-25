/**
 * PuzzleAPI - Client for communicating with PHP backend
 * Handles shared puzzle state, backups, user prefs, and SSE subscription
 * @version 2.0.0 - Multiuser support
 */
class PuzzleAPI {
    constructor(baseUrl = './api.php') {
        this.baseUrl = baseUrl;
        this.eventSource = null;
        this.onPuzzleUpdate = null;  // Callback for SSE updates
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
            },
            credentials: 'include'  // Include session cookies
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

    // ==================== Shared Puzzle Methods ====================

    /**
     * Save shared puzzle state
     * @param {string} imagePath - Image path (e.g., "images/DisneyHoliday.jpg")
     * @param {Object} state - Puzzle state object
     * @returns {Promise<Object>}
     */
    async saveSharedPuzzle(imagePath, state) {
        return await this.request('saveShared', 'POST', {
            image: imagePath,
            state: state
        });
    }

    /**
     * Load shared puzzle state
     * @param {string} imagePath - Image path
     * @returns {Promise<Object>}
     */
    async loadSharedPuzzle(imagePath) {
        return await this.request('loadShared', 'GET', null, { image: imagePath });
    }

    /**
     * Reset puzzle (scatter pieces)
     * @param {string} imagePath - Image path
     * @returns {Promise<Object>}
     */
    async resetPuzzle(imagePath) {
        return await this.request('resetPuzzle', 'POST', null, { image: imagePath });
    }

    // ==================== Backup Methods ====================

    /**
     * List available backups for a puzzle
     * @param {string} imagePath - Image path
     * @returns {Promise<Array>}
     */
    async listBackups(imagePath) {
        const result = await this.request('listBackups', 'GET', null, { image: imagePath });
        return result.data?.backups || [];
    }

    /**
     * Restore puzzle from backup
     * @param {string} imagePath - Image path
     * @param {string} backupFilename - Backup file to restore
     * @returns {Promise<Object>}
     */
    async restoreBackup(imagePath, backupFilename) {
        return await this.request('restoreBackup', 'POST', null, {
            image: imagePath,
            backup: backupFilename
        });
    }

    // ==================== User Preferences ====================

    /**
     * Save user preferences
     * @param {string} displayName - User's display name
     * @param {string} color - User's color (hex)
     * @returns {Promise<Object>}
     */
    async saveUserPrefs(displayName, color) {
        return await this.request('saveUserPrefs', 'POST', {
            displayName,
            color
        });
    }

    /**
     * Get user preferences
     * @returns {Promise<Object>}
     */
    async getUserPrefs() {
        const result = await this.request('getUserPrefs', 'GET');
        return result.data;
    }

    // ==================== Selection Broadcasting ====================

    /**
     * Update user's piece selection (broadcast to other users)
     * @param {string} imagePath - Image path
     * @param {Array<number>} pieceIds - Selected piece IDs
     * @param {string} color - User's color
     * @param {string} displayName - User's display name
     * @param {boolean} referenceSelected - Whether reference image is selected
     * @returns {Promise<Object>}
     */
    async updateSelection(imagePath, pieceIds, color, displayName, referenceSelected = false) {
        return await this.request('updateSelection', 'POST', {
            image: imagePath,
            pieceIds,
            color,
            displayName,
            referenceSelected
        });
    }

    // ==================== SSE Subscription ====================

    /**
     * Subscribe to real-time puzzle updates via SSE
     * @param {string} imagePath - Image path to subscribe to
     * @param {Function} onUpdate - Callback for puzzle updates
     * @param {Function} onConnect - Callback when connected
     * @param {Function} onError - Callback for errors
     */
    subscribe(imagePath, onUpdate, onConnect = null, onError = null) {
        // Close existing connection if any
        this.unsubscribe();

        const url = new URL(this.baseUrl, window.location.origin);
        url.searchParams.set('action', 'subscribe');
        url.searchParams.set('image', imagePath);

        this.eventSource = new EventSource(url.toString(), { withCredentials: true });
        this.onPuzzleUpdate = onUpdate;

        this.eventSource.addEventListener('connected', (event) => {
            const data = JSON.parse(event.data);
            console.log('SSE connected:', data);
            if (onConnect) onConnect(data);
        });

        this.eventSource.addEventListener('puzzleUpdate', (event) => {
            const data = JSON.parse(event.data);
            if (this.onPuzzleUpdate) {
                this.onPuzzleUpdate(data);
            }
        });

        this.eventSource.addEventListener('timeout', (event) => {
            console.log('SSE timeout, reconnecting...');
            // Auto-reconnect after timeout
            setTimeout(() => {
                this.subscribe(imagePath, onUpdate, onConnect, onError);
            }, 1000);
        });

        this.eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            if (onError) onError(error);

            // Auto-reconnect on error
            if (this.eventSource.readyState === EventSource.CLOSED) {
                setTimeout(() => {
                    this.subscribe(imagePath, onUpdate, onConnect, onError);
                }, 3000);
            }
        };
    }

    /**
     * Unsubscribe from SSE updates
     */
    unsubscribe() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.onPuzzleUpdate = null;
    }

    // ==================== Image Upload Methods ====================

    /**
     * Upload an image file
     * @param {File} file - Image file to upload
     * @param {string} name - User-provided display name
     * @param {Function} onProgress - Progress callback (0-100)
     * @returns {Promise<Object>} Upload result with imagePath
     */
    async uploadImage(file, name, onProgress = null) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();

            formData.append('image', file);
            formData.append('name', name);

            // Track upload progress
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        onProgress(percent);
                    }
                });
            }

            xhr.addEventListener('load', () => {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (result.success) {
                        resolve(result);
                    } else {
                        reject(new Error(result.message || 'Upload failed'));
                    }
                } catch (e) {
                    reject(new Error('Invalid server response'));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Network error during upload'));
            });

            xhr.addEventListener('abort', () => {
                reject(new Error('Upload cancelled'));
            });

            const url = new URL(this.baseUrl, window.location.origin);
            url.searchParams.set('action', 'uploadImage');

            xhr.open('POST', url.toString());
            xhr.withCredentials = true;
            xhr.send(formData);
        });
    }

    /**
     * List all available images (built-in + uploaded)
     * @returns {Promise<Array>} Array of image objects {path, name, isUploaded}
     */
    async listImages() {
        const result = await this.request('listImages', 'GET');
        return result.data?.images || [];
    }

    /**
     * Delete an uploaded image and its puzzle data
     * @param {string} imagePath - Path of the image to delete
     * @returns {Promise<Object>} Deletion result
     */
    async deleteImage(imagePath) {
        return await this.request('deleteImage', 'POST', { imagePath });
    }

    // ==================== Legacy Methods (kept for compatibility) ====================

    /**
     * Save puzzle state (legacy - uses saveShared)
     */
    async savePuzzle(puzzleId, name, state) {
        return await this.saveSharedPuzzle(state.image, state);
    }

    /**
     * Load puzzle state (legacy)
     */
    async loadPuzzle(puzzleId) {
        return await this.request('load', 'GET', null, { id: puzzleId });
    }

    /**
     * List all saved puzzles (legacy)
     */
    async listPuzzles() {
        const result = await this.request('list', 'GET');
        return result.data || [];
    }

    /**
     * Delete puzzle (legacy)
     */
    async deletePuzzle(puzzleId) {
        return await this.request('delete', 'POST', null, { id: puzzleId });
    }
}
