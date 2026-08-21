import { initViewer, loadModel } from './viewer.js';
import { openModelPicker } from './model-picker.js';
import { normalizeUrn, urnFromHash, shouldLoadFromHash } from './urn.js';

/** The URN most recently handed to `onModelSelected`; see `shouldLoadFromHash`. */
let lastRequestedUrn = '';

initViewer(document.getElementById('preview')).then(viewer => {
    setupUrnInput(viewer);
});

function setupUrnInput(viewer) {
    const input = document.getElementById('urn');
    const loadButton = document.getElementById('load');
    const browseButton = document.getElementById('browse');

    const request = (urn) => {
        lastRequestedUrn = urn;
        onModelSelected(viewer, urn);
    };

    loadButton.onclick = () => {
        const urn = normalizeUrn(input.value);
        if (urn) {
            request(urn);
        }
    };

    input.onkeydown = (event) => {
        if (event.key === 'Enter') {
            loadButton.click();
        }
    };

    // Browse fills the textbox and nothing more. Load is the only thing that
    // ever loads, so the textbox is always what will load next.
    browseButton.onclick = async () => {
        const urn = await openModelPicker(browseButton);
        if (urn) {
            input.value = urn;
        }
    };

    window.addEventListener('hashchange', () => {
        const urn = urnFromHash(window.location.hash);
        if (!shouldLoadFromHash(urn, lastRequestedUrn)) {
            return;
        }
        input.value = urn;
        request(urn);
    });

    const initialUrn = urnFromHash(window.location.hash);
    if (initialUrn) {
        input.value = initialUrn;
        request(initialUrn);
    }
}

async function onModelSelected(viewer, urn) {
    if (window.onModelSelectedTimeout) {
        clearTimeout(window.onModelSelectedTimeout);
        delete window.onModelSelectedTimeout;
    }
    window.location.hash = urn;
    try {
        const resp = await fetch(`/api/models/${urn}/status`);
        if (!resp.ok) {
            throw new Error(await resp.text());
        }
        const status = await resp.json();
        switch (status.status) {
            case 'n/a':
                showNotification(`Model has not been translated.`);
                break;
            case 'inprogress':
                showNotification(`Model is being translated (${status.progress})...`);
                window.onModelSelectedTimeout = setTimeout(onModelSelected, 5000, viewer, urn);
                break;
            case 'failed':
                showNotification(`Translation failed. <ul>${status.messages.map(msg => `<li>${JSON.stringify(msg)}</li>`).join('')}</ul>`);
                break;
            default:
                clearNotification();
                loadModel(viewer, urn);
                break; 
        }
    } catch (err) {
        alert('Could not load model. See the console for more details.');
        console.error(err);
    }
}

function showNotification(message) {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `<div class="notification">${message}</div>`;
    overlay.style.display = 'flex';
}

function clearNotification() {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = '';
    overlay.style.display = 'none';
}
