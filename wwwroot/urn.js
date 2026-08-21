/**
 * Trim a user-supplied URN down to something usable.
 *
 * @param {unknown} text
 * @returns {string} The trimmed URN, or '' when there is nothing usable.
 */
export function normalizeUrn(text) {
    return typeof text === 'string' ? text.trim() : '';
}

/**
 * Extract the URN from a location hash.
 *
 * @param {unknown} hash A `window.location.hash` value, e.g. '#dXJuOmFkc2s'.
 * @returns {string} The URN, or '' when the hash carries none.
 */
export function urnFromHash(hash) {
    if (typeof hash !== 'string') {
        return '';
    }
    return normalizeUrn(hash.startsWith('#') ? hash.slice(1) : hash);
}

/**
 * Decide whether a `hashchange` should load a model.
 *
 * `onModelSelected` writes `window.location.hash` itself, and that write fires
 * `hashchange` like any other. Without this guard every Load would re-enter and
 * load the same model twice -- a duplicate status fetch and a duplicate
 * `loadModel`, invisible in the UI and visible only as a doubled request.
 *
 * @param {string} incomingUrn The URN now in the location hash.
 * @param {string} lastRequestedUrn The URN we most recently asked to load.
 * @returns {boolean}
 */
export function shouldLoadFromHash(incomingUrn, lastRequestedUrn) {
    return incomingUrn !== '' && incomingUrn !== lastRequestedUrn;
}
