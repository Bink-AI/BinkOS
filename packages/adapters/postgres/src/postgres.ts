import pg, { QueryConfig, QueryConfigValues, QueryResult, QueryResultRow } from 'pg';
import { DatabaseAdapter, UUID } from '@binkai/core';
import { MessageEntity, UserEntity } from '@binkai/core';
import fs from 'fs';
import path from 'path';

type Pool = pg.Pool;

export class PostgresDatabaseAdapter extends DatabaseAdapter<Pool> {
  private pool: Pool;
  private readonly connectionTimeout: number = 5000; // 5 seconds

  private readonly maxRetries: number = 3;
  private readonly baseDelay: number = 1000;
  private readonly maxDelay: number = 10000;
  private readonly jitterMax: number = 1000;

  constructor(connectionConfig: any) {
    super({
      //circuitbreaker
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenMaxAttempts: 3,
    });

    const defaultConfig = {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: this.connectionTimeout,
    };

    this.pool = new pg.Pool({
      ...defaultConfig,
      ...connectionConfig,
    });

    this.pool.on('error', (err: any) => {
      console.error('Unexpected pool error', err);
      this.handlePoolError(err);
    });

    this.setupPoolErrorHandling();
  }

  private setupPoolErrorHandling() {
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on('beforeExit', async () => {
      await this.cleanup();
    });
  }

  private async wrapDatabase<T>(operation: () => Promise<T>, context: string): Promise<T> {
    return this.withCircuitBreaker(async () => {
      return this.withRetry(operation);
    }, context);
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('Unknown error'); // Initialize with default

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          // Calculate delay with exponential backoff
          const backoffDelay = Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay);

          // Add jitter to prevent thundering herd
          const jitter = Math.random() * this.jitterMax;
          const delay = backoffDelay + jitter;

          console.warn(`Database operation failed (attempt ${attempt}/${this.maxRetries}):`, {
            error: error instanceof Error ? error.message : String(error),
            nextRetryIn: `${(delay / 1000).toFixed(1)}s`,
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('Max retry attempts reached:', {
            error: error instanceof Error ? error.message : String(error),
            totalAttempts: attempt,
          });
          throw error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    throw lastError;
  }

  private async handlePoolError(error: Error) {
    console.error('Pool error occurred, attempting to reconnect', {
      error: error.message,
    });

    try {
      // Close existing pool
      await this.pool.end();

      // Create new pool
      this.pool = new pg.Pool({
        ...this.pool.options,
        connectionTimeoutMillis: this.connectionTimeout,
      });

      await this.checkDatabaseConnection();
      console.info('Pool reconnection successful');
    } catch (reconnectError) {
      console.error('Failed to reconnect pool', {
        error: reconnectError instanceof Error ? reconnectError.message : String(reconnectError),
      });
      throw reconnectError;
    }
  }

  async query<R extends QueryResultRow = any, I = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: QueryConfigValues<I>,
  ): Promise<QueryResult<R>> {
    return this.wrapDatabase(async () => {
      return await this.pool.query(queryTextOrConfig, values);
    }, 'query');
  }

