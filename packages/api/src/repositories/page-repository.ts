// DynamoDB single-table repository. Translates between the domain types
// (Page/Phrase/Share) and the table's composite-key items, and exposes exactly
// the three access patterns the product needs (specs/02-data-model.md):
//
//   1. getPageWithPhrases  — single partition query (META + PHRASE# items, ordered)
//   2. resolveShare         — GetItem on the share, then pattern #1
//   3. savePageWithPhrasesAndShare — one transactional write of all items
//
// No GSIs. Writes happen ONLY here (driven by POST /shares), never on the scan
// path (CLAUDE.md golden rule #6).

import {
  type DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { AnalyzedPage, Page, Phrase, Share } from '@aya/shared';
import {
  META_SK,
  fromPageItem,
  fromPhraseItem,
  pagePk,
  sharePk,
  toPageItem,
  toPhraseItem,
  toShareItem,
  type PageItem,
  type PhraseItem,
  type ShareItem,
} from './keys.js';

/**
 * DynamoDB single-table repository. The client and table name are injected so
 * the repository is trivially unit-testable with a mocked DocumentClient and so
 * the table name stays config (env), never a literal (CLAUDE.md golden rule #7).
 */
export class PageRepository {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(doc: DynamoDBDocumentClient, tableName: string) {
    this.doc = doc;
    this.tableName = tableName;
  }

  /**
   * Persist a page, all its phrases, and the share in a single transaction so a
   * shared page is never half-written (North Star: Reliable). Callers are
   * expected to have already validated the reconstruction invariant.
   */
  async savePageWithPhrasesAndShare(
    page: Page,
    phrases: readonly Phrase[],
    share: Share,
  ): Promise<void> {
    const items: Array<PageItem | PhraseItem | ShareItem> = [
      toPageItem(page),
      ...phrases.map(toPhraseItem),
      toShareItem(share),
    ];

    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: items.map((Item) => ({
          Put: { TableName: this.tableName, Item },
        })),
      }),
    );
  }

  /**
   * Fetch a page and all its phrases in one partition query. Returns `undefined`
   * if the page META item is absent. Phrases come back sorted by ascending index
   * (the zero-padded sort key makes DynamoDB's order numeric order).
   */
  async getPageWithPhrases(pageId: string): Promise<AnalyzedPage | undefined> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pagePk(pageId) },
        // Sort key ascending => META before PHRASE#…, phrases in index order.
        ScanIndexForward: true,
      }),
    );

    const records = (result.Items ?? []) as Array<PageItem | PhraseItem>;

    let page: Page | undefined;
    const phrases: Phrase[] = [];
    for (const record of records) {
      if (record.entityType === 'Page') {
        page = fromPageItem(record);
      } else if (record.entityType === 'Phrase') {
        phrases.push(fromPhraseItem(record));
      }
    }

    if (page === undefined) {
      return undefined;
    }

    // Defensive: keep the contract (ordered by index) even if a future query
    // path returns items out of order.
    phrases.sort((a, b) => a.index - b.index);

    return { page, phrases };
  }

  /**
   * Resolve a short code to its analysed page. Returns `undefined` for an unknown
   * code (or a dangling share whose page is gone).
   */
  async resolveShare(code: string): Promise<AnalyzedPage | undefined> {
    const got = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: sharePk(code), SK: META_SK },
      }),
    );

    const shareItem = got.Item as ShareItem | undefined;
    if (shareItem === undefined) {
      return undefined;
    }

    return this.getPageWithPhrases(shareItem.pageId);
  }
}
