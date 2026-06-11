import {normalizeStoreFqdn} from './context/fqdn.js'
import {LocalStorage} from './local-storage.js'
import {setLastSeenUserId} from './session.js'
import type {AdminSession} from './session.js'

export const STORE_AUTH_APP_CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const STORE_AUTH_PROJECT_NAME = 'shopify-cli-store'
const EXPIRY_MARGIN_MS = 4 * 60 * 1000

interface StoredStoreAppSession {
  store: string
  clientId: string
  userId: string
  accessToken: string
  scopes: string[]
  acquiredAt: string
  expiresAt?: string
}

interface StoredStoreAppSessionBucket {
  currentUserId: string
  sessionsByUserId: {[userId: string]: StoredStoreAppSession}
}

interface StoreAuthSessionSchema {
  [key: string]: StoredStoreAppSessionBucket
}

let _storeAuthSessionStorage: LocalStorage<StoreAuthSessionSchema> | undefined

function storeAuthSessionStorage() {
  _storeAuthSessionStorage ??= new LocalStorage<StoreAuthSessionSchema>({projectName: STORE_AUTH_PROJECT_NAME})
  return _storeAuthSessionStorage
}

/**
 * Build the local-storage key used for store-auth sessions.
 *
 * @param store - The normalized store FQDN.
 * @returns The store-auth session storage key.
 */
export function storeAuthSessionKey(store: string): string {
  return `${STORE_AUTH_APP_CLIENT_ID}::${escapeStoreAuthSessionKeySegment(store)}`
}

function escapeStoreAuthSessionKeySegment(value: string): string {
  return value.replace(/\./g, '\\.')
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function sanitizeStoredStoreAppSession(value: unknown): StoredStoreAppSession | undefined {
  if (!value || typeof value !== 'object') return undefined

  const session = value as Record<string, unknown>
  if (
    !isString(session.store) ||
    !isString(session.clientId) ||
    !isString(session.userId) ||
    !isString(session.accessToken) ||
    !Array.isArray(session.scopes) ||
    !session.scopes.every(isString) ||
    !isString(session.acquiredAt)
  ) {
    return undefined
  }

  return {
    store: session.store,
    clientId: session.clientId,
    userId: session.userId,
    accessToken: session.accessToken,
    scopes: session.scopes,
    acquiredAt: session.acquiredAt,
    ...(isString(session.expiresAt) ? {expiresAt: session.expiresAt} : {}),
  }
}

function readStoreAuthSessionBucket(
  store: string,
  storage: LocalStorage<StoreAuthSessionSchema>,
): StoredStoreAppSessionBucket | undefined {
  const storedBucket = storage.get(storeAuthSessionKey(store))
  if (!storedBucket || typeof storedBucket !== 'object') return undefined

  const {sessionsByUserId, currentUserId} = storedBucket as Partial<StoredStoreAppSessionBucket>
  if (
    !sessionsByUserId ||
    typeof sessionsByUserId !== 'object' ||
    Array.isArray(sessionsByUserId) ||
    typeof currentUserId !== 'string'
  ) {
    return undefined
  }

  const sanitizedSessionsByUserId = Object.fromEntries(
    Object.entries(sessionsByUserId).flatMap(([userId, session]) => {
      const sanitizedSession = sanitizeStoredStoreAppSession(session)
      return sanitizedSession ? [[userId, sanitizedSession]] : []
    }),
  )

  return {
    currentUserId,
    sessionsByUserId: sanitizedSessionsByUserId,
  }
}

function isSessionExpired(session: StoredStoreAppSession): boolean {
  if (!session.expiresAt) return false

  const expiresAtMs = new Date(session.expiresAt).getTime()
  if (Number.isNaN(expiresAtMs)) return true

  return expiresAtMs - EXPIRY_MARGIN_MS < Date.now()
}

/**
 * Load an Admin API session from the local store-auth cache when one is currently usable.
 *
 * @param store - The store FQDN or URL to load a store-auth session for.
 * @param storage - Optional storage override for tests.
 * @returns An Admin session, or undefined when no usable session is cached.
 */
export function getStoreAuthAdminSession(
  store: string,
  storage: LocalStorage<StoreAuthSessionSchema> = storeAuthSessionStorage(),
): AdminSession | undefined {
  const storeFqdn = normalizeStoreFqdn(store)
  const bucket = readStoreAuthSessionBucket(storeFqdn, storage)
  const session = bucket?.sessionsByUserId[bucket.currentUserId]
  if (!session || isSessionExpired(session)) return undefined

  setLastSeenUserId(session.userId)

  return {
    token: session.accessToken,
    storeFqdn,
  }
}
