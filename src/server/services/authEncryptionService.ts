import {
  constants,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} from 'node:crypto';

export const AUTH_ENCRYPTION_ALGORITHM = 'RSA-OAEP-256+A256GCM' as const;

export type EncryptedSensitivePayload = {
  version: 1;
  keyId: string;
  algorithm: typeof AUTH_ENCRYPTION_ALGORITHM;
  encryptedKey: string;
  iv: string;
  ciphertext: string;
};

type ChallengeRecord = { expiresAt: number };

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 10_000;
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
const keyId = createHash('sha256').update(publicKeyDer).digest('base64url').slice(0, 32);
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const pendingChallenges = new Map<string, ChallengeRecord>();

const cleanExpiredChallenges = (now = Date.now()): void => {
  for (const [challenge, record] of pendingChallenges) {
    if (record.expiresAt <= now) pendingChallenges.delete(challenge);
  }
  while (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
    const oldest = pendingChallenges.keys().next().value as string | undefined;
    if (!oldest) break;
    pendingChallenges.delete(oldest);
  }
};

const decodeBase64 = (value: unknown, field: string, maxBytes: number): Buffer => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${field} 格式无效`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.length > maxBytes) {
    throw new Error(`${field} 长度无效`);
  }
  return decoded;
};

export const issueAuthEncryptionKey = () => {
  const now = Date.now();
  cleanExpiredChallenges(now);
  const challenge = randomBytes(32).toString('base64url');
  const expiresAt = now + CHALLENGE_TTL_MS;
  pendingChallenges.set(challenge, { expiresAt });

  return {
    keyId,
    algorithm: AUTH_ENCRYPTION_ALGORITHM,
    publicKeyPem,
    challenge,
    expiresAt: new Date(expiresAt).toISOString(),
  };
};

export const decryptSensitivePayload = (
  envelope: EncryptedSensitivePayload,
): Record<string, unknown> => {
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.keyId !== keyId ||
    envelope.algorithm !== AUTH_ENCRYPTION_ALGORITHM
  ) {
    throw new Error('认证加密载荷版本或密钥无效');
  }

  const encryptedKey = decodeBase64(envelope.encryptedKey, 'encryptedKey', 512);
  const iv = decodeBase64(envelope.iv, 'iv', 32);
  const encryptedData = decodeBase64(envelope.ciphertext, 'ciphertext', 32 * 1024);
  if (iv.length !== 12 || encryptedData.length <= 16) {
    throw new Error('认证加密载荷长度无效');
  }

  const contentKey = privateDecrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, encryptedKey);
  if (contentKey.length !== 32) throw new Error('认证内容密钥长度无效');

  const authTag = encryptedData.subarray(encryptedData.length - 16);
  const ciphertext = encryptedData.subarray(0, encryptedData.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', contentKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(plaintext) as Record<string, unknown>;
  const challenge = parsed.challenge;
  const issuedAt = parsed.issuedAt;

  if (typeof challenge !== 'string') throw new Error('认证挑战无效');
  const challengeRecord = pendingChallenges.get(challenge);
  pendingChallenges.delete(challenge);
  const now = Date.now();
  if (!challengeRecord || challengeRecord.expiresAt <= now) {
    throw new Error('认证挑战已使用或过期');
  }
  if (typeof issuedAt !== 'number' || Math.abs(now - issuedAt) > CHALLENGE_TTL_MS) {
    throw new Error('认证载荷已过期');
  }

  const { challenge: _challenge, issuedAt: _issuedAt, ...payload } = parsed;
  return payload;
};

export const readEncryptedSensitiveBody = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || !('encryptedAuth' in body)) {
    throw new Error('敏感认证信息必须使用加密载荷提交');
  }
  try {
    return decryptSensitivePayload((body as { encryptedAuth: EncryptedSensitivePayload }).encryptedAuth);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误';
    throw new Error(`认证加密载荷无效或已过期：${reason}`);
  }
};
