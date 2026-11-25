import { describe, it, expect } from "vitest"
import { MlKem768 } from "mlkem"
import {
  encryptFile,
  decryptFile,
  encryptMetadata,
  decryptMetadata,
  wrapDekForRecipient,
  unwrapDek,
  uint8ToBase64,
  base64ToUint8,
  serializeWrappedKey,
  deserializeWrappedKey,
  zeroFill,
  VERSION,
  FLAG_GZIP,
  HEADER_LEN,
  TAG_LEN,
  KEM_CT_LEN,
  WRAPPED_DEK_LEN,
  IV_LEN,
  DEK_LEN,
  MAX_FILE_SIZE,
  PUBKEY_LEN,
  type FileMetadata,
  deriveDeterministicUUID,
  deriveVaultKey,
} from "@/lib/crypto"

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a fresh ML-KEM-768 key pair for testing */
async function generateKeyPair() {
  const kem = new MlKem768()
  const [publicKey, privateKey] = await kem.generateKeyPair()
  return { publicKey, privateKey }
}

function randomUUID(): string {
  return crypto.randomUUID()
}

function randomDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(DEK_LEN))
}

function filledBuffer(size: number, value = 0x41): ArrayBuffer {
  const buf = new Uint8Array(size)
  buf.fill(value)
  return buf.buffer
}

function randomBuffer(size: number): ArrayBuffer {
  const buf = new Uint8Array(size)
  // crypto.getRandomValues has a 65536-byte per-call limit in Node.js
  const CHUNK = 65536
  for (let offset = 0; offset < size; offset += CHUNK) {
    const len = Math.min(CHUNK, size - offset)
    crypto.getRandomValues(buf.subarray(offset, offset + len))
  }
  return buf.buffer
}

const sampleMetadata: FileMetadata = {
  fileName: "secret-report.pdf",
  mimeType: "application/pdf",
  originalSize: 1_234_567,
  compressed: false,
}

// ─── Round-Trip Tests ────────────────────────────────────────────────────────

describe("encryptFile / decryptFile round-trip", () => {
  it("0 B plaintext", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()

    const { blob, dek, originalSize } = await encryptFile(
      new ArrayBuffer(0), "empty.bin", publicKey, fileId, ownerId,
    )
    expect(originalSize).toBe(0)
    zeroFill(dek)

    const { plaintext, dek: outDek } = await decryptFile(blob, privateKey, fileId, ownerId)
    expect(plaintext.byteLength).toBe(0)
    zeroFill(outDek)
  })

  it("1 B plaintext", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()

    const { blob, dek } = await encryptFile(
      new Uint8Array([0xff]).buffer, "one.bin", publicKey, fileId, ownerId,
    )
    zeroFill(dek)

    const { plaintext, dek: outDek } = await decryptFile(blob, privateKey, fileId, ownerId)
    expect(plaintext.byteLength).toBe(1)
    expect(plaintext[0]).toBe(0xff)
    zeroFill(outDek)
  })

  it("1 MB plaintext", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const plaintext = randomBuffer(1024 * 1024)

    const { blob, dek } = await encryptFile(plaintext, "medium.bin", publicKey, fileId, ownerId)
    zeroFill(dek)

    const { plaintext: out, dek: outDek } = await decryptFile(blob, privateKey, fileId, ownerId)
    expect(out.byteLength).toBe(1024 * 1024)
    expect(Buffer.from(out).equals(Buffer.from(plaintext))).toBe(true)
    zeroFill(outDek)
  })

  it("compressible text file — FLAG_GZIP is set", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const plaintext = filledBuffer(100_000, 0x41)

    const { blob, dek, compressed, originalSize } = await encryptFile(
      plaintext, "notes.txt", publicKey, fileId, ownerId,
    )
    zeroFill(dek)

    expect(compressed).toBe(true)
    expect(originalSize).toBe(100_000)
    expect(blob[1] & FLAG_GZIP).toBe(FLAG_GZIP)
    expect(blob.length).toBeLessThan(originalSize)

    const { plaintext: out, dek: outDek } = await decryptFile(blob, privateKey, fileId, ownerId)
    expect(out.byteLength).toBe(100_000)
    expect(out.every((b) => b === 0x41)).toBe(true)
    zeroFill(outDek)
  })

  it("random data file — FLAG_GZIP is NOT set", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const plaintext = randomBuffer(10_000)

    const { blob, dek, compressed } = await encryptFile(
      plaintext, "random.dat", publicKey, fileId, ownerId,
    )
    zeroFill(dek)

    expect(compressed).toBe(false)
    expect(blob[1] & FLAG_GZIP).toBe(0)

    const { plaintext: out, dek: outDek } = await decryptFile(blob, privateKey, fileId, ownerId)
    expect(Buffer.from(out).equals(Buffer.from(plaintext))).toBe(true)
    zeroFill(outDek)
  })

  it("already-compressed extension (jpg) — compression is skipped", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const plaintext = filledBuffer(10_000, 0x41)

    const { blob, dek, compressed } = await encryptFile(
      plaintext, "photo.jpg", publicKey, fileId, ownerId,
    )
    zeroFill(dek)

    expect(compressed).toBe(false)
    expect(blob[1] & FLAG_GZIP).toBe(0)

    const { plaintext: out, dek: outDek } = await decryptFile(blob, privateKey, fileId, ownerId)
    expect(out.byteLength).toBe(10_000)
    expect(out.every((b) => b === 0x41)).toBe(true)
    zeroFill(outDek)
  })
})

