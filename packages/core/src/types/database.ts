export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export interface UserEntity {
  /** Unique identifier */
  id?: UUID;

  /** Display name */
  name?: string;

  /** Username */
  username?: string;

  /** Optional additional details */
  metadata?: { [key: string]: any };

  /** Optional email */
  email?: string;

  /** Optional avatar URL */
  avatar_url?: string;

  address: string;
}

export interface MessageEntity {
  id?: UUID;
  content: string;
  message_type?: 'human' | 'ai';
  user_id?: UUID;
  thread_id?: UUID;
  metadata?: { [key: string]: any };
}

export interface ThreadEntity {
  id?: UUID;
  title?: string;
}
