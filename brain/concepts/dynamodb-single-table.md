---
title: DynamoDB single-table layout
type: concept
packages: [api]
tasks: [api-dynamodb-repository]
summary: PAGE#/SHARE# composite keys, zero-padded phrase sort keys, the three access patterns, no GSIs — and what the infra tasks must provision.
updated: 2026-06-10
---

# DynamoDB single-table (as built)

One table, three entity types (`packages/api/src/repositories/keys.ts`):

| Entity | PK | SK |
|---|---|---|
| Page | `PAGE#<pageId>` | `META` |
| Phrase | `PAGE#<pageId>` | `PHRASE#000001` (index zero-padded to width 6) |
| Share | `SHARE#<code>` | `META` |

- Zero-padding makes lexicographic SK order equal numeric phrase order, so a page +
  all phrases in reading order is **one partition query** (`ScanIndexForward: true`;
  `META` sorts before `PHRASE#…`).
- Every item carries an `entityType` discriminator used to route when reading a
  partition.
- **No GSIs.** Exactly three access patterns, all on `PageRepository`
  (`page-repository.ts`): `savePageWithPhrasesAndShare` (single
  `TransactWriteCommand` of all items), `getPageWithPhrases`, `resolveShare`
  (GetItem on share → partition query).

## Conventions

- Mapping between items and domain types lives only in `keys.ts`
  (`toXItem`/`fromXItem`); repository methods speak domain types outward.
- `DynamoDBDocumentClient` + table name are constructor-injected; table name is env
  at the edge, never a literal.
- Writes happen only via the share flow (golden rule #6). The repository trusts the
  caller to have run the [reconstruction check](./reconstruction-invariant.md).

## For the infra tasks (todo)

`infra-dynamodb-table` must provision: string PK + string SK, on-demand billing
(scale-to-zero north star), name passed to the API via env. No GSIs needed. Phrase
index width is fixed at 6 (`PHRASE_INDEX_WIDTH`) — pages are book pages, so >999,999
tokens is not a real case.

## Watch out

- `savePageWithPhrasesAndShare` is an unconditional Put — no share-code collision
  condition (noted in [share-flow](./share-flow.md)).
- TransactWriteItems caps at 100 items → pages with >98 phrases would fail today.
  A long book page can plausibly exceed that; whoever builds
  `api-handler-shares-create` should decide (chunk + verify, or cap) and record it.
