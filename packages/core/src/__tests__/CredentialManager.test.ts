import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CredentialManager } from '../CredentialManager.js';

const ENV_KEYS = [
  'LOGIN_URL',
  'LOGIN_USERNAME',
  'LOGIN_PASSWORD',
  'LOGIN_USERNAME_SELECTOR',
  'LOGIN_PASSWORD_SELECTOR',
  'LOGIN_SUBMIT_SELECTOR',
] as const;

describe('CredentialManager', () => {
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear all credential env vars
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('returns null when no credentials are configured', () => {
    const manager = new CredentialManager();
    expect(manager.getCredentials()).toBeNull();
  });

  it('returns null when only some credentials are configured', () => {
    process.env['LOGIN_URL'] = 'http://localhost/login';
    process.env['LOGIN_USERNAME'] = 'user';
    // Missing others
    const manager = new CredentialManager();
    expect(manager.getCredentials()).toBeNull();
  });

  it('returns credentials when all env vars are set', () => {
    process.env['LOGIN_URL'] = 'http://localhost/login';
    process.env['LOGIN_USERNAME'] = 'testuser';
    process.env['LOGIN_PASSWORD'] = 'testpass';
    process.env['LOGIN_USERNAME_SELECTOR'] = '#username';
    process.env['LOGIN_PASSWORD_SELECTOR'] = '#password';
    process.env['LOGIN_SUBMIT_SELECTOR'] = '#submit';

    const manager = new CredentialManager();
    const creds = manager.getCredentials();

    expect(creds).not.toBeNull();
    expect(creds!.loginUrl).toBe('http://localhost/login');
    expect(creds!.username).toBe('testuser');
    expect(creds!.password).toBe('testpass');
    expect(creds!.usernameSelector).toBe('#username');
    expect(creds!.passwordSelector).toBe('#password');
    expect(creds!.submitSelector).toBe('#submit');
  });
});