// ─── Blob Structure ──────────────────────────────────────────────────────────

describe("blob structure", () => {
  it("version byte is VERSION and header has the documented size", () => {
    expect(VERSION).toBe(0x02)
    expect(HEADER_LEN).toBe(1 + 1 + KEM_CT_LEN + WRAPPED_DEK_LEN + IV_LEN)
    expect(WRAPPED_DEK_LEN).toBe(40)
  })

  it("blob length = HEADER_LEN + data + TAG_LEN (uncompressed)", async () => {
    const { publicKey } = await generateKeyPair()
    const plaintext = randomBuffer(1000)
    const { blob, dek, compressed } = await encryptFile(
      plaintext, "test.bin", publicKey, randomUUID(), randomUUID(),
    )
    zeroFill(dek)

    expect(blob[0]).toBe(VERSION)
    if (!compressed) {
      expect(blob.length).toBe(HEADER_LEN + 1000 + TAG_LEN)
    } else {
      expect(blob.length).toBeLessThan(HEADER_LEN + 1000 + TAG_LEN)
    }
  })
})

// ─── Tamper Detection ────────────────────────────────────────────────────────

describe("tamper detection", () => {
  let blob: Uint8Array
  let privateKey: Uint8Array
  let fileId: string
  let ownerId: string

  it("setup: encrypt a test file", async () => {
    const kp = await generateKeyPair()
    privateKey = kp.privateKey
    fileId = randomUUID()
    ownerId = randomUUID()
    const result = await encryptFile(
      filledBuffer(256, 0x42), "test.txt", kp.publicKey, fileId, ownerId,
    )
    blob = result.blob
    zeroFill(result.dek)
  })

  function tamper(offset: number, label: string) {
    it(`tampered ${label} (offset ${offset}) → Decryption failed`, async () => {
      const bad = new Uint8Array(blob)
      bad[offset] ^= 0xff
      await expect(decryptFile(bad, privateKey, fileId, ownerId))
        .rejects.toThrow("Decryption failed")
    })
  }

  tamper(0, "version byte")
  tamper(1, "flags byte")
  tamper(2, "kemCT first byte")
  tamper(2 + KEM_CT_LEN - 1, "kemCT last byte")
  tamper(2 + KEM_CT_LEN, "wrappedDEK first byte")
  tamper(2 + KEM_CT_LEN + WRAPPED_DEK_LEN - 1, "wrappedDEK last byte")
  tamper(2 + KEM_CT_LEN + WRAPPED_DEK_LEN, "iv first byte")
  tamper(HEADER_LEN - 1, "iv last byte")
  tamper(HEADER_LEN, "ciphertext first byte")

  it("tampered tag (last 16 bytes) → Decryption failed", async () => {
    const bad = new Uint8Array(blob)
    bad[bad.length - 1] ^= 0xff
    await expect(decryptFile(bad, privateKey, fileId, ownerId))
      .rejects.toThrow("Decryption failed")
  })
})

