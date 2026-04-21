#!/usr/bin/env node

/**
 * Home Assistant onboarding script for e2e tests.
 *
 * This script:
 * 1. Waits for HA to be accessible
 * 2. Completes the onboarding flow via the REST API
 * 3. Creates a long-lived access token
 * 4. Writes the token and base URL to .env.test
 */

const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HA_URL = process.env.HA_URL || "http://localhost:18123";
const CLIENT_ID = `${HA_URL}/`;
const ENV_FILE = path.resolve(__dirname, "..", ".env.test");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      ...options,
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString();
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: rawBody,
        });
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function waitForHA() {
  console.log(`Waiting for Home Assistant at ${HA_URL}...`);
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await httpRequest(`${HA_URL}/api/`, { method: "GET" });
      if (res.statusCode === 200 || res.statusCode === 401) {
        console.log("Home Assistant is ready!");
        return;
      }
    } catch {
      // Not ready yet
    }
    await sleep(2000);
    process.stdout.write(".");
  }
  throw new Error("Home Assistant did not become ready in time");
}

async function checkOnboardingNeeded() {
  const res = await httpRequest(`${HA_URL}/api/onboarding`, {
    method: "GET",
  });
  const steps = JSON.parse(res.body);
  return steps.some((step) => step.step === "user" && step.done === false);
}

async function createUser() {
  console.log("Creating onboarding user...");
  const onboardingPassword = crypto.randomBytes(18).toString("base64url");
  const body = JSON.stringify({
    client_id: CLIENT_ID,
    name: "Test User",
    username: "test",
    password: onboardingPassword,
    language: "en",
  });
  const res = await httpRequest(
    `${HA_URL}/api/onboarding/users`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (res.statusCode !== 200) {
    throw new Error(
      `Failed to create user: ${res.statusCode} ${res.body}`
    );
  }
  const data = JSON.parse(res.body);
  console.log("User created, got auth_code");
  return data.auth_code;
}

async function getAccessToken(authCode) {
  console.log("Exchanging auth code for access token...");
  const body = `grant_type=authorization_code&client_id=${encodeURIComponent(CLIENT_ID)}&code=${encodeURIComponent(authCode)}`;
  const res = await httpRequest(
    `${HA_URL}/auth/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (res.statusCode !== 200) {
    throw new Error(
      `Failed to get token: ${res.statusCode} ${res.body}`
    );
  }
  const data = JSON.parse(res.body);
  console.log("Got access token");
  return data.access_token;
}

async function completeCoreConfig(accessToken) {
  console.log("Completing core config...");
  const body = JSON.stringify({});
  const res = await httpRequest(
    `${HA_URL}/api/onboarding/core_config`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );
  if (res.statusCode !== 200) {
    console.warn(`Core config response: ${res.statusCode} (may already be done)`);
  }
}

async function completeAnalytics(accessToken) {
  console.log("Completing analytics...");
  const body = JSON.stringify({});
  const res = await httpRequest(
    `${HA_URL}/api/onboarding/analytics`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );
  if (res.statusCode !== 200) {
    console.warn(`Analytics response: ${res.statusCode} (may already be done)`);
  }
}

async function completeIntegration(accessToken) {
  console.log("Completing integration...");
  const body = JSON.stringify({ client_id: CLIENT_ID, redirect_uri: `${HA_URL}/?auth_callback=1` });
  const res = await httpRequest(
    `${HA_URL}/api/onboarding/integration`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );
  if (res.statusCode !== 200) {
    console.warn(`Integration response: ${res.statusCode} (may already be done)`);
  }
}

async function createLongLivedToken(accessToken) {
  console.log("Creating long-lived access token...");
  const body = JSON.stringify({
    client_name: "E2E Test Client",
    lifespan: 365,
  });
  const res = await httpRequest(
    `${HA_URL}/auth/long_lived_access_token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (res.statusCode === 200) {
    const token = JSON.parse(res.body);
    console.log("Created long-lived access token");
    return token;
  }

  // If long-lived token endpoint not available, just use the short-lived token
  console.warn(
    `Long-lived token endpoint returned ${res.statusCode}, using short-lived token`
  );
  return accessToken;
}

async function main() {
  try {
    await waitForHA();

    const needsOnboarding = await checkOnboardingNeeded();
    let accessToken;

    if (needsOnboarding) {
      const authCode = await createUser();
      accessToken = await getAccessToken(authCode);
      await completeCoreConfig(accessToken);
      await completeAnalytics(accessToken);
      await completeIntegration(accessToken);
    } else {
      console.log("Home Assistant already onboarded");
      // If already onboarded we can't get a new token via onboarding
      // Check if .env.test already has a token
      if (fs.existsSync(ENV_FILE)) {
        const envContent = fs.readFileSync(ENV_FILE, "utf-8");
        if (envContent.includes("HA_ACCESS_TOKEN=")) {
          console.log("Using existing .env.test token");
          return;
        }
      }
      throw new Error(
        "HA already onboarded but no .env.test found. Remove HA volume and retry."
      );
    }

    const longLivedToken = await createLongLivedToken(accessToken);
    const tokenToUse =
      typeof longLivedToken === "string" ? longLivedToken : accessToken;

    // Write .env.test for docker-compose
    const envContent = [
      `HA_BASE_URL=http://homeassistant:8123`,
      `HA_SCREENSHOT_URL=/lovelace/0`,
      `HA_ACCESS_TOKEN=${tokenToUse}`,
    ].join("\n");

    fs.writeFileSync(ENV_FILE, envContent);
    console.log(`Wrote ${ENV_FILE}`);
    console.log("Onboarding complete!");
  } catch (err) {
    console.error("Onboarding failed:", err);
    process.exit(1);
  }
}

main();
