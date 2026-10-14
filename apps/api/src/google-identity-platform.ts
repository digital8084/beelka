import type { IncomingMessage } from "node:http";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  AuthenticationProviderUnavailableError,
  type Authenticator
} from "./server.js";

type IdTokenVerifier = Pick<Auth, "verifyIdToken">;

const INVALID_IDENTITY_TOKEN_CODES = new Set([
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/user-disabled",
  "auth/user-not-found"
]);

function providerErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function firebaseAppForProject(projectId: string) {
  const appName = `beelka-identity-platform-${projectId}`;
  const existing = getApps().find((app) => app.name === appName);
  if (existing) {
    if (existing.options.projectId && existing.options.projectId !== projectId) {
      throw new Error("Configured Identity Platform project does not match the initialized Firebase app.");
    }
    return existing;
  }

  return initializeApp(
    {
      credential: applicationDefault(),
      projectId
    },
    appName
  );
}

/**
 * Validates client-issued Google Identity Platform/Firebase ID tokens with the
 * maintained Admin SDK. A principal is created only after token and revocation
 * checks pass.
 */
export function createGoogleIdentityPlatformAuthenticator(
  projectId: string,
  verifier?: IdTokenVerifier
): Authenticator {
  if (!projectId || projectId.trim() !== projectId || projectId.length > 128) {
    throw new Error("A valid Google Identity Platform project ID is required.");
  }

  const auth = verifier ?? getAuth(firebaseAppForProject(projectId));

  return async (req: IncomingMessage) => {
    const header = req.headers.authorization;
    if (typeof header !== "string") return null;

    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match?.[1]) return null;

    let decoded: Awaited<ReturnType<IdTokenVerifier["verifyIdToken"]>>;
    try {
      // checkRevoked=true also rejects disabled users and revoked ID tokens.
      decoded = await auth.verifyIdToken(match[1], true);
    } catch (error) {
      if (INVALID_IDENTITY_TOKEN_CODES.has(providerErrorCode(error) ?? "")) return null;
      // Provider/configuration/network failures must not be treated as identity.
      throw new AuthenticationProviderUnavailableError();
    }

    if (
      typeof decoded.uid !== "string" ||
      decoded.uid.length < 1 ||
      decoded.uid.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(decoded.uid)
    ) {
      return null;
    }

    // Include project ID so subjects remain distinct across environments.
    return { subject: `google-identity-platform:${projectId}:${decoded.uid}` };
  };
}
