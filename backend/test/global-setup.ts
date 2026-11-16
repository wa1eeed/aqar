import './setup-env';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Applies migrations to the test database once before the e2e suite. */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}
