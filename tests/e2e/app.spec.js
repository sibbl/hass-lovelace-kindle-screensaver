import { test, expect } from "@playwright/test";

/**
 * E2E tests for the hass-lovelace-kindle-screensaver application.
 *
 * These tests require the docker-compose.test.yml services to be running.
 * Run `npm run test:e2e:setup` first.
 *
 * The app should be accessible at http://localhost:15000.
 */

const APP_URL = process.env.APP_URL || "http://localhost:15000";
const HTTP_AUTH_USER = process.env.HTTP_AUTH_USER || "e2e-user";
const HTTP_AUTH_PASSWORD = process.env.HTTP_AUTH_PASSWORD || "e2e-password";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAuthorizationHeader(user = HTTP_AUTH_USER, password = HTTP_AUTH_PASSWORD) {
  const credentials = `${user}:${password}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function withAuth(options = {}) {
  return {
    ...options,
    headers: {
      ...options.headers,
      Authorization: createAuthorizationHeader(),
    },
  };
}

async function waitForAppServer(request) {
  let lastError;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await request.get(`${APP_URL}/favicon.ico`, {
        failOnStatusCode: false,
      });
      if (response.status() === 204) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`App server at ${APP_URL} did not become ready in time`);
}

async function waitForRenderedImage(request) {
  await waitForAppServer(request);

  let response;
  let lastError;
  for (let i = 0; i < 30; i++) {
    try {
      response = await request.get(APP_URL, withAuth({ failOnStatusCode: false }));
      if (response.status() === 200) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(5000);
  }

  if (lastError) {
    throw lastError;
  }

  return response;
}

test.describe("HTTP basic auth", () => {
  test("GET / without auth returns 401", async ({ request }) => {
    await waitForAppServer(request);

    const response = await request.get(APP_URL, {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain("Basic");
  });

  test("GET / with invalid auth returns 401", async ({ request }) => {
    await waitForAppServer(request);

    const response = await request.get(APP_URL, {
      failOnStatusCode: false,
      headers: {
        Authorization: createAuthorizationHeader(HTTP_AUTH_USER, "wrong-password"),
      },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain("Basic");
  });

  test("HEAD / with valid auth returns headers only", async ({ request }) => {
    await waitForRenderedImage(request);

    const response = await request.head(APP_URL, withAuth());
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(response.headers()["etag"]).toBeTruthy();
    expect(response.headers()["last-modified"]).toBeTruthy();
    expect(response.headers()["cache-control"]).toBe("no-cache");
  });
});

test.describe("Image serving", () => {
  test("GET / returns a valid image", async ({ request }) => {
    const response = await waitForRenderedImage(request);

    expect(response).toBeDefined();
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toBe("image/png");

    const body = await response.body();
    expect(body.length).toBeGreaterThan(100);
  });

  test("GET /1 returns the same image as GET /", async ({ request }) => {
    const res1 = await waitForRenderedImage(request);
    const res2 = await request.get(`${APP_URL}/1`, withAuth());

    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    const etag1 = res1.headers()["etag"];
    const etag2 = res2.headers()["etag"];
    expect(etag1).toBe(etag2);
  });

  test("HEAD / returns headers without body", async ({ request }) => {
    await waitForRenderedImage(request);

    const response = await request.head(APP_URL, withAuth());
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(response.headers()["etag"]).toBeTruthy();
    expect(response.headers()["last-modified"]).toBeTruthy();
    expect(response.headers()["cache-control"]).toBe("no-cache");
  });

  test("response includes proper caching headers", async ({ request }) => {
    const response = await waitForRenderedImage(request);
    expect(response.status()).toBe(200);

    const etag = response.headers()["etag"];
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);

    const lastModified = response.headers()["last-modified"];
    expect(lastModified).toBeTruthy();

    expect(response.headers()["cache-control"]).toBe("no-cache");
  });
});

test.describe("Invalid requests", () => {
  test("GET /0 returns 400", async ({ request }) => {
    await waitForRenderedImage(request);

    const response = await request.get(`${APP_URL}/0`, withAuth({ failOnStatusCode: false }));
    expect(response.status()).toBe(400);
  });

  test("GET /99 returns 400", async ({ request }) => {
    await waitForRenderedImage(request);

    const response = await request.get(`${APP_URL}/99`, withAuth({ failOnStatusCode: false }));
    expect(response.status()).toBe(400);
  });

  test("GET /abc returns 400", async ({ request }) => {
    await waitForRenderedImage(request);

    const response = await request.get(`${APP_URL}/abc`, withAuth({ failOnStatusCode: false }));
    expect(response.status()).toBe(400);
  });
});

test.describe("Battery tracking", () => {
  test("accepts battery level parameter", async ({ request }) => {
    await waitForRenderedImage(request);

    const response = await request.get(`${APP_URL}/?batteryLevel=80&isCharging=No`, withAuth());
    expect(response.status()).toBe(200);
  });

  test("accepts charging status", async ({ request }) => {
    await waitForRenderedImage(request);

    const response = await request.get(`${APP_URL}/?batteryLevel=50&isCharging=Yes`, withAuth());
    expect(response.status()).toBe(200);
  });
});

test.describe("Image content", () => {
  test("served image is a valid PNG", async ({ request }) => {
    const response = await waitForRenderedImage(request);
    expect(response.status()).toBe(200);
    const body = await response.body();
    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50); // P
    expect(body[2]).toBe(0x4e); // N
    expect(body[3]).toBe(0x47); // G
  });

  test("subsequent requests return same ETag when unchanged", async ({ request }) => {
    const res1 = await waitForRenderedImage(request);
    const res2 = await request.get(APP_URL, withAuth());
    expect(res1.headers()["etag"]).toBe(res2.headers()["etag"]);
  });
});
