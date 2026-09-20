// @vitest-environment node
/**
 * Unit tests for lib/ai/brain-tools/sanitizer.ts
 *
 * Verifies that sanitizeToolResult strips high-confidence secret/PII patterns
 * from tool result strings before they can reach a model context.
 *
 * These are the same patterns used by executeBrainTool (Brain agent) and,
 * after the N2 security fix, by executePortalTool results in the portal chat
 * routes (app/api/portal/ai/chat/route.ts and stream/route.ts).
 */

import { describe, it, expect } from 'vitest';
import { sanitizeToolResult } from '@/lib/ai/brain-tools/sanitizer';

describe('sanitizeToolResult — API key / token redaction', () => {
  it('redacts an sk- prefixed API key', () => {
    const input = JSON.stringify({ note: 'Use this key', secret: 'sk-ABCDEF1234567890abcdef' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('sk-ABCDEF1234567890abcdef');
    expect(out).toContain('[REDACTED_API_KEY]');
  });

  it('redacts a Bearer token', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc1234';
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc1234');
    expect(out).toContain('Bearer [REDACTED_TOKEN]');
  });

  it('redacts a GitHub PAT (ghp_ prefix)', () => {
    const input = `{"token":"ghp_${'A'.repeat(36)}"}`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('ghp_');
    expect(out).toContain('[REDACTED_GH_TOKEN]');
  });

  it('redacts a Slack bot token (xoxb- prefix)', () => {
    const input = `slack_token=xoxb-123456789012-123456789012-ABCDEFGHIJKLMNOPQRSTUVWX`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('xoxb-');
    expect(out).toContain('[REDACTED_SLACK_TOKEN]');
  });
});

describe('sanitizeToolResult — password redaction', () => {
  it('redacts a JSON "password" field value', () => {
    const input = JSON.stringify({ username: 'alice', password: 'hunter2xyz' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('hunter2xyz');
    expect(out).toContain('"password": "[REDACTED]"');
  });

  it('redacts a key=value password (word-boundary before "password")', () => {
    // The pattern uses \bpassword — must have a word boundary before "password".
    // A bare "password=" key matches; "db_password=" does NOT (no word boundary
    // between "_" and "p" — underscore is a word character).
    const input = `password='supersecret123'`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('supersecret123');
    expect(out).toContain('password=[REDACTED]');
  });
});

describe('sanitizeToolResult — secret key=value redaction', () => {
  it('redacts api_key= quoted values', () => {
    const input = `api_key="abcdef1234567890"`; // pragma: allowlist secret
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('abcdef1234567890');
    expect(out).toContain('api_key=[REDACTED]');
  });

  it('redacts client_secret= quoted values', () => {
    const input = `client_secret='verysecretvalue'`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('verysecretvalue');
    expect(out).toContain('client_secret=[REDACTED]');
  });

  it('redacts access_token= and refresh_token= quoted values', () => {
    const access = sanitizeToolResult(`access_token="access-value-1234"`); // pragma: allowlist secret
    expect(access).not.toContain('access-value-1234');
    expect(access).toContain('access_token=[REDACTED]');
    const refresh = sanitizeToolResult(`refresh_token="refresh-value-1234"`); // pragma: allowlist secret
    expect(refresh).not.toContain('refresh-value-1234');
    expect(refresh).toContain('refresh_token=[REDACTED]');
  });

  it('redacts db_password= quoted values', () => {
    const input = `db_password="dbpass1234"`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('dbpass1234');
    expect(out).toContain('db_password=[REDACTED]');
  });

  it('redacts private_key= quoted values', () => {
    const input = `private_key="pk-value-1234"`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('pk-value-1234');
    expect(out).toContain('private_key=[REDACTED]');
  });
});

describe('sanitizeToolResult — secret JSON keys', () => {
  it('redacts a JSON "apiKey" field', () => {
    const input = JSON.stringify({ apiKey: 'abcdefgh1234' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('abcdefgh1234');
    expect(out).toContain('"apiKey": "[REDACTED]"');
  });

  it('redacts a JSON "api_key" field', () => {
    const input = JSON.stringify({ api_key: 'abcdefgh1234' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('abcdefgh1234');
    expect(out).toContain('"api_key": "[REDACTED]"');
  });

  it('redacts a JSON "token" field', () => {
    const input = JSON.stringify({ token: 'abcdefgh1234' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('abcdefgh1234');
    expect(out).toContain('"token": "[REDACTED]"');
  });

  it('redacts a JSON "secret" field', () => {
    const input = JSON.stringify({ secret: 'abcdefgh1234' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('abcdefgh1234');
    expect(out).toContain('"secret": "[REDACTED]"');
  });

  it('does not double-redact an already-redacted JSON value', () => {
    const input = JSON.stringify({ token: 'ghp_' + 'A'.repeat(36) });
    const out = sanitizeToolResult(input);
    // The GitHub PAT pattern wins; the generic JSON key pattern must leave it alone.
    expect(out).toContain('[REDACTED_GH_TOKEN]');
  });
});

describe('sanitizeToolResult — cloud credentials and JWTs', () => {
  it('redacts an AWS access key ID', () => {
    const input = 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE'; // pragma: allowlist secret
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE'); // pragma: allowlist secret
    expect(out).toContain('[REDACTED_AWS_KEY]');
  });

  it('redacts a Google API key', () => {
    const key = 'AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY'; // pragma: allowlist secret
    const out = sanitizeToolResult(`key: ${key}`);
    expect(out).not.toContain(key);
    expect(out).toContain('[REDACTED_GOOGLE_KEY]');
  });

  it('redacts a JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = sanitizeToolResult(`token=${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('[REDACTED_JWT]');
  });

  it('redacts a full PEM private key block to the END marker', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'; // pragma: allowlist secret
    const out = sanitizeToolResult(pem);
    expect(out).not.toContain('MIIEowIBAAKCAQEA');
    expect(out).not.toContain('END RSA PRIVATE KEY');
    expect(out).toContain('[REDACTED_PRIVATE_KEY]');
  });

  it('redacts a lone PEM BEGIN line when there is no END marker', () => {
    const out = sanitizeToolResult('-----BEGIN PRIVATE KEY-----'); // pragma: allowlist secret
    expect(out).toContain('[REDACTED_PRIVATE_KEY]');
  });
});

describe('sanitizeToolResult — PII redaction', () => {
  it('redacts a US Social Security Number', () => {
    const input = 'SSN: 123-45-6789';
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('123-45-6789');
    expect(out).toContain('[REDACTED_SSN]');
  });

  it('redacts a Visa credit card number', () => {
    const input = 'card: 4111111111111111 exp 12/28';
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('4111111111111111');
    expect(out).toContain('[REDACTED_CC]');
  });
});

describe('sanitizeToolResult — benign content unchanged', () => {
  it('returns normal CRM / notes content unmodified', () => {
    const input = JSON.stringify({
      contact: 'Jane Doe',
      company: 'Acme Corp',
      notes: 'Met at conference. Interested in Q3 deal.',
    });
    const out = sanitizeToolResult(input);
    expect(out).toBe(input);
  });

  it('returns an empty string unchanged', () => {
    expect(sanitizeToolResult('')).toBe('');
  });
});
