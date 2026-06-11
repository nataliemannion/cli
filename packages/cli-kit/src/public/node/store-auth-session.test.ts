import {getStoreAuthAdminSession, STORE_AUTH_APP_CLIENT_ID, storeAuthSessionKey} from './store-auth-session.js'
import {LocalStorage} from './local-storage.js'
import {inTemporaryDirectory} from './fs.js'
import {setLastSeenUserId} from './session.js'
import {beforeEach, describe, expect, test, vi} from 'vitest'

vi.mock('./session.js', async () => {
  const actual = await vi.importActual<typeof import('./session.js')>('./session.js')
  return {
    ...actual,
    setLastSeenUserId: vi.fn(),
  }
})

describe('store auth session storage', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'))
  })

  test('returns an Admin session from the current stored store auth session', async () => {
    await inTemporaryDirectory((cwd) => {
      const storage = new LocalStorage<Record<string, unknown>>({cwd})
      storage.set(storeAuthSessionKey('preview.myshopify.com'), {
        currentUserId: 'preview:123',
        sessionsByUserId: {
          'preview:123': {
            store: 'preview.myshopify.com',
            clientId: STORE_AUTH_APP_CLIENT_ID,
            userId: 'preview:123',
            accessToken: 'shpat_token',
            scopes: [],
            acquiredAt: '2026-06-08T11:00:00.000Z',
          },
        },
      })

      expect(getStoreAuthAdminSession('https://preview.myshopify.com/admin', storage as any)).toEqual({
        token: 'shpat_token',
        storeFqdn: 'preview.myshopify.com',
      })
      expect(setLastSeenUserId).toHaveBeenCalledWith('preview:123')
    })
  })

  test('returns undefined when no stored store auth session exists', async () => {
    await inTemporaryDirectory((cwd) => {
      const storage = new LocalStorage<Record<string, unknown>>({cwd})

      expect(getStoreAuthAdminSession('preview.myshopify.com', storage as any)).toBeUndefined()
      expect(setLastSeenUserId).not.toHaveBeenCalled()
    })
  })

  test('returns undefined when the current stored store auth session is expired', async () => {
    await inTemporaryDirectory((cwd) => {
      const storage = new LocalStorage<Record<string, unknown>>({cwd})
      storage.set(storeAuthSessionKey('preview.myshopify.com'), {
        currentUserId: 'preview:123',
        sessionsByUserId: {
          'preview:123': {
            store: 'preview.myshopify.com',
            clientId: STORE_AUTH_APP_CLIENT_ID,
            userId: 'preview:123',
            accessToken: 'shpat_token',
            scopes: [],
            acquiredAt: '2026-06-08T11:00:00.000Z',
            expiresAt: '2026-06-08T11:30:00.000Z',
          },
        },
      })

      expect(getStoreAuthAdminSession('preview.myshopify.com', storage as any)).toBeUndefined()
      expect(setLastSeenUserId).not.toHaveBeenCalled()
    })
  })
})
