import express from 'express';
import multer from 'multer';
import os from 'node:os';
import { listObjects, uploadObject, translateObject, getManifest, urnify } from '../services/aps.js';

let router = express.Router();
const upload = multer({ dest: os.tmpdir() });

router.get('/api/models', async function (req, res, next) {
    try {
        const objects = await listObjects();
        res.json(objects.map(o => ({
            name: o.objectKey,
            urn: urnify(o.objectId)
        })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
        next(err);
    }
});
    

router.get('/api/models/:urn/status', async function (req, res, next) {
    try {
        const manifest = await getManifest(req.params.urn);
        if (manifest) {
            let messages = [];
            if (manifest.derivatives) {
                for (const derivative of manifest.derivatives) {
                    messages = messages.concat(derivative.messages || []);
                    if (derivative.children) {
                        for (const child of derivative.children) {
                            messages = messages.concat(child.messages || []);
                        }
                    }
                }
            }
            res.json({ status: manifest.status, progress: manifest.progress, messages });
        } else {
            res.json({ status: 'n/a' });
        }
    } catch (err) {
        next(err);
    }
});

router.post('/api/models', upload.single('model-file'), async function (req, res, next) {
    const file = req.file;
    if (!file) {
        res.status(400).send('The required field ("model-file") is missing.');
        return;
    }
    try {
        const obj = await uploadObject(file.originalname, file.path);
        await translateObject(urnify(obj.objectId), req.body['model-zip-entrypoint']);
        res.json({
            name: obj.objectKey,
            urn: urnify(obj.objectId)
        });
    } catch (err) {
        next(err);
    }
});

export default router;
