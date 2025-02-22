import type { UserEntity, MessageEntity, UUID } from '../types/database';
import { CircuitBreaker } from './CircuitBreaker';

/**
 * An abstract class representing a database adapter for managing various entities
 * like accounts, memories, actors, goals, and rooms.
 */
export abstract class DatabaseAdapter<DB = any> {
  /**
   * The database instance.
   */
  db!: DB;

  /**
   * Circuit breaker instance used to handle fault tolerance and prevent cascading failures.
   * Implements the Circuit Breaker pattern to temporarily disable operations when a failure threshold is reached.
   *
   * The circuit breaker has three states:
   * - CLOSED: Normal operation, requests pass through
   * - OPEN: Failure threshold exceeded, requests are blocked
   * - HALF_OPEN: Testing if service has recovered
   *
   * @protected
   */
  protected circuitBreaker: CircuitBreaker;

  //   private readonly maxRetries: number = 3;
  //   private readonly baseDelay: number = 1000; // 1 second
  //   private readonly maxDelay: number = 10000; // 10 seconds
  //   private readonly jitterMax: number = 1000; // 1 second

  /**
   * Creates a new DatabaseAdapter instance with optional circuit breaker configuration.
   *
   * @param circuitBreakerConfig - Configuration options for the circuit breaker
   * @param circuitBreakerConfig.failureThreshold - Number of failures before circuit opens (defaults to 5)
   * @param circuitBreakerConfig.resetTimeout - Time in ms before attempting to close circuit (defaults to 60000)
   * @param circuitBreakerConfig.halfOpenMaxAttempts - Number of successful attempts needed to close circuit (defaults to 3)
   */
  constructor(circuitBreakerConfig?: {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenMaxAttempts?: number;
  }) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
  }

  /**
   * Optional initialization method for the database adapter.
   * @returns A Promise that resolves when initialization is complete.
   */
  abstract init(): Promise<void>;

  /**
   * Optional close method for the database adapter.
   * @returns A Promise that resolves when closing is complete.
   */
  abstract close(): Promise<void>;

  abstract createUser(user: UserEntity): Promise<boolean>;

  abstract createAndGetUserByAddress(user: UserEntity): Promise<UserEntity | null>;

  abstract getUserById(userId: UUID): Promise<UserEntity | null>;

  abstract getUserByAddress(address: string): Promise<UserEntity | null>;

  abstract createMessages(messages: MessageEntity[], threadId?: UUID): Promise<boolean>;

  abstract createMessage(message: MessageEntity, threadId?: UUID): Promise<boolean>;

  abstract getMessageById(messageId: UUID): Promise<MessageEntity | null>;

  abstract getMessagesByUserId(userId: UUID, take?: number): Promise<MessageEntity[]>;

  abstract getMessagesByThreadId(threadId: UUID, take?: number): Promise<MessageEntity[]>;

  abstract createThreadIfNotExists(threadId?: UUID, title?: string): Promise<UUID>;

  abstract clearMessagesByUserId(userId: UUID): Promise<boolean>;

  abstract clearMessagesByThreadId(threadId: UUID): Promise<boolean>;
  //   /**
  //    * Removes a specific room from the database.
  //    * @param roomId The UUID of the room to remove.
  //    * @returns A Promise that resolves when the room has been removed.
  //    */
  //   abstract removeRoom(roomId: UUID): Promise<void>;
  //   /**
  //    * Executes an operation with circuit breaker protection.
  //    * @param operation A function that returns a Promise to be executed with circuit breaker protection
  //    * @param context A string describing the context/operation being performed for logging purposes
  //    * @returns A Promise that resolves to the result of the operation
  //    * @throws Will throw an error if the circuit breaker is open or if the operation fails
  //    * @protected
  //    */
  protected async withCircuitBreaker<T>(operation: () => Promise<T>, context: string): Promise<T> {
    try {
      return await this.circuitBreaker.execute(operation);
    } catch (error) {
      console.error(`Circuit breaker error in ${context}:`, {
        error: error instanceof Error ? error.message : String(error),
        state: this.circuitBreaker.getState(),
      });
      throw error;
    }
  }
}
