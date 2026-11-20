import { USERS_COLUMNS, type CollectionSchema } from 'deepspace/schema'

/**
 * The platform's users collection, with one Signoff change: `roster`.
 *
 * By default every signed-in person is sent a roster of everyone registered
 * in the app (id, name, avatar, role, last seen). Signoff has no feature that
 * needs one, and a tool for private ledgers should not tell its users who
 * else uses it. `'read-policy'` limits the roster to the rows the caller's
 * read rule allows, which for a member is their own. The app owner (admin)
 * still sees everyone.
 */
export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: [...USERS_COLUMNS],
  roster: 'read-policy',
  permissions: {
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
