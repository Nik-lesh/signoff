/**
 * Signoff's three collections: ledgers, claims, verdicts.
 *
 * Two rules shape every permission below.
 *
 * 1. Nobody writes these collections from a browser or an agent directly.
 *    `create`, `update` and `delete` are `false` for every role, so the only
 *    writer is server code in src/server/ledger-service.ts, which checks who
 *    is calling before each write. That is what keeps `source` honest (a
 *    browser cannot label its own claim "agent") and what makes the ledger
 *    append-only: the service never changes what a claim or a verdict says,
 *    and removes one only when its keeper deletes the whole ledger.
 *
 * 2. Reads are `'published'`: the owner, plus anyone at all once the row's
 *    `visibility` is `'public'`. The record room applies this before it sends
 *    a row over the WebSocket, so a private ledger never reaches another
 *    person's browser, and a public one streams live to signed-out visitors.
 *
 * `ownerId` and `visibility` are copied from the ledger onto each claim and
 * verdict because DeepSpace evaluates read rules row by row, with no joins.
 */

import type { CollectionSchema, ColumnDefinition, RolePermissions } from 'deepspace/schema'
import { LIMITS, STAKES, VERDICT_STATUSES } from '../lib/ledger'

const SERVER_WRITES_ONLY: RolePermissions = {
  read: 'published',
  create: false,
  update: false,
  delete: false,
}

/** Same rule for every role: the app owner gets no special view of other people's ledgers. */
const permissions = {
  viewer: SERVER_WRITES_ONLY,
  member: SERVER_WRITES_ONLY,
  admin: SERVER_WRITES_ONLY,
}

const visibility: ColumnDefinition = {
  name: 'visibility',
  storage: 'text',
  interpretation: { kind: 'select', options: ['private', 'public'] },
  required: true,
}

const ownerId: ColumnDefinition = {
  name: 'ownerId',
  storage: 'text',
  interpretation: 'plain',
  required: true,
  immutable: true,
}

export const ledgersSchema: CollectionSchema = {
  name: 'ledgers',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: LIMITS.ledgerName },
    // The handle an agent uses to name the ledger: unique per owner, never changes.
    { name: 'slug', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: LIMITS.slug },
    { name: 'repoUrl', storage: 'text', interpretation: { kind: 'url' }, maxLength: LIMITS.repoUrl },
    ownerId,
    { name: 'ownerName', storage: 'text', interpretation: 'plain', maxLength: LIMITS.personName },
    visibility,
    // Kept on the ledger so the cap on claims is one read, not a table scan.
    { name: 'claimCount', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  uniqueOn: ['ownerId', 'slug'],
  ownerField: 'ownerId',
  visibilityField: 'visibility',
  permissions,
}

export const claimsSchema: CollectionSchema = {
  name: 'claims',
  columns: [
    { name: 'ledgerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    ownerId,
    visibility,
    { name: 'statement', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: LIMITS.statement },
    { name: 'check', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: LIMITS.check },
    { name: 'stakes', storage: 'text', interpretation: { kind: 'select', options: [...STAKES] }, required: true, immutable: true },
    { name: 'ref', storage: 'text', interpretation: 'plain', immutable: true, maxLength: LIMITS.ref },
    { name: 'agent', storage: 'text', interpretation: 'plain', immutable: true, maxLength: LIMITS.agentName },
    // Id of an earlier claim in the same ledger that this one follows up on. Checked by the service.
    { name: 'follows', storage: 'text', interpretation: 'plain', immutable: true, maxLength: 64 },
    // 'agent' when filed through the agent tool route, 'manual' when a signed-in person typed it.
    { name: 'source', storage: 'text', interpretation: { kind: 'select', options: ['agent', 'manual'] }, required: true, immutable: true },
  ],
  ownerField: 'ownerId',
  visibilityField: 'visibility',
  permissions,
}

export const verdictsSchema: CollectionSchema = {
  name: 'verdicts',
  columns: [
    { name: 'claimId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'ledgerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    ownerId,
    visibility,
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: [...VERDICT_STATUSES] }, required: true, immutable: true },
    { name: 'note', storage: 'text', interpretation: 'plain', immutable: true, maxLength: LIMITS.note },
    { name: 'byName', storage: 'text', interpretation: 'plain', immutable: true, maxLength: LIMITS.personName },
  ],
  ownerField: 'ownerId',
  visibilityField: 'visibility',
  permissions,
}

export const ledgerSchemas: CollectionSchema[] = [ledgersSchema, claimsSchema, verdictsSchema]
