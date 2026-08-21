import express from 'express';
import { PORT } from './config.js';
import authRouter from './routes/auth.js';
import modelsRouter from './routes/models.js';

let app = express();
app.use(express.static('wwwroot'));
app.use(authRouter);
app.use(modelsRouter);

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send(err.message);
});

app.listen(PORT, function () { console.log(`Server listening on port ${PORT}...`); });
app.on('error', function (err) {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use.`);
        process.exit(1);
    }
    throw err;
});
