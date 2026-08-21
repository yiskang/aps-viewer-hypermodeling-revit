/**
 * What the upload controls should offer for the currently staged file.
 *
 * @param {string} fileName Name of the staged file, or '' when none is staged.
 * @param {unknown} entrypoint Current value of the zip-entrypoint field.
 * @returns {{ needsEntrypoint: boolean, canUpload: boolean }}
 */
export function uploadFormState(fileName, entrypoint) {
    const name = typeof fileName === 'string' ? fileName : '';
    if (name === '') {
        return { needsEntrypoint: false, canUpload: false };
    }
    const needsEntrypoint = name.toLowerCase().endsWith('.zip');
    const canUpload = !needsEntrypoint || trimmed(entrypoint) !== '';
    return { needsEntrypoint, canUpload };
}

/**
 * Build the multipart body for `POST /api/models`.
 *
 * The entrypoint is appended only for a zip. `window.prompt` used to return ''
 * on an empty submission and null on dismissal, and the old code appended
 * either one regardless -- sending an entrypoint-less zip to the translation
 * service, which then failed server-side.
 *
 * @param {File} file
 * @param {unknown} entrypoint
 * @returns {FormData}
 */
export function buildUploadBody(file, entrypoint) {
    const body = new FormData();
    body.append('model-file', file);
    if (uploadFormState(file?.name ?? '', entrypoint).needsEntrypoint) {
        body.append('model-zip-entrypoint', trimmed(entrypoint));
    }
    return body;
}

/**
 * Describe a non-OK HTTP response for display inside the dialog.
 *
 * @param {number} status
 * @param {string} statusText
 * @param {unknown} bodyText
 * @returns {string}
 */
export function describeHttpFailure(status, statusText, bodyText) {
    const head = `${status} ${statusText}`.trim();
    const body = trimmed(bodyText);
    return body === '' ? head : `${head} — ${body}`;
}

/**
 * Describe a fetch that never produced a response at all.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeNetworkFailure(error) {
    const detail = error instanceof Error ? error.message : trimmed(error);
    return detail === '' ? 'Could not reach the server.' : `Could not reach the server: ${detail}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimmed(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Where to place the dialog so it hangs under the control that opened it.
 *
 * Computed from the anchor's real rect rather than written as static CSS
 * offsets: offsets are a guess at where the button sits, and they drift the
 * moment the header wraps or the viewport narrows. The result is clamped into
 * the viewport so an overflowing dialog is pulled back on-screen instead of
 * being rendered partly outside it.
 *
 * @param {{ bottom: number, right: number }} anchorRect Anchor's viewport rect.
 * @param {{ width: number, height: number }} dialogSize
 * @param {{ width: number, height: number }} viewport
 * @param {number} [gap] Space from the anchor and from the viewport edges.
 * @returns {{ top: number, left: number }} Viewport coordinates, in pixels.
 */
export function anchorPosition(anchorRect, dialogSize, viewport, gap = 8) {
    const top = clamp(
        anchorRect.bottom + gap,
        gap,
        viewport.height - dialogSize.height - gap
    );
    const left = clamp(
        anchorRect.right - dialogSize.width,
        gap,
        viewport.width - dialogSize.width - gap
    );
    return { top, left };
}

/**
 * Clamp `value` into [min, max]. When the range is inverted -- the dialog is
 * larger than the viewport -- `min` wins, keeping the top-left corner visible.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
