import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom keeps the document between tests, so a leaked component from one test
// would be found by the next one's queries.
afterEach(() => {
  cleanup();
});
