"use client"

import { useState } from "react"
import { Lock, Mail, User, Loader2 } from "lucide-react"
import { fetchUserSalt, loginUser, registerUser } from "@/lib/api"
import { deriveKyberSeed, deriveKyberKeyPair, deriveAuthHash, deriveVaultKey, uint8ToBase64 } from "@/lib/crypto"

export function LoginView({
  onSignIn,
}: {
  onSignIn: (
    token: string,
    email: string,
    kyberPublicKey: Uint8Array,
    kyberPrivateKey: Uint8Array,
    vaultKey: CryptoKey
  ) => void
}) {
  const [isRegistering, setIsRegistering] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (isRegistering) {
      if (!firstName || !lastName || !email || !password || !confirmPassword) {
        setError("Please fill in all fields")
        return
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match")
        return
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters")
        return
      }
    } else {
      if (!email || !password) {
        setError("Please fill in all fields")
        return
      }
    }

    setLoading(true)

    try {
      if (isRegistering) {
        // ── REGISTRATION (Zero-Knowledge) ──
        const randomBytes = new Uint8Array(16)
        crypto.getRandomValues(randomBytes)
        const salt = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("")

        const [kyberSeed, authHash, vaultKey] = await Promise.all([
          deriveKyberSeed(password, salt),
          deriveAuthHash(password, salt),
          deriveVaultKey(password, salt),
        ])

        const { publicKey, privateKey } = await deriveKyberKeyPair(kyberSeed)
        const kyberPubKeyBase64 = uint8ToBase64(publicKey)
        const { token } = await registerUser(email, authHash, salt, kyberPubKeyBase64, firstName, lastName)

        onSignIn(token, email, publicKey, privateKey, vaultKey)
      } else {
        // ── LOGIN (Zero-Knowledge) ──
        const salt = await fetchUserSalt(email)
        if (!salt) {
          setError("Invalid email or password")
          setLoading(false)
          return
        }

        const [kyberSeed, authHash, vaultKey] = await Promise.all([
          deriveKyberSeed(password, salt),
          deriveAuthHash(password, salt),
          deriveVaultKey(password, salt),
        ])

        const { publicKey, privateKey } = await deriveKyberKeyPair(kyberSeed)
        const { token } = await loginUser(email, authHash)

        onSignIn(token, email, publicKey, privateKey, vaultKey)
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || "An authentication error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/20 border border-primary/40 text-secondary mb-3">
            <span
              className="material-symbols-outlined text-secondary"
              style={{ fontSize: "28px", fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              cloud
            </span>
          </div>
          <h1 className="font-headline text-headline-lg font-semibold tracking-tight text-on-surface">
            QuantumVault
          </h1>
          <p className="font-body text-body-sm text-on-surface-variant mt-1">
            Zero-knowledge, post-quantum encrypted cloud vault
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-6 sm:p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-md bg-error-container/40 border border-error/50 p-3 text-xs text-on-error-container">
                {error}
              </div>
            )}

            {isRegistering && (
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="firstName" className="font-label text-label-sm text-on-surface-variant">
                    First Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      className="h-10 w-full rounded-md border border-outline-variant bg-surface-container pl-9 pr-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="lastName" className="font-label text-label-sm text-on-surface-variant">
                    Last Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="h-10 w-full rounded-md border border-outline-variant bg-surface-container pl-9 pr-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary"
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="font-label text-label-sm text-on-surface-variant">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-10 w-full rounded-md border border-outline-variant bg-surface-container pl-9 pr-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="font-label text-label-sm text-on-surface-variant">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-md border border-outline-variant bg-surface-container pl-9 pr-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary"
                  disabled={loading}
                />
              </div>
            </div>

            {isRegistering && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirmPassword" className="font-label text-label-sm text-on-surface-variant">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 w-full rounded-md border border-outline-variant bg-surface-container pl-9 pr-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="mt-2 flex h-10 w-full items-center justify-center rounded-md bg-primary hover:bg-secondary text-on-primary hover:text-on-secondary font-label text-label-md font-medium transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Deriving ML-KEM-768 Keys...
                </>
              ) : isRegistering ? (
                "Create Encrypted Vault"
              ) : (
                "Sign In to Vault"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering)
                setError(null)
              }}
              className="font-body text-body-sm text-secondary hover:underline"
            >
              {isRegistering ? "Already have a vault? Sign in" : "Need a vault? Create an account"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[11px] text-on-surface-variant/70">
          ML-KEM-768 • AES-256-GCM • Zero-Knowledge
        </p>
      </div>
    </main>
  )
}
