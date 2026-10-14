import assert from "node:assert/strict";
import type { IncomingMessage, Server } from "node:http";
import test from "node:test";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import { createGoogleIdentityPlatformAuthenticator } from "../../apps/api/src/google-identity-platform.js";
import {
  AuthenticationProviderUnavailableError,
  createAppServer
} from "../../apps/api/src/server.js";

type Verifier = Pick<Auth, "verifyIdToken">;

function request(authorization?: string): IncomingMessage {
  return {
    headers: authorization === undefined ? {} : { authorization }
  } as unknown as IncomingMessage;
}

function decoded(uid: string): DecodedIdToken {
  return { uid } as unknown as DecodedIdToken;
}

function errorWithCode(code: string): Error & { code: string } {
  return Object.assign(new Error("provider test error"), { code });
}

test("Identity Platform authenticator returns null without a single bearer token", async () => {
  let calls = 0;
  const verifier = {
    verifyIdToken: async () => {
      calls += 1;
      return decoded("uid-1");
    }
  } as unknown as Verifier;
  const authenticate = createGoogleIdentityPlatformAuthenticator("beelka-test-project", verifier);

  assert.equal(await authenticate(request()), null);
  assert.equal(await authenticate(request("Basic abc")), null);
  assert.equal(await authenticate(request("Bearer token with spaces")), null);
  assert.equal(calls, 0);
});

test("Identity Platform authenticator verifies the token with revocation checking", async () => {
  let receivedToken = "";
  let receivedCheckRevoked: boolean | undefined;
  const verifier = {
    verifyIdToken: async (token: string, checkRevoked?: boolean) => {
      receivedToken = token;
      receivedCheckRevoked = checkRevoked;
      return decoded("uid-1");
    }
  } as unknown as Verifier;
  const authenticate = createGoogleIdentityPlatformAuthenticator("beelka-test-project", verifier);

  assert.deepEqual(await authenticate(request("Bearer firebase.id.token")), {
    subject: "google-identity-platform:beelka-test-project:uid-1"
  });
  assert.equal(receivedToken, "firebase.id.token");
  assert.equal(receivedCheckRevoked, true);
});

test("invalid, expired, revoked, or disabled-user tokens are unauthenticated", async () => {
  for (const code of [
    "auth/argument-error",
    "auth/invalid-argument",
    "auth/invalid-id-token",
    "auth/id-token-expired",
    "auth/id-token-revoked",
    "auth/user-disabled",
    "auth/user-not-found"
  ]) {
    const verifier = {
      verifyIdToken: async () => { throw errorWithCode(code); }
    } as unknown as Verifier;
    const authenticate = createGoogleIdentityPlatformAuthenticator("beelka-test-project", verifier);
    assert.equal(await authenticate(request("Bearer invalid-token")), null, code);
  }
});

test("provider failures fail closed as operational errors instead of being accepted", async () => {
  const verifier = {
    verifyIdToken: async () => { throw errorWithCode("auth/internal-error"); }
  } as unknown as Verifier;
  const authenticate = createGoogleIdentityPlatformAuthenticator("beelka-test-project", verifier);

  await assert.rejects(
    authenticate(request("Bearer maybe-valid-token")),
    (error: unknown) => error instanceof AuthenticationProviderUnavailableError
  );
});

test("invalid project ID configuration is rejected", () => {
  assert.throws(() => createGoogleIdentityPlatformAuthenticator(" "), /project ID is required/i);
});

test("Google provider outages return 503 on protected customer routes", async () => {
  const server: Server = createAppServer({
    database: { query: async () => undefined },
    mockOrderStore: {} as never,
    demoOrdersEnabled: true,
    authenticate: async () => { throw new AuthenticationProviderUnavailableError(); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Could not resolve test server address");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "AUTHENTICATION_PROVIDER_UNAVAILABLE");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
