"use client"

import { MlKem768 } from "mlkem"

/**
 * QuantumVault client-side crypto (v2)
 * ────────────────────────────────────────────────────────────────────────────
 * Key hierarchy
 *
 *   User  : ML-KEM-768 key pair (pk, sk)
 *   File  : DEK  = 32 random bytes            (unique per file)
 *           (ct, ss) = ML-KEM-768.Encaps(pk)  (unique per envelope)
 *           KEK  = HKDF-SHA256(ss, salt = ct, info = "QV-v2-kek:" + fileId)
 *           wrappedDEK = AES-KW(KEK, DEK)     (40 bytes)
 *           blob = AES-256-GCM(DEK, data, AAD)
 *   Meta  : AES-256-GCM(HKDF(DEK, "QV-v2-meta:" + fileId + ":" + ownerId))
 *
 * Why a random DEK: the KEM only protects the *key*, not the data. Because the
 * DEK is a normal key we can wrap it again for other recipients (sharing)
 * without re-encrypting the file. Metadata is bound to the DEK, so a share
 * recipient can read the file name too.
 *
 * Blob layout (v2):
 *   version(1) ‖ flags(1) ‖ kemCT(1088) ‖ wrappedDEK(40) ‖ iv(12) ‖ ct+tag
 *
 * The envelope inside the blob is the *owner's* copy. A share recipient gets
 * their own `WrappedKey` out-of-band (DynamoDB) and passes it to `decryptFile`.
 *
 * NOTE: v1 blobs (key derived straight from the KEM secret) are not readable by
 * this module. Re-upload old demo files, or keep the previous file as
 * `crypto.v1.ts` if you need to open them.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Blob format version: ML-KEM-768 + HKDF-SHA256 + AES-256-GCM (random DEK). */
export const VERSION = 0x02

/** Flags byte: bit 0 = gzip-compressed plaintext. */
export const FLAG_GZIP = 0b00000001

/** ML-KEM-768 ciphertext length (bytes). */
export const KEM_CT_LEN = 1088

/** ML-KEM-768 public key length (bytes). */
export const PUBKEY_LEN = 1184

/** AES-KW wrapping of a 32-byte DEK is always 40 bytes. */
export const WRAPPED_DEK_LEN = 40

/** Data encryption key length (bytes). */
export const DEK_LEN = 32

/** AES-GCM IV length (bytes). */
export const IV_LEN = 12

/** AES-GCM authentication tag length (bytes). */
export const TAG_LEN = 16

/** Fixed header: version(1) + flags(1) + kemCT(1088) + wrappedDEK(40) + iv(12). */
export const HEADER_LEN = 1 + 1 + KEM_CT_LEN + WRAPPED_DEK_LEN + IV_LEN // 1142

/** Maximum file size for in-memory encryption/decryption (200 MB). */
export const MAX_FILE_SIZE = 200 * 1024 * 1024

/**
 * PBKDF2-HMAC-SHA256 work factor. OWASP recommends >= 600,000 iterations.
 * If this feels slow on low-end devices, switch to Argon2id (WASM) instead of
 * lowering it — the password is the root of the whole key hierarchy.
 */
const PBKDF2_ITERATIONS = 600_000

/** HKDF context labels (domain separation). */
const HKDF_KEK_PREFIX = "QV-v2-kek:"
const HKDF_META_PREFIX = "QV-v2-meta:"

/** File extensions that are already compressed — skip gzip for these. */
const COMPRESSED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif",
  "mp3", "mp4", "mkv",
  "zip", "7z", "rar", "gz",
  "pdf", "docx", "xlsx", "pptx",
])

/** UUID v4 pattern (lowercase hex). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Types ───────────────────────────────────────────────────────────────────

/** A DEK wrapped for one recipient. `kemCT` is that recipient's KEM ciphertext. */
export interface WrappedKey {
  kemCT: Uint8Array
  wrappedDEK: Uint8Array
}

