import type { Message } from '#src/domain/message/Message.js';
import type {
  CreateMessageData,
  IMessageRepository,
} from '#src/use-cases/ports/IMessageRepository.js';

interface Deps {
  inner: IMessageRepository;
  /** Messages kept per conversation (`CONTENT_LIMITS.MESSAGES_PER_CONVERSATION`). */
  keepLatest: number;
}

/**
 * Keeps a conversation to its newest `keepLatest` messages (JEF-339).
 *
 * A decorator at the repository boundary rather than a call in each use case
 * that stores a message (the stream, confirm and dismiss all do), so a new
 * writer is bounded by construction. Trimming is chosen over refusing the new
 * message because the model is only shown the last `CHAT.MAX_HISTORY_MESSAGES`;
 * the rows it drops were stored but never read.
 *
 * The row is written first and the trim follows, so a failed trim never loses
 * the message just sent. It runs on the same ambient transaction as `create`.
 */
export class TrimmingMessageRepository implements IMessageRepository {
  private readonly inner: IMessageRepository;
  private readonly keepLatest: number;

  constructor({ inner, keepLatest }: Deps) {
    this.inner = inner;
    this.keepLatest = keepLatest;
  }

  async create(data: CreateMessageData): Promise<Message> {
    const created = await this.inner.create(data);
    await this.inner.trimToLatest(data.conversationId, this.keepLatest);
    return created;
  }

  findAllByConversationId(conversationId: string): Promise<Message[]> {
    return this.inner.findAllByConversationId(conversationId);
  }

  trimToLatest(conversationId: string, keep: number): Promise<void> {
    return this.inner.trimToLatest(conversationId, keep);
  }
}
