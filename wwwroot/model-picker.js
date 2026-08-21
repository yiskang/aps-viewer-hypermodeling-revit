import {
    uploadFormState,
    buildUploadBody,
    describeHttpFailure,
    describeNetworkFailure,
    anchorPosition
} from './picker-core.js';

const dialog = document.getElementById('picker');
const cancelButton = document.getElementById('picker-cancel');
const statusText = document.getElementById('picker-status');
const retryButton = document.getElementById('picker-retry');
const list = document.getElementById('picker-list');
const confirmButton = document.getElementById('picker-confirm');
const uploadButton = document.getElementById('picker-upload');
const startButton = document.getElementById('picker-upload-start');
const fileInput = document.getElementById('picker-file');
const entrypointLabel = document.getElementById('picker-entrypoint-label');
const entrypointInput = document.getElementById('picker-entrypoint');
const uploadMessage = document.getElementById('picker-upload-message');

/** @type {((urn: string | null) => void) | null} */
let resolvePick = null;
/** Result staged by `finish`, read by the dialog's own close event. */
let pendingResult = null;
/** URN of the currently ticked row, or '' when nothing is ticked. */
let selectedUrn = '';
/** True while a POST is in flight; the dialog is not dismissable then. */
let uploading = false;
/** Element the dialog is currently anchored under, or null when centred. */
let anchorElement = null;
/**
 * Bumped at the start of every `refreshList` call. A stale call compares its
 * captured value against this after each `await` and, once superseded, stops
 * touching the DOM -- otherwise a hung fetch from a previous open can resolve
 * after a newer one already rendered and paint over it.
 */
let listGeneration = 0;

dialog.addEventListener('close', () => {
    window.removeEventListener('resize', positionAgainstAnchor);
    const result = pendingResult;
    pendingResult = null;
    const resolve = resolvePick;
    resolvePick = null;
    resolve?.(result);
});

dialog.addEventListener('cancel', (event) => {
    // Esc. Closing mid-upload would orphan a request whose URN is the only
    // record of the new object.
    if (uploading) {
        event.preventDefault();
    }
});

// A modal <dialog> does not close on a backdrop click by default; this is what
// makes that gesture work. With the dialog itself unpadded, a target of the
// dialog element can only be the backdrop.
dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !uploading) {
        finish(null);
    }
});

cancelButton.addEventListener('click', () => finish(null));

confirmButton.addEventListener('click', () => {
    if (selectedUrn !== '') {
        finish(selectedUrn);
    }
});

retryButton.addEventListener('click', () => { void refreshList(); });

uploadButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0] ?? null;
    const { needsEntrypoint } = uploadFormState(file?.name ?? '', entrypointInput.value);

    entrypointLabel.hidden = !needsEntrypoint;
    startButton.hidden = !needsEntrypoint;
    if (!needsEntrypoint) {
        // Clear it too: a stale entrypoint must not ride along on a later upload.
        entrypointInput.value = '';
    }
    syncStartButton();

    // A non-zip file needs no further input, so it uploads straight away --
    // the same as the old header button did.
    if (file && !needsEntrypoint) {
        void performUpload(file);
    }
});

entrypointInput.addEventListener('input', syncStartButton);

startButton.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (file) {
        void performUpload(file);
    }
});

/**
 * Position the dialog: under its anchor when there is one, centred when there
 * is not. Both branches set every inset property they depend on, rather than
 * relying on whatever the other branch (or the stylesheet) left behind.
 */