export interface EncryptFileResult {
  /** `version ‖ flags ‖ kemCT ‖ wrappedDEK ‖ iv ‖ ciphertext+tag`. */
  blob: Uint8Array
  /** Owner's key envelope (also embedded in the blob header). */
  wrappedKey: WrappedKey
  /** Raw data-encryption key. Call `zeroFill(dek)` as soon as you're done. */
  dek: Uint8Array
  compressed: boolean
  originalSize: number
}

export interface DecryptFileResult {
  plaintext: Uint8Array
  /** Raw DEK, so the caller can decrypt the matching metadata. Zero it after. */
  dek: Uint8Array
}

export interface FileMetadata {
  fileName: string
  mimeType: string
  originalSize: number
  compressed: boolean
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Best-effort zeroing of a Uint8Array (the JIT may still keep a copy). */
export function zeroFill(buf: Uint8Array): void {
  buf.fill(0)
}

/** Validate that a string is a well-formed UUID. */
function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} is not a valid UUID`)
  }
}

/** Extract the file extension (lowercase, no dot) from a filename. */
function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase()
}

/** Read a stream to completion. */
async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.length
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Gzip-compress data. The reader is drained concurrently with the write so a
 * large chunk cannot deadlock on backpressure; both writes are awaited so no
 * promise is left floating.
 */
async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip")
  const writer = cs.writable.getWriter()
  const reader = cs.readable.getReader()

  const resultPromise = readAll(reader)
  try {
    await writer.write(data)
    await writer.close()
  } catch (err) {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
    throw err
  }
  return resultPromise
}

/**
 * Gzip-decompress data, aborting if the output exceeds `maxSize`
 * (decompression-bomb guard).
 */
async function gzipDecompress(data: Uint8Array, maxSize: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip")
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()

  const chunks: Uint8Array[] = []
  let total = 0
  let tooLarge = false

  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.length
      if (total > maxSize) {
        tooLarge = true
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
        break
      }
      chunks.push(value)
    }
  })()

  let writeError: unknown = null
  try {
    await writer.write(data)
    await writer.close()
  } catch (err) {
    writeError = err
  }
  await readPromise

  if (tooLarge || writeError) {
    throw new Error("Decryption failed")
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * AAD for file encryption:
 *   version(1) ‖ flags(1) ‖ UTF-8(fileId) ‖ UTF-8(ownerId)
 */
function buildAAD(version: number, flags: number, fileId: string, ownerId: string): Uint8Array {
  const fileIdBytes = encoder.encode(fileId)
  const ownerIdBytes = encoder.encode(ownerId)
  const aad = new Uint8Array(2 + fileIdBytes.length + ownerIdBytes.length)
  aad[0] = version
  aad[1] = flags
  aad.set(fileIdBytes, 2)
  aad.set(ownerIdBytes, 2 + fileIdBytes.length)
  return aad
}

/** Import a raw DEK as an extractable AES-256-GCM key (extractable so it can be wrapped). */
function importDekKey(dek: Uint8Array): Promise<CryptoKey> {
  if (dek.length !== DEK_LEN) {
    throw new Error(`DEK must be ${DEK_LEN} bytes, got ${dek.length}`)
  }
  return crypto.subtle.importKey("raw", dek, { name: "AES-GCM" }, true, ["encrypt", "decrypt"])
}

/**
 * Derive the key-encryption key (KEK) that wraps a DEK:
 *   KEK = HKDF-SHA256(ss, salt = kemCT, info = "QV-v2-kek:" + fileId)
 */
async function deriveKek(ss: Uint8Array, kemCT: Uint8Array, fileId: string): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey("raw", ss, "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: kemCT,
      info: encoder.encode(HKDF_KEK_PREFIX + fileId),
    },
    hkdfKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  )
}

/** Derive the per-file metadata key from the DEK. */
async function deriveMetadataKey(dek: Uint8Array, fileId: string, ownerId: string): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey("raw", dek, "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encoder.encode(HKDF_META_PREFIX + fileId + ":" + ownerId),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

/** PBKDF2-HMAC-SHA256 with a domain-separated salt label. */
async function pbkdf2(password: string, saltLabel: string, bits: number): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  )
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(saltLabel),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    bits,
  )
  return new Uint8Array(derived)
}

function assertWrappedKey(wrappedKey: WrappedKey): void {
  if (wrappedKey.kemCT.length !== KEM_CT_LEN) {
    throw new Error(`kemCT must be ${KEM_CT_LEN} bytes, got ${wrappedKey.kemCT.length}`)
  }
  if (wrappedKey.wrappedDEK.length !== WRAPPED_DEK_LEN) {
    throw new Error(`wrappedDEK must be ${WRAPPED_DEK_LEN} bytes, got ${wrappedKey.wrappedDEK.length}`)
  }
}

// ─── Key wrapping (sharing primitive) ────────────────────────────────────────

/**
 * Encapsulate a fresh ML-KEM secret to `recipientPublicKey` and wrap `dek`
 * with it. Use this to grant a recipient access to an existing file without
 * re-encrypting the data. Store the result in the `FileKeys` table.
 */
export async function wrapDekForRecipient(
  dek: Uint8Array,
  recipientPublicKey: Uint8Array,
  fileId: string,
): Promise<WrappedKey> {
  if (dek.length !== DEK_LEN) {
    throw new Error(`DEK must be ${DEK_LEN} bytes, got ${dek.length}`)
  }
  if (recipientPublicKey.length !== PUBKEY_LEN) {
    throw new Error(`Public key must be ${PUBKEY_LEN} bytes, got ${recipientPublicKey.length}`)
  }
  assertUUID(fileId, "fileId")

  const kem = new MlKem768()
  const [kemCT, ss] = await kem.encap(recipientPublicKey)
  try {
    const kek = await deriveKek(ss, kemCT, fileId)
    const dekKey = await importDekKey(dek)
    const wrappedDEK = new Uint8Array(await crypto.subtle.wrapKey("raw", dekKey, kek, "AES-KW"))
    return { kemCT, wrappedDEK }
  } finally {
    zeroFill(ss)
  }
}

/**
 * Recover a DEK from a `WrappedKey` using the recipient's private key.
 * Mostly used internally and by tests; `decryptFile` accepts a `WrappedKey`
 * directly.
 */
export async function unwrapDek(
  privateKey: Uint8Array,
  wrappedKey: WrappedKey,
  fileId: string,
): Promise<Uint8Array> {
  assertWrappedKey(wrappedKey)
  assertUUID(fileId, "fileId")

  const kem = new MlKem768()
  const ss = await kem.decap(wrappedKey.kemCT, privateKey)
  try {
    const kek = await deriveKek(ss, wrappedKey.kemCT, fileId)
    const dekKey = await crypto.subtle.unwrapKey(
      "raw",
      wrappedKey.wrappedDEK,
      kek,
      "AES-KW",
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    )
    return new Uint8Array(await crypto.subtle.exportKey("raw", dekKey))
  } finally {
    zeroFill(ss)
  }
}

// ─── File encryption ─────────────────────────────────────────────────────────

/**
 * Encrypt a file with a random DEK, then wrap that DEK with ML-KEM-768.
 *
 * The returned `dek` is raw key material — pass it to `encryptMetadata`, then
 * `zeroFill(dek)`. The returned `wrappedKey` is the owner's envelope; keep it
 * if you want to support sharing later.
 */
export async function encryptFile(
  plaintext: ArrayBuffer,
  fileName: string,
  publicKey: Uint8Array,
  fileId: string,
  ownerId: string,
): Promise<EncryptFileResult> {
  const originalSize = plaintext.byteLength
  if (originalSize > MAX_FILE_SIZE) {
    throw new Error(`File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB limit`)
  }
  if (publicKey.length !== PUBKEY_LEN) {
    throw new Error(`Public key must be ${PUBKEY_LEN} bytes, got ${publicKey.length}`)
  }
  assertUUID(fileId, "fileId")
  assertUUID(ownerId, "ownerId")

  // ── Compression decision ──
  let data: Uint8Array = new Uint8Array(plaintext)
  let flags = 0x00

  const ext = fileExtension(fileName)
  if (!COMPRESSED_EXTENSIONS.has(ext) && originalSize > 0) {
    try {
      const compressed = await gzipCompress(data)
      if (compressed.length < data.length) {
        data = compressed
        flags |= FLAG_GZIP
      }
    } catch {
      // CompressionStream unavailable/failed — proceed uncompressed.
    }
  }

  // ── Fresh DEK per file ──
  const dek = crypto.getRandomValues(new Uint8Array(DEK_LEN))

  try {
    // ── Wrap the DEK for the owner ──
    const wrappedKey = await wrapDekForRecipient(dek, publicKey, fileId)

    // ── Encrypt the data with the DEK ──
    const dekKey = await importDekKey(dek)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
    const aad = buildAAD(VERSION, flags, fileId, ownerId)

    const ciphertextBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_LEN * 8 },
      dekKey,
      data,
    )
    const ciphertext = new Uint8Array(ciphertextBuf)

    // ── Assemble blob ──
    const blob = new Uint8Array(HEADER_LEN + ciphertext.length)
    blob[0] = VERSION
    blob[1] = flags
    blob.set(wrappedKey.kemCT, 2)
    blob.set(wrappedKey.wrappedDEK, 2 + KEM_CT_LEN)
    blob.set(iv, 2 + KEM_CT_LEN + WRAPPED_DEK_LEN)
    blob.set(ciphertext, HEADER_LEN)

    return { blob, wrappedKey, dek, compressed: (flags & FLAG_GZIP) !== 0, originalSize }
  } catch (err) {
    zeroFill(dek)
    throw err
  }
}

// ─── File decryption ─────────────────────────────────────────────────────────

/**
 * Decrypt a blob produced by `encryptFile`.
 *
 * @param shareKey Optional envelope issued to a *different* recipient. When
 *   omitted, the owner's envelope embedded in the blob header is used.
 *
 * Throws one generic "Decryption failed" on any failure after header parsing.
 * The returned `dek` lets you decrypt the file's metadata — zero it after use.
 */
export async function decryptFile(
  blob: Uint8Array,
  privateKey: Uint8Array,
  fileId: string,
  ownerId: string,
  shareKey?: WrappedKey,
): Promise<DecryptFileResult> {
  // ── Pre-crypto validation ──
  if (blob.length < HEADER_LEN + TAG_LEN) {
    throw new Error("Decryption failed")
  }
  const version = blob[0]
  if (version !== VERSION) {
    throw new Error("Decryption failed")
  }
  const flags = blob[1]
  if ((flags & ~FLAG_GZIP) !== 0) {
    throw new Error("Decryption failed")
  }

  // ── Parse fixed-offset fields ──
  const blobKemCT = blob.slice(2, 2 + KEM_CT_LEN)
  const blobWrappedDEK = blob.slice(2 + KEM_CT_LEN, 2 + KEM_CT_LEN + WRAPPED_DEK_LEN)
  const iv = blob.slice(HEADER_LEN - IV_LEN, HEADER_LEN)
  const ciphertext = blob.slice(HEADER_LEN)

  const envelope: WrappedKey = shareKey ?? { kemCT: blobKemCT, wrappedDEK: blobWrappedDEK }

  let dek: Uint8Array | undefined
  let ss: Uint8Array | undefined
  try {
    assertWrappedKey(envelope)

    // ── Unwrap the DEK ──
    const kem = new MlKem768()
    ss = await kem.decap(envelope.kemCT, privateKey)
    const kek = await deriveKek(ss, envelope.kemCT, fileId)
    const dekKey = await crypto.subtle.unwrapKey(
      "raw",
      envelope.wrappedDEK,
      kek,
      "AES-KW",
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    )

    // ── Decrypt the data ──
    const aad = buildAAD(version, flags, fileId, ownerId)
    const plaintextBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_LEN * 8 },
      dekKey,
      ciphertext,
    )
    let plaintext: Uint8Array = new Uint8Array(plaintextBuf)

    if ((flags & FLAG_GZIP) !== 0) {
      plaintext = await gzipDecompress(plaintext, MAX_FILE_SIZE)
    }

    dek = new Uint8Array(await crypto.subtle.exportKey("raw", dekKey))
    return { plaintext, dek }
  } catch {
    if (dek) zeroFill(dek)
    throw new Error("Decryption failed")
  } finally {
    if (ss) zeroFill(ss)
  }
}

// ─── Metadata encryption ─────────────────────────────────────────────────────

/**
 * Encrypt file metadata under a key derived from the file's DEK.
 * Returns base64 of `iv(12) ‖ ciphertext+tag`.
 */
export async function encryptMetadata(
  metadata: FileMetadata,
  dek: Uint8Array,
  fileId: string,
  ownerId: string,
): Promise<string> {
  const key = await deriveMetadataKey(dek, fileId, ownerId)
  const plaintext = encoder.encode(JSON.stringify(metadata))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const aad = encoder.encode(HKDF_META_PREFIX + fileId + ":" + ownerId)

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_LEN * 8 },
    key,
    plaintext,
  )
  const ciphertext = new Uint8Array(ciphertextBuf)

  const combined = new Uint8Array(IV_LEN + ciphertext.length)
  combined.set(iv, 0)
  combined.set(ciphertext, IV_LEN)
  return uint8ToBase64(combined)
}

/** Decrypt metadata produced by `encryptMetadata` using the file's DEK. */
export async function decryptMetadata(
  encryptedBase64: string,
  dek: Uint8Array,
  fileId: string,
  ownerId: string,
): Promise<FileMetadata> {
  const combined = base64ToUint8(encryptedBase64)
  if (combined.length < IV_LEN + TAG_LEN) {
    throw new Error("Decryption failed")
  }

  const key = await deriveMetadataKey(dek, fileId, ownerId)
  const iv = combined.slice(0, IV_LEN)
  const ciphertext = combined.slice(IV_LEN)
  const aad = encoder.encode(HKDF_META_PREFIX + fileId + ":" + ownerId)

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_LEN * 8 },
    key,
    ciphertext,
  )
  return JSON.parse(decoder.decode(plaintextBuf)) as FileMetadata
}

// ─── Password-based key derivation ───────────────────────────────────────────

/** Derive the 64-byte seed used for deterministic ML-KEM key generation. */
export async function deriveKyberSeed(password: string, salt: string): Promise<Uint8Array> {
  return pbkdf2(password, "kyber-seed:" + salt, 512)
}

/** Deterministically derive an ML-KEM-768 key pair from a 64-byte seed. */
export async function deriveKyberKeyPair(seed: Uint8Array): Promise<{
  publicKey: Uint8Array
  privateKey: Uint8Array
}> {
  if (seed.length !== 64) {
    throw new Error(`Kyber seed must be 64 bytes, got ${seed.length}`)
  }
  const kem = new MlKem768()
  const [publicKey, privateKey] = await kem.deriveKeyPair(seed)
  return { publicKey, privateKey }
}

/**
 * Derive the 32-byte "auth hash" sent to the server instead of the password.
 * The server must still hash this with Argon2id before storing it.
 */
export async function deriveAuthHash(password: string, salt: string): Promise<string> {
  const bytes = await pbkdf2(password, "auth-hash:" + salt, 256)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Derive a 256-bit AES-GCM "vault key" from the password.
 * Kept for account-level features; file metadata is now bound to the DEK.
 */
export async function deriveVaultKey(password: string, salt: string): Promise<CryptoKey> {
  const raw = await pbkdf2(password, "vault-meta-key:" + salt, 256)
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

// ─── Optional: random key pair + password-wrapped secret key ─────────────────
// The current login flow derives the key pair deterministically from the
// password, which means changing the password re-keys every file. Use these
// helpers when you migrate to "generate once, store sk wrapped under password":
// a password change then only re-wraps `sk`, and files stay readable.

/** Generate a fresh, non-deterministic ML-KEM-768 key pair. */
export async function generateUserKeyPair(): Promise<{
  publicKey: Uint8Array
  privateKey: Uint8Array
}> {
  const kem = new MlKem768()
  const [publicKey, privateKey] = await kem.generateKeyPair()
  return { publicKey, privateKey }
}

/** Encrypt an ML-KEM private key under a password. Output: base64(iv ‖ ct+tag). */
export async function wrapPrivateKey(
  privateKey: Uint8Array,
  password: string,
  salt: string,
): Promise<string> {
  const raw = await pbkdf2(password, "sk-wrap:" + salt, 256)
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"])
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const aad = encoder.encode("QV-v2-sk-wrap:" + salt)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_LEN * 8 }, key, privateKey),
  )
  const combined = new Uint8Array(IV_LEN + ciphertext.length)
  combined.set(iv, 0)
  combined.set(ciphertext, IV_LEN)
  return uint8ToBase64(combined)
}

/** Decrypt a private key produced by `wrapPrivateKey`. */
export async function unwrapPrivateKey(
  wrappedBase64: string,
  password: string,
  salt: string,
): Promise<Uint8Array> {
  const combined = base64ToUint8(wrappedBase64)
  if (combined.length < IV_LEN + TAG_LEN) {
    throw new Error("Invalid wrapped key")
  }
  const raw = await pbkdf2(password, "sk-wrap:" + salt, 256)
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"])
  const iv = combined.slice(0, IV_LEN)
  const ciphertext = combined.slice(IV_LEN)
  const aad = encoder.encode("QV-v2-sk-wrap:" + salt)
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_LEN * 8 },
    key,
    ciphertext,
  )
  return new Uint8Array(plaintext)
}

// ─── Identity helper ─────────────────────────────────────────────────────────

function fmix32(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Deterministically derive a UUID-shaped identifier from a string.
 *
 * This is an *identifier*, not a secret: it uses a fast 128-bit non-crypto
 * hash (Murmur3 finalisation). For production, prefer a server-assigned,
 * immutable `ownerId` — deriving it from the email means changing the email
 * changes every file's AAD binding.
 */
export function deriveDeterministicUUID(input: string): string {
  let h0 = 0x811c9dc5
  let h1 = 0x9e3779b9
  let h2 = 0x85ebca6b
  let h3 = 0xc2b2ae35
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h0 = Math.imul(h0 ^ c, 0x01000193)
    h1 = Math.imul(h1 ^ (c + 0x9e37), 0x85ebca6b)
    h2 = Math.imul(h2 ^ (c + 0x7f4a), 0xc2b2ae35)
    h3 = Math.imul(h3 ^ (c + 0x165667b1), 0x27d4eb2f)
  }
  h0 = fmix32(h0 ^ input.length)
  h1 = fmix32(h1 ^ (input.length << 7))
  h2 = fmix32(h2 ^ (input.length << 13))
  h3 = fmix32(h3 ^ (input.length << 19))

  const bytes = new Uint8Array(16)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, h0, false)
  view.setUint32(4, h1, false)
  view.setUint32(8, h2, false)
  view.setUint32(12, h3, false)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// ─── Serialization helpers ───────────────────────────────────────────────────

/** Pack a `WrappedKey` into a base64 string for DynamoDB. */
export function serializeWrappedKey(wrappedKey: WrappedKey): string {
  assertWrappedKey(wrappedKey)
  const out = new Uint8Array(KEM_CT_LEN + WRAPPED_DEK_LEN)
  out.set(wrappedKey.kemCT, 0)
  out.set(wrappedKey.wrappedDEK, KEM_CT_LEN)
  return uint8ToBase64(out)
}

/** Inverse of `serializeWrappedKey`. */
export function deserializeWrappedKey(value: string): WrappedKey {
  const raw = base64ToUint8(value)
  if (raw.length !== KEM_CT_LEN + WRAPPED_DEK_LEN) {
    throw new Error("Invalid wrapped key")
  }
  return {
    kemCT: raw.slice(0, KEM_CT_LEN),
    wrappedDEK: raw.slice(KEM_CT_LEN),
  }
}

/** Uint8Array → base64 (chunked to avoid call-stack limits). */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ""
  const CHUNK = 0x2000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** base64 → Uint8Array. */
export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
