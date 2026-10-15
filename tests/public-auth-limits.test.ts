import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { test } from 'node:test';

const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = (probe.address() as AddressInfo).port;
    probe.close(() => resolve(port));
  });
});

test('用户状态和加密公钥分别限流，单个端点仍有上限', { timeout: 45_000 }, async () => {
  const port = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), 'kolflow-auth-limits-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      DATA_DIR: dataDir,
      JWT_SECRET: 'kolflow-auth-limits-test-secret',
      INVITE_CODE: 'limits-test-invite',
      CORS_ORIGIN: '*',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let startupOutput = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { startupOutput = (startupOutput + chunk.toString()).slice(-2000); });
  }

  const status = async (path: string) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    await response.arrayBuffer();
    return response.status;
  };

  try {
    let healthy = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      assert.equal(child.exitCode, null, `Server exited: ${startupOutput}`);
      try { healthy = (await status('/api/health')) === 200; } catch { /* Starting. */ }
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert(healthy, `Server did not start: ${startupOutput}`);

    for (let index = 0; index < 60; index += 1) {
      assert.equal(await status('/api/auth/check-users'), 200, `User check ${index + 1}`);
      if (index < 31) {
        assert.equal(await status('/api/auth/encryption-key'), 200, `Key check ${index + 1}`);
      }
    }
    assert.equal(await status('/api/auth/check-users'), 429);
    assert.equal(await status('/api/auth/encryption-key'), 200);
  } finally {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    assert.equal(dirname(dataDir), tmpdir());
    assert(basename(dataDir).startsWith('kolflow-auth-limits-'));
    await rm(dataDir, { recursive: true, force: true });
  }
});