// ─── AAD Binding ─────────────────────────────────────────────────────────────

describe("AAD binding", () => {
  it("wrong fileId → Decryption failed", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()

    const { blob, dek } = await encryptFile(filledBuffer(64), "test.bin", publicKey, fileId, ownerId)
    zeroFill(dek)

    await expect(decryptFile(blob, privateKey, randomUUID(), ownerId))
      .rejects.toThrow("Decryption failed")
  })

  it("wrong ownerId → Decryption failed", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()

    const { blob, dek } = await encryptFile(filledBuffer(64), "test.bin", publicKey, fileId, ownerId)
    zeroFill(dek)

    await expect(decryptFile(blob, privateKey, fileId, randomUUID()))
      .rejects.toThrow("Decryption failed")
  })
})

// ─── Pre-Crypto Rejection ────────────────────────────────────────────────────

describe("pre-crypto rejection", () => {
  it("short blob (< HEADER_LEN + TAG_LEN)", async () => {
    const { privateKey } = await generateKeyPair()
    const short = new Uint8Array(HEADER_LEN + TAG_LEN - 1)
    short[0] = VERSION
    await expect(decryptFile(short, privateKey, randomUUID(), randomUUID()))
      .rejects.toThrow("Decryption failed")
  })

  it("unknown version", async () => {
    const { privateKey } = await generateKeyPair()
    const bad = new Uint8Array(HEADER_LEN + TAG_LEN)
    bad[0] = 0xff
    await expect(decryptFile(bad, privateKey, randomUUID(), randomUUID()))
      .rejects.toThrow("Decryption failed")
  })

  it("unknown flag bits", async () => {
    const { privateKey } = await generateKeyPair()
    const bad = new Uint8Array(HEADER_LEN + TAG_LEN)
    bad[0] = VERSION
    bad[1] = 0b00000010
    await expect(decryptFile(bad, privateKey, randomUUID(), randomUUID()))
      .rejects.toThrow("Decryption failed")
  })
})

// ─── Wrong Key ───────────────────────────────────────────────────────────────

describe("wrong private key", () => {
  it("decryption with a different key pair → Decryption failed", async () => {
    const kp1 = await generateKeyPair()
    const kp2 = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()

    const { blob, dek } = await encryptFile(filledBuffer(128), "test.bin", kp1.publicKey, fileId, ownerId)
    zeroFill(dek)

    await expect(decryptFile(blob, kp2.privateKey, fileId, ownerId))
      .rejects.toThrow("Decryption failed")
  })
})

// ─── Uniqueness ──────────────────────────────────────────────────────────────

describe("encryption uniqueness", () => {
  it("two encryptions of the same file produce different kemCT, wrappedDEK, iv, ciphertext", async () => {
    const { publicKey } = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const plaintext = filledBuffer(256)

    const r1 = await encryptFile(plaintext, "test.bin", publicKey, fileId, ownerId)
    const r2 = await encryptFile(plaintext, "test.bin", publicKey, fileId, ownerId)
    zeroFill(r1.dek)
    zeroFill(r2.dek)

    expect(Buffer.from(r1.wrappedKey.kemCT).equals(Buffer.from(r2.wrappedKey.kemCT))).toBe(false)
    expect(Buffer.from(r1.wrappedKey.wrappedDEK).equals(Buffer.from(r2.wrappedKey.wrappedDEK))).toBe(false)
    expect(Buffer.from(r1.blob).equals(Buffer.from(r2.blob))).toBe(false)
  })
})

// ─── Validation Errors ───────────────────────────────────────────────────────

