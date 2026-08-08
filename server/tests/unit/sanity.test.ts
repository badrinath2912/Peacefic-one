import { hasPermission } from '@peacefic/shared';

describe('permission resolution', () => {
  it('honours the global wildcard', () => {
    expect(hasPermission(['*:*'], 'student:create')).toBe(true);
  });

  it('honours a resource wildcard', () => {
    expect(hasPermission(['student:*'], 'student:create')).toBe(true);
  });

  it('rejects an unrelated grant', () => {
    expect(hasPermission(['faculty:read'], 'student:create')).toBe(false);
  });
});
