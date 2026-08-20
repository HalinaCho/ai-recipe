import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

// NFR-03: Gmail refresh tokens and Naver IMAP app passwords must be stored
// encrypted. Both providers' secrets go through here before touching
// mail_connection.encrypted_secret.
//
// Key: 32 random bytes, base64-encoded, in MAIL_CREDENTIAL_ENCRYPTION_KEY.
// Generate one with:  openssl rand -base64 32
//
// Format of the stored string: v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
// The version prefix leaves room to rotate the scheme later without
// ambiguity about how an existing row was encrypted.

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.MAIL_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MAIL_CREDENTIAL_ENCRYPTION_KEY is not set — cannot handle mail credentials",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `MAIL_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (version !== VERSION || !ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("encrypted secret is malformed or uses an unknown version");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