describe("encryptFile validation", () => {
  it("file too large", async () => {
    const { publicKey } = await generateKeyPair()
    const huge = new ArrayBuffer(MAX_FILE_SIZE + 1)
    await expect(
      encryptFile(huge, "big.bin", publicKey, randomUUID(), randomUUID()),
    ).rejects.toThrow("200 MB limit")
  })

  it("wrong public key length", async () => {
    await expect(
      encryptFile(new ArrayBuffer(10), "test.bin", new Uint8Array(100), randomUUID(), randomUUID()),
    ).rejects.toThrow(`${PUBKEY_LEN} bytes`)
  })

  it("invalid fileId (not UUID)", async () => {
    const { publicKey } = await generateKeyPair()
    await expect(
      encryptFile(new ArrayBuffer(10), "test.bin", publicKey, "not-a-uuid", randomUUID()),
    ).rejects.toThrow("fileId")
  })

  it("invalid ownerId (not UUID)", async () => {
    const { publicKey } = await generateKeyPair()
    await expect(
      encryptFile(new ArrayBuffer(10), "test.bin", publicKey, randomUUID(), "not-a-uuid"),
    ).rejects.toThrow("ownerId")
  })

  it("wrapDekForRecipient rejects a short DEK", async () => {
    const { publicKey } = await generateKeyPair()
    await expect(
      wrapDekForRecipient(new Uint8Array(16), publicKey, randomUUID()),
    ).rejects.toThrow(`${DEK_LEN} bytes`)
  })
})

// ─── Metadata Round-Trip ─────────────────────────────────────────────────────

describe("metadata encryption", () => {
  it("round-trip with the file DEK", async () => {
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const dek = randomDek()

    const encrypted = await encryptMetadata(sampleMetadata, dek, fileId, ownerId)
    expect(typeof encrypted).toBe("string")
    expect(encrypted.length).toBeGreaterThan(0)

    const decrypted = await decryptMetadata(encrypted, dek, fileId, ownerId)
    expect(decrypted).toEqual(sampleMetadata)
    zeroFill(dek)
  })

  it("encrypted metadata does not contain the plaintext filename", async () => {
    const dek = randomDek()
    const encrypted = await encryptMetadata(sampleMetadata, dek, randomUUID(), randomUUID())
    expect(atob(encrypted)).not.toContain("secret-report.pdf")
    zeroFill(dek)
  })

  it("wrong DEK fails metadata decryption", async () => {
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const dek = randomDek()

    const encrypted = await encryptMetadata(sampleMetadata, dek, fileId, ownerId)
    await expect(decryptMetadata(encrypted, randomDek(), fileId, ownerId)).rejects.toThrow()
    zeroFill(dek)
  })

  it("wrong fileId fails metadata decryption", async () => {
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const dek = randomDek()

    const encrypted = await encryptMetadata(sampleMetadata, dek, fileId, ownerId)
    await expect(decryptMetadata(encrypted, dek, randomUUID(), ownerId)).rejects.toThrow()
    zeroFill(dek)
  })

  it("wrong ownerId fails metadata decryption", async () => {
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const dek = randomDek()

    const encrypted = await encryptMetadata(sampleMetadata, dek, fileId, ownerId)
    await expect(decryptMetadata(encrypted, dek, fileId, randomUUID())).rejects.toThrow()
    zeroFill(dek)
  })
})

// ─── Sharing ─────────────────────────────────────────────────────────────────

