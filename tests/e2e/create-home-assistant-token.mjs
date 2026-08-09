const [baseUrl, clientId] = process.argv.slice(2);

if (!baseUrl || !clientId) {
  throw new Error("Usage: create-home-assistant-token.mjs <base-url> <client-id>");
}

const onboardingResponse = await fetch(`${baseUrl}/api/onboarding/users`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Kindle E2E",
    username: "kindle-e2e",
    password: "kindle-e2e-password",
    language: "en",
    client_id: clientId,
  }),
});

if (!onboardingResponse.ok) {
  throw new Error(
    `Home Assistant onboarding failed (${onboardingResponse.status}): ${await onboardingResponse.text()}`,
  );
}

const onboardingResult = await onboardingResponse.json();
if (typeof onboardingResult.auth_code !== "string") {
  throw new Error("Home Assistant onboarding did not return an authorization code");
}

const tokenResponse = await fetch(`${baseUrl}/auth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: onboardingResult.auth_code,
    client_id: clientId,
  }),
});

if (!tokenResponse.ok) {
  throw new Error(
    `Home Assistant token exchange failed (${tokenResponse.status}): ${await tokenResponse.text()}`,
  );
}

const tokenResult = await tokenResponse.json();
if (typeof tokenResult.access_token !== "string") {
  throw new Error("Home Assistant token exchange did not return an access token");
}

const authorizationHeaders = {
  Authorization: `Bearer ${tokenResult.access_token}`,
};
const remainingSteps = [
  { path: "core_config" },
  { path: "analytics" },
  {
    path: "integration",
    body: {
      client_id: clientId,
      redirect_uri: clientId,
    },
  },
];

for (const step of remainingSteps) {
  const response = await fetch(`${baseUrl}/api/onboarding/${step.path}`, {
    method: "POST",
    headers: step.body
      ? { ...authorizationHeaders, "Content-Type": "application/json" }
      : authorizationHeaders,
    body: step.body ? JSON.stringify(step.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      `Home Assistant ${step.path} onboarding failed (${response.status}): ${await response.text()}`,
    );
  }
}

process.stdout.write(tokenResult.access_token);
