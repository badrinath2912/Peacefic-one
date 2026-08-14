import { isPrivateNetworkOrigin } from '@/app';

/**
 * The dev-only CORS escape hatch.
 *
 * It exists so the app can be opened from a phone or a second machine without
 * re-listing a LAN address that DHCP keeps changing. It is only ever consulted
 * outside production, but it still has to be exact: a predicate that accidentally
 * matched a public address would turn the allowlist into a formality.
 */
describe('isPrivateNetworkOrigin', () => {
  it('accepts loopback', () => {
    expect(isPrivateNetworkOrigin('http://localhost:3000')).toBe(true);
    expect(isPrivateNetworkOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('accepts the three RFC 1918 ranges on any port', () => {
    expect(isPrivateNetworkOrigin('http://192.168.1.15:3000')).toBe(true);
    expect(isPrivateNetworkOrigin('http://10.0.0.5:8080')).toBe(true);
    expect(isPrivateNetworkOrigin('http://172.16.4.1')).toBe(true);
    expect(isPrivateNetworkOrigin('http://172.31.255.254:3000')).toBe(true);
  });

  /** 172.16/12 stops at 172.31 — 172.32 onwards is public address space. */
  it('rejects the public neighbours of the 172.16/12 block', () => {
    expect(isPrivateNetworkOrigin('http://172.15.0.1:3000')).toBe(false);
    expect(isPrivateNetworkOrigin('http://172.32.0.1:3000')).toBe(false);
  });

  it('rejects public addresses and hostnames', () => {
    expect(isPrivateNetworkOrigin('https://evil.example.com')).toBe(false);
    expect(isPrivateNetworkOrigin('http://8.8.8.8')).toBe(false);
    expect(isPrivateNetworkOrigin('http://192.168.1.15.evil.com')).toBe(false);
  });

  /** A hostname that merely starts with a private prefix is not an address. */
  it('rejects near-miss hostnames', () => {
    expect(isPrivateNetworkOrigin('http://10.0.0.5.example.com')).toBe(false);
    expect(isPrivateNetworkOrigin('http://192.168.1.15.evil.com')).toBe(false);
    // Out-of-range octets are not a valid host at all, so `new URL` throws and
    // the caught failure becomes a rejection.
    expect(isPrivateNetworkOrigin('http://999.999.999.999')).toBe(false);
  });

  /**
   * `new URL` applies WHATWG IPv4 normalisation before we ever see the host, so
   * shorthand forms arrive already expanded — `192.168.1` becomes `192.168.0.1`,
   * which really is a private address. Accepting it is correct, and pinned here
   * so the normalisation is not mistaken for a hole later.
   */
  it('accepts shorthand IPv4 that normalises into a private range', () => {
    expect(isPrivateNetworkOrigin('http://192.168.1')).toBe(true);
  });

  it('rejects non-http schemes and unparseable input', () => {
    expect(isPrivateNetworkOrigin('file://192.168.1.15')).toBe(false);
    expect(isPrivateNetworkOrigin('ftp://10.0.0.1')).toBe(false);
    expect(isPrivateNetworkOrigin('not a url')).toBe(false);
    expect(isPrivateNetworkOrigin('')).toBe(false);
  });
});
