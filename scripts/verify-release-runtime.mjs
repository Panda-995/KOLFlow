import assert from 'node:assert/strict';
import { constants, createCipheriv, publicEncrypt, randomBytes } from 'node:crypto';
import { getCompletedReportPeriod } from '../build/src/lib/reportSchedule.js';

const base = process.env.RELEASE_BASE_URL || 'http://127.0.0.1:3000/api';
const mode = process.argv[2];
assert(['seed', 'verify'].includes(mode));
let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try { ready = (await fetch(`${base}/health`)).ok; } catch {}
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert(ready, 'Compose service did not become healthy');
assert.equal((await fetch(`${base}/orders`)).status, 401);

const keyResponse = await fetch(`${base}/auth/encryption-key`);
assert.equal(keyResponse.status, 200);
const key = await keyResponse.json();
const contentKey = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', contentKey, iv);
const credentials = {
  email: 'compose-release@example.com', password: 'Compose-release-2026!',
  inviteCode: process.env.INVITE_CODE, privacyAccepted: true,
  challenge: key.challenge, issuedAt: Date.now(),
};
const ciphertext = Buffer.concat([
  cipher.update(JSON.stringify(credentials)), cipher.final(), cipher.getAuthTag(),
]);
const auth = await fetch(`${base}/auth/${mode === 'seed' ? 'register' : 'login'}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ encryptedAuth: {
    version: 1, keyId: key.keyId, algorithm: key.algorithm,
    encryptedKey: publicEncrypt({ key: key.publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, contentKey).toString('base64'),
    iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'),
  } }),
});
assert.equal(auth.status, 200, `Encrypted ${mode === 'seed' ? 'registration' : 'login'} failed`);
const { token } = await auth.json();
assert.equal(typeof token, 'string');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const period = getCompletedReportPeriod('weekly');
if (mode === 'seed') {
  const created = await fetch(`${base}/orders`, {
    method: 'POST', headers,
    body: JSON.stringify({ title: 'Compose persistence fixture', type: 'paid', status: 'completed',
      actualAmount: 123, brandName: 'Compose fixture', platforms: [],
      acceptDate: period.start, operationDate: period.start,
    }),
  });
  assert.equal(created.status, 200);
}
const reportResponse = await fetch(`${base}/report/weekly`, { headers });
assert.equal(reportResponse.status, 200);
const report = await reportResponse.json();
assert.deepEqual(report.period, period);
assert.equal(report.summary.totalOrders, 1);
assert.equal(report.summary.completedOrders, 1);
assert.equal(report.summary.pendingIncome, 123);
assert.deepEqual(getCompletedReportPeriod('weekly', new Date('2026-09-20T16:00:00Z')), {
  type: 'weekly', start: '2026-09-14', end: '2026-09-20',
});
assert.equal((await fetch(`${base}/report/yearly`, { headers })).status, 400);
console.log(`PASS: Compose ${mode}, encrypted authentication, protected API, complete weekly report and persistent data`);
