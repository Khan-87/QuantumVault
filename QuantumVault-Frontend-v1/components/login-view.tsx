"use client"

import { useState } from "react"
import { Lock, Mail, Shield, User, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetchUserSalt, loginUser, registerUser } from "@/lib/api"
import { deriveKyberSeed, deriveKyberKeyPair, deriveAuthHash, uint8ToBase64 } from "@/lib/crypto"

export function LoginView({
  onSignIn,
}: {
  onSignIn: (token: string, email: string, kyberPublicKey: Uint8Array, kyberPrivateKey: Uint8Array) => void
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
        // 1. Generate random PBKDF2 salt
        const randomBytes = new Uint8Array(16)
        crypto.getRandomValues(randomBytes)
        const salt = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("")

        // 2. Derive Kyber seed (64 bytes) and auth hash (32 bytes) — two separate PBKDF2 paths
        const [kyberSeed, authHash] = await Promise.all([
          deriveKyberSeed(password, salt),
          deriveAuthHash(password, salt),
        ])

        // 3. Derive deterministic ML-KEM-768 key pair
        const { publicKey, privateKey } = await deriveKyberKeyPair(kyberSeed)

        // 4. Register — send authHash (NOT password) + kyberPublicKey to server
        const kyberPubKeyBase64 = uint8ToBase64(publicKey)
        const { token } = await registerUser(email, authHash, salt, kyberPubKeyBase64, firstName, lastName)

        onSignIn(token, email, publicKey, privateKey)
      } else {
        // ── LOGIN (Zero-Knowledge) ──
        // 1. Fetch salt from server
        const salt = await fetchUserSalt(email)
        if (!salt) {
          setError("Invalid email or password")
          setLoading(false)
          return
        }

        // 2. Derive auth hash and Kyber seed from password + salt
        const [kyberSeed, authHash] = await Promise.all([
          deriveKyberSeed(password, salt),
          deriveAuthHash(password, salt),
        ])

        // 3. Re-derive the same deterministic ML-KEM-768 key pair
        const { publicKey, privateKey } = await deriveKyberKeyPair(kyberSeed)

        // 4. Authenticate — send authHash (NOT password) to server
        const { token } = await loginUser(email, authHash)

        onSignIn(token, email, publicKey, privateKey)
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || "An authentication error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary">
            <Shield className="size-6 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance">QuantumVault</h1>
          <p className="mt-1 text-sm text-muted-foreground">Secure cloud storage for your files</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-xs text-destructive">{error}</div>
            )}

            {isRegistering && (
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="firstName" className="text-sm font-medium">
                    First Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="lastName" className="text-sm font-medium">
                    Last Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                {isRegistering ? "Create password" : "Password"}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="password"
                  type="password"
                  autoComplete={isRegistering ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading}
                />
              </div>
            </div>

            {isRegistering && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {isRegistering ? "Creating account..." : "Signing in..."}
                </>
              ) : isRegistering ? (
                "Create account"
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {isRegistering ? "Already have an account? " : "Don't have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering)
              setError(null)
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
            disabled={loading}
          >
            {isRegistering ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </main>
  )
}