function positionAgainstAnchor() {
    if (!anchorElement) {
        // No anchor: centre. Every inset is set explicitly because an earlier
        // anchored open may have left inline top/left behind, and the
        // stylesheet's `margin: 0` would otherwise pin an `inset: 0` box to
        // the top-left corner instead of centring it.
        dialog.style.top = '0';
        dialog.style.left = '0';
        dialog.style.right = '0';
        dialog.style.bottom = '0';
        dialog.style.margin = 'auto';
        return;
    }
    const { top, left } = anchorPosition(
        anchorElement.getBoundingClientRect(),
        { width: dialog.offsetWidth, height: dialog.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
    );
    dialog.style.right = 'auto';
    dialog.style.bottom = 'auto';
    dialog.style.margin = '0';
    dialog.style.top = `${top}px`;
    dialog.style.left = `${left}px`;
}

/**
 * Ask the user to choose a model.
 *
 * @param {HTMLElement | null} [anchorEl] Element to anchor the dialog under.
 *   Falsy or omitted leaves the dialog at its unanchored default position.
 * @returns {Promise<string | null>} The chosen URN, or null if cancelled.
 */
export function openModelPicker(anchorEl = null) {
    return new Promise((resolve) => {
        resolvePick = resolve;
        pendingResult = null;
        anchorElement = anchorEl;
        setUploadMessage('');
        resetFileStaging();
        dialog.showModal();
        positionAgainstAnchor();
        window.addEventListener('resize', positionAgainstAnchor);
        void refreshList();
    });
}

/**
 * Close the dialog, resolving the open `openModelPicker` call with `result`.
 *
 * @param {string | null} result
 */
function finish(result) {
    pendingResult = result;
    dialog.close();
}

/**
 * Fetch the bucket listing and render it, replacing whatever the dialog was
 * showing. Never throws: every failure becomes a visible state.
 *
 * Superseded calls (a newer `refreshList` started, or the dialog closed
 * before this one resolved) stop touching the DOM after their next `await`
 * rather than painting over whatever is now on screen.
 *
 * @param {string} [preselectUrn] Tick this row once the list renders.
 * @returns {Promise<void>}
 */
async function refreshList(preselectUrn = '') {
    const generation = ++listGeneration;
    const isCurrent = () => generation === listGeneration;

    try {
        setSelection('');
        list.replaceChildren();
        retryButton.hidden = true;
        setStatus('Loading models…');

        let models;
        try {
            const resp = await fetch('/api/models');
            if (!isCurrent()) return;
            if (!resp.ok) {
                const bodyText = await resp.text();
                if (!isCurrent()) return;
                setStatus(describeHttpFailure(resp.status, resp.statusText, bodyText), true);
                retryButton.hidden = false;
                return;
            }
            models = await resp.json();
            if (!isCurrent()) return;
            if (!Array.isArray(models)) {
                // A 200 whose body isn't a list -- treat it the same as a bad
                // HTTP response rather than letting models.map blow up below.
                setStatus(describeHttpFailure(resp.status, resp.statusText, 'Response was not a list of models.'), true);
                retryButton.hidden = false;
                return;
            }
        } catch (err) {
            if (!isCurrent()) return;
            setStatus(describeNetworkFailure(err), true);
            retryButton.hidden = false;
            return;
        }

        if (models.length === 0) {
            setStatus('This bucket has no models yet.');
            return;
        }

        setStatus('');
        list.replaceChildren(...models.map(model => renderRow(model)));
        if (preselectUrn !== '') {
            setSelection(preselectUrn);
        }
    } finally {
        // A `return` above still runs this block, so both staleness and an
        // already-closed dialog (Esc fired while this call was in flight,
        // with no newer open to bump the generation) must be checked here,
        // not just at the call sites above.
        if (isCurrent() && dialog.open) {
            positionAgainstAnchor();
        }
    }
}

/**
 * @param {{ name: string, urn: string }} model
 * @returns {HTMLLIElement}
 */
function renderRow(model) {
    const row = document.createElement('li');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = model.urn;
    // Checkboxes, single-select: ticking one unticks the rest. The dialog
    // yields one URN, so a second ticked row would have no meaning.
    checkbox.addEventListener('change', () => {
        setSelection(checkbox.checked ? model.urn : '');
    });
    label.append(checkbox, document.createTextNode(` ${model.name}`));
    row.append(label);
    return row;
}

/**
 * Tick exactly the row matching `urn`, unticking every other, and enable
 * Confirm only when something is ticked.
 *
 * @param {string} urn
 */
function setSelection(urn) {
    selectedUrn = urn;
    for (const checkbox of list.querySelectorAll('input[type="checkbox"]')) {
        checkbox.checked = checkbox.value === urn && urn !== '';
    }
    confirmButton.disabled = urn === '';
}

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.dataset.error = String(isError);
}

/**
 * Upload `file`, then refresh the list with the new model ticked.
 *
 * Upload state is deliberately separate from the list state: a failed upload
 * must leave the rows on screen rather than replacing them with an error.
 *
 * @param {File} file
 * @returns {Promise<void>}
 */
async function performUpload(file) {
    uploading = true;
    setControlsDisabled(true);
    setUploadMessage(`Uploading ${file.name}. Do not reload the page.`);

    try {
        // This inner try is the only thing allowed to set the upload message.
        // `model` stays null if the POST fails, so the refresh below -- and
        // whatever it does -- is reached only on success and can never let
        // that catch overwrite the "Uploaded" line.
        let model = null;
        try {
            const resp = await fetch('/api/models', {
                method: 'POST',
                body: buildUploadBody(file, entrypointInput.value)
            });
            if (!resp.ok) {
                setUploadMessage(describeHttpFailure(resp.status, resp.statusText, await resp.text()), true);
                return;
            }
            model = await resp.json();
            // Kept visible even if the refresh below fails: the POST response is
            // the only record of this URN, and the listing is the thing most
            // likely to be broken.
            setUploadMessage(`Uploaded ${model.name} — ${model.urn}`);
        } catch (err) {
            setUploadMessage(describeNetworkFailure(err), true);
            return;
        }
        await refreshList(model.urn);
    } finally {
        uploading = false;
        setControlsDisabled(false);
        resetFileStaging();
    }
}

/** Enable Start only when the staged file is ready to send. */
function syncStartButton() {
    const file = fileInput.files[0] ?? null;
    startButton.disabled = !uploadFormState(file?.name ?? '', entrypointInput.value).canUpload;
}

/** @param {boolean} disabled */
function setControlsDisabled(disabled) {
    uploadButton.disabled = disabled;
    startButton.disabled = disabled;
    cancelButton.disabled = disabled;
    confirmButton.disabled = disabled || selectedUrn === '';
    retryButton.disabled = disabled;
    entrypointInput.disabled = disabled;
}

function resetFileStaging() {
    fileInput.value = '';
    entrypointInput.value = '';
    entrypointLabel.hidden = true;
    startButton.hidden = true;
}

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function setUploadMessage(message, isError = false) {
    uploadMessage.textContent = message;
    uploadMessage.dataset.error = String(isError);
    uploadMessage.hidden = message === '';
}
