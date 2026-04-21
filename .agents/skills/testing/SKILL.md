---
name: testing
description: Best practices and guidelines for writing unit and end-to-end tests for the project. Use when writing or running unit or e2e tests, or when setting up testing infrastructure.
---

## Unit Tests (Vitest)

### Running

```bash
npm test
```

### Conventions

- Test files: `tests/unit/<module>.test.js`
- Import source: `import { fn } from "../../src/<module>"`
- Use `import` syntax (not `require`)
- Mock env vars via `process.env` with cleanup in `afterEach`
- Server tests use real HTTP servers on ephemeral ports
- Always close servers in `afterEach` to avoid port conflicts

### Writing New Tests

1. Create `tests/unit/<module>.test.js`
2. Import from `../../src/<module>` (no extension)
3. Group with `describe()` blocks
4. Clean up resources (servers, env vars, temp files) in `afterEach`

### Example Pattern

```javascript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { myFunction } from "../../src/myModule";

describe("myFunction", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should do something", () => {
    process.env["MY_VAR"] = "value";
    expect(myFunction()).toBe("expected");
  });
});
```

## E2E Tests (Playwright)

### Prerequisites

- Docker Compose with Home Assistant container
- See `docker-compose.test.yml` and `scripts/setup-ha.js`

### Running E2E Tests

```bash
docker compose -f docker-compose.test.yml up -d
node scripts/setup-ha.js
npx playwright test
```