describe("sharing via re-wrapped DEK", () => {
  it("recipient can decrypt data + metadata with their own envelope", async () => {
    const owner = await generateKeyPair()
    const recipient = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()
    const plaintext = filledBuffer(4096, 0x5a)

    const { blob, dek } = await encryptFile(plaintext, "shared.txt", owner.publicKey, fileId, ownerId)
    const metadata = await encryptMetadata(sampleMetadata, dek, fileId, ownerId)
    const shareKey = await wrapDekForRecipient(dek, recipient.publicKey, fileId)
    zeroFill(dek)

    expect(shareKey.wrappedDEK.length).toBe(WRAPPED_DEK_LEN)

    // Owner path (envelope embedded in blob)
    const ownerRes = await decryptFile(blob, owner.privateKey, fileId, ownerId)
    expect(Buffer.from(ownerRes.plaintext).equals(Buffer.from(plaintext))).toBe(true)
    zeroFill(ownerRes.dek)

    // Recipient path (their own envelope)
    const recipientRes = await decryptFile(blob, recipient.privateKey, fileId, ownerId, shareKey)
    expect(Buffer.from(recipientRes.plaintext).equals(Buffer.from(plaintext))).toBe(true)

    const meta = await decryptMetadata(metadata, recipientRes.dek, fileId, ownerId)
    expect(meta.fileName).toBe(sampleMetadata.fileName)
    zeroFill(recipientRes.dek)
  })

  it("recipient cannot decrypt without their share envelope", async () => {
    const owner = await generateKeyPair()
    const recipient = await generateKeyPair()
    const fileId = randomUUID()
    const ownerId = randomUUID()

    const { blob, dek } = await encryptFile(filledBuffer(64), "x.bin", owner.publicKey, fileId, ownerId)
    zeroFill(dek)

    await expect(decryptFile(blob, recipient.privateKey, fileId, ownerId))
      .rejects.toThrow("Decryption failed")
  })

  it("unwrapDek round-trips a DEK", async () => {
    const recipient = await generateKeyPair()
    const fileId = randomUUID()
    const dek = randomDek()
    const original = new Uint8Array(dek)

    const wrapped = await wrapDekForRecipient(dek, recipient.publicKey, fileId)
    const unwrapped = await unwrapDek(recipient.privateKey, wrapped, fileId)

    expect(Buffer.from(unwrapped).equals(Buffer.from(original))).toBe(true)
    zeroFill(dek)
    zeroFill(unwrapped)
  })
})

// ─── Serialization ───────────────────────────────────────────────────────────

describe("wrapped key serialization", () => {
  it("serialize/deserialize round-trip", async () => {
    const { publicKey } = await generateKeyPair()
    const fileId = randomUUID()
    const dek = randomDek()

    const wrapped = await wrapDekForRecipient(dek, publicKey, fileId)
    const encoded = serializeWrappedKey(wrapped)
    const decoded = deserializeWrappedKey(encoded)

    expect(Buffer.from(decoded.kemCT).equals(Buffer.from(wrapped.kemCT))).toBe(true)
    expect(Buffer.from(decoded.wrappedDEK).equals(Buffer.from(wrapped.wrappedDEK))).toBe(true)
    zeroFill(dek)
  })

  it("rejects malformed serialized envelopes", () => {
    expect(() => deserializeWrappedKey(uint8ToBase64(new Uint8Array(10)))).toThrow()
  })
})

// ─── Base64 ──────────────────────────────────────────────────────────────────

describe("base64 helpers", () => {
  it("round-trip arbitrary bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(5000))
    const decoded = base64ToUint8(uint8ToBase64(bytes))
    expect(Buffer.from(decoded).equals(Buffer.from(bytes))).toBe(true)
  })
})

// ─── Key & Identity Derivation Helpers ───────────────────────────────────────

describe("deriveDeterministicUUID & deriveVaultKey", () => {
  it("deriveDeterministicUUID produces a valid, deterministic UUID", () => {
    const uuid1 = deriveDeterministicUUID("user@example.com")
    const uuid2 = deriveDeterministicUUID("user@example.com")
    const uuid3 = deriveDeterministicUUID("other@example.com")

    expect(uuid1).toBe(uuid2)
    expect(uuid1).not.toBe(uuid3)
    expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(uuid1.length).toBe(36)
  })

  it("deriveVaultKey produces a usable AES-256-GCM key", async () => {
    const vaultKey = await deriveVaultKey("my-secure-password", "some-salt")
    expect(vaultKey.algorithm.name).toBe("AES-GCM")
    expect((vaultKey.algorithm as AesKeyAlgorithm).length).toBe(256)
  })
})
