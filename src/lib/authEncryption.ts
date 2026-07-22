export const AUTH_ENCRYPTION_ALGORITHM = 'RSA-OAEP-256+A256GCM' as const;

export type AuthEncryptionKeyResponse = {
  keyId: string;
  algorithm: typeof AUTH_ENCRYPTION_ALGORITHM;
  publicKeyPem: string;
  challenge: string;
  expiresAt: string;
};

export type EncryptedSensitivePayload = {
  version: 1;
  keyId: string;
  algorithm: typeof AUTH_ENCRYPTION_ALGORITHM;
  encryptedKey: string;
  iv: string;
  ciphertext: string;
};

type ApiFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export const encryptSensitivePayload = async (
  keyResponse: AuthEncryptionKeyResponse,
  payload: Record<string, unknown>,
): Promise<EncryptedSensitivePayload> => {
  if (keyResponse.algorithm !== AUTH_ENCRYPTION_ALGORITHM || !keyResponse.challenge) {
    throw new Error('服务端不支持当前认证加密协议');
  }

  const { default: forge } = await import('node-forge');
  const publicKey = forge.pki.publicKeyFromPem(keyResponse.publicKeyPem);
  const contentKey = forge.random.getBytesSync(32);
  const iv = forge.random.getBytesSync(12);
  const plaintext = JSON.stringify({
    ...payload,
    challenge: keyResponse.challenge,
    issuedAt: Date.now(),
  });
  const cipher = forge.cipher.createCipher('AES-GCM', contentKey);
  cipher.start({ iv, tagLength: 128 });
  cipher.update(forge.util.createBuffer(plaintext, 'utf8'));
  if (!cipher.finish()) throw new Error('认证信息加密失败');
  const ciphertext = cipher.output.getBytes() + cipher.mode.tag.getBytes();
  const encryptedKey = publicKey.encrypt(contentKey, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });

  return {
    version: 1,
    keyId: keyResponse.keyId,
    algorithm: AUTH_ENCRYPTION_ALGORITHM,
    encryptedKey: forge.util.encode64(encryptedKey),
    iv: forge.util.encode64(iv),
    ciphertext: forge.util.encode64(ciphertext),
  };
};

export const createEncryptedSensitiveBody = async (
  fetcher: ApiFetcher,
  payload: Record<string, unknown>,
): Promise<string> => {
  const keyResponse = await fetcher('/api/auth/encryption-key', {
    headers: { 'Cache-Control': 'no-store' },
  });
  if (!keyResponse.ok) {
    throw new Error('无法获取认证加密密钥，请稍后重试');
  }

  const encryptionKey = await keyResponse.json() as AuthEncryptionKeyResponse;
  const encryptedAuth = await encryptSensitivePayload(encryptionKey, payload);
  return JSON.stringify({ encryptedAuth });
};
