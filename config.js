import dotenv from 'dotenv';
// dotenv 17 flipped `quiet` to false, so it otherwise prints an injection
// banner plus a rotating tip to stdout on every start.
dotenv.config({ quiet: true });

let { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET, PORT } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.warn('Missing some of the environment variables.');
    process.exit(1);
}
APS_BUCKET = APS_BUCKET || `${APS_CLIENT_ID.toLowerCase()}-basic-app`;
PORT = PORT || 8080;

export {
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    APS_BUCKET,
    PORT
};