  async init() {
    await this.checkDatabaseConnection();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Check if schema already exists (check for a core table)
      const { rows } = await client.query(`
              SELECT EXISTS (
                  SELECT FROM information_schema.tables
                  WHERE table_name = 'messages'
              );
          `);

      if (!rows[0].exists) {
        console.info('Applying database schema - tables');
        const schema = fs.readFileSync(path.resolve(__dirname, '../migration.sql'), 'utf8');
        await client.query(schema);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  async checkDatabaseConnection(): Promise<boolean> {
    let client;
    try {
      client = await this.pool.connect();
      // TODO  confirm connection success
      const result = await client.query('SELECT NOW()');
      console.info('Database connection test successful:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      throw new Error(`Failed to connect to database: ${(error as Error).message}`);
    } finally {
      if (client) client.release();
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.pool.end();
      console.info('Database pool closed');
    } catch (error) {
      console.error('Error closing database pool:', error);
    }
  }

  async getUserById(userId: UUID): Promise<UserEntity | null> {
    return this.wrapDatabase(async () => {
      const { rows } = await this.pool.query(
        `SELECT * FROM users WHERE id = $1 AND ${this.getSoftDeleteCondition()}`,
        [userId],
      );
      if (rows.length === 0) {
        console.debug('Account not found:', { userId });
        return null;
      }

      const account = rows[0];
      return {
        ...account,
        metadata:
          typeof account.metadata === 'string' ? JSON.parse(account.metadata) : account.metadata,
      };
    }, 'getUserById');
  }

  async createUser(user: UserEntity): Promise<boolean> {
    return this.wrapDatabase(async () => {
      try {
        await this.pool.query(
          `INSERT INTO users (name, username, email, address, avatar_url, metadata)
                  VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            user.name,
            user.username || '',
            user.email || '',
            user.address || '',
            user.avatarUrl || '',
            JSON.stringify(user.metadata),
          ],
        );
        console.debug('User created successfully');
        return true;
      } catch (error) {
        console.error('Error creating user:', {
          error: error instanceof Error ? error.message : String(error),
          address: user.address,
        });
        return false;
      }
    }, 'createUser');
  }

  async createAndGetUserByAddress(user: UserEntity): Promise<UserEntity | null> {
    return this.wrapDatabase(async () => {
      try {
        if (!user.address) {
          console.error('Address is required');
          return null;
        }
        const { rows } = await this.pool.query('SELECT * FROM users WHERE address = $1', [
          user.address,
        ]);
        if (rows.length > 0) {
          return rows[0];
        }
        await this.createUser(user);
        const { rows: userRows } = await this.pool.query('SELECT * FROM users WHERE address = $1', [
          user.address,
        ]);
        return userRows[0];
      } catch (error) {
        console.error('Error creating user:', {
          error: error instanceof Error ? error.message : String(error),
          address: user.address,
        });
        return null;
      }
    }, 'createAndGetUserByAddress');
  }

  async createThreadIfNotExists(threadId?: UUID, title?: string): Promise<UUID> {
    if (!threadId) {
      const { rows } = await this.pool.query(
        'INSERT INTO threads (title) VALUES ($1) RETURNING id',
        [title || ''],
      );
      return rows[0].id;
    } else {
      const { rows } = await this.pool.query('SELECT id FROM threads WHERE id = $1', [threadId]);
      if (rows.length === 0) {
        // Thread doesn't exist, create it
        await this.pool.query('INSERT INTO threads (id, title) VALUES ($1, $2)', [
          threadId,
          title || '',
        ]);
      }
      return threadId;
    }
  }

  async clearUserMessages(address: string): Promise<boolean> {
    const user = await this.getUserByAddress(address);
    if (user?.id) {
      return await this.clearMessagesByUserId(user.id);
    }
    return false;
  }

  async clearThreadMessages(threadId: UUID): Promise<boolean> {
    return await this.clearMessagesByThreadId(threadId);
  }

  async createMessages(messages: MessageEntity[], threadId?: UUID): Promise<boolean> {
    return this.wrapDatabase(async () => {
      try {
        if (messages.length === 0) return true;

        // If threadId is provided, ensure it exists
        const thread_id = await this.createThreadIfNotExists(threadId, messages?.[0]?.content);

        // Create parameterized query with $1, $2, etc.
        const values: any[] = [];
        const valueStrings = messages.map((_, index) => {
          const offset = index * 5;
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
        });

        // Flatten message data into values array
        messages.forEach(message => {
          if (!message.userId) {
            throw new Error('userId is required for message creation');
          }
          values.push(
            message.content,
            message.userId,
            message.messageType,
            JSON.stringify(message.metadata),
            thread_id || null,
          );
        });

        await this.pool.query(
          `INSERT INTO messages (content, user_id, message_type, metadata, thread_id)
             VALUES ${valueStrings.join(', ')}`,
          values,
        );
        return true;
      } catch (error) {
        console.error('Error creating message:', { error });
        return false;
      }
    }, 'createMessages');
  }

  async createMessage(message: MessageEntity, threadId?: UUID): Promise<boolean> {
    return this.wrapDatabase(async () => {
      try {
        const thread_id = await this.createThreadIfNotExists(threadId, message?.content);
        await this.pool.query(
          `INSERT INTO messages (content, user_id, message_type, metadata, thread_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            message.content,
            message.userId,
            message.messageType,
            JSON.stringify(message.metadata),
            thread_id || null,
          ],
        );
        return true;
      } catch (error) {
        console.error('Error creating message:', { error });
        return false;
      }
    }, 'createMessage');
  }

  async getMessagesByUserId(userId: UUID, take?: number): Promise<MessageEntity[]> {
    return this.wrapDatabase(async () => {
      const { rows } = await this.pool.query(
        `SELECT * FROM messages 
         WHERE user_id = $1 AND ${this.getSoftDeleteCondition()}
         ORDER BY created_at DESC LIMIT $2`,
        [userId, take || 10],
      );
      return rows.reverse();
    }, 'getMessagesByUserId');
  }

  async getMessageById(messageId: UUID): Promise<MessageEntity | null> {
    return this.wrapDatabase(async () => {
      const { rows } = await this.pool.query(
        `SELECT * FROM messages WHERE id = $1 AND ${this.getSoftDeleteCondition()}`,
        [messageId],
      );
      return rows[0] || null;
    }, 'getMessageById');
  }

  private getSoftDeleteCondition(): string {
    return 'deleted_at IS NULL';
  }

  private markAsDeleted(tableName: string, id: UUID): Promise<boolean> {
    return this.wrapDatabase(async () => {
      try {
        await this.pool.query(
          `UPDATE ${tableName} SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL`,
          [id],
        );
        return true;
      } catch (error) {
        console.error(`Error soft deleting ${tableName}:`, {
          error: error instanceof Error ? error.message : String(error),
          id,
        });
        return false;
      }
    }, `markAsDeleted${tableName}`);
  }

  async getMessagesByThreadId(threadId: UUID, take?: number): Promise<MessageEntity[]> {
    return this.wrapDatabase(async () => {
      const { rows } = await this.pool.query(
        `SELECT * FROM messages 
         WHERE thread_id = $1 AND ${this.getSoftDeleteCondition()}
         ORDER BY created_at DESC LIMIT $2`,
        [threadId, take || 10],
      );
      return rows.reverse();
    }, 'getMessagesByThreadId');
  }

  async getUserByAddress(address: string): Promise<UserEntity | null> {
    return this.wrapDatabase(async () => {
      const { rows } = await this.pool.query(
        `SELECT * FROM users WHERE address = $1 AND ${this.getSoftDeleteCondition()}`,
        [address],
      );

      if (rows.length === 0) {
        console.debug('User not found:', { address });
        return null;
      }

      const user = rows[0];
      return {
        ...user,
        metadata: typeof user.metadata === 'string' ? JSON.parse(user.metadata) : user.metadata,
      };
    }, 'getUserByAddress');
  }

  async clearMessagesByUserId(userId: UUID): Promise<boolean> {
    return this.wrapDatabase(async () => {
      await this.pool.query(
        'UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND deleted_at IS NULL',
        [userId],
      );
      return true;
    }, 'clearMessagesByUserId');
  }

  async clearMessagesByThreadId(threadId: UUID): Promise<boolean> {
    return this.wrapDatabase(async () => {
      await this.pool.query(
        'UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE thread_id = $1 AND deleted_at IS NULL',
        [threadId],
      );
      return true;
    }, 'clearMessagesByThreadId');
  }
}
