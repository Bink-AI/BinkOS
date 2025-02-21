import { ChatOpenAI } from '@langchain/openai';
import {
  AgentExecutor,
  createOpenAIFunctionsAgent,
  createOpenAIToolsAgent,
} from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { IWallet } from '../wallet/types';
import { NetworksConfig } from '../network/types';
import { AgentConfig, AgentContext, AgentExecuteParams, IAgent } from './types';
import { GetWalletAddressTool, ITool } from './tools';
import { BaseAgent } from './BaseAgent';
import { IPlugin } from '../plugin/types';
import { DatabaseAdapter } from '../storage';
import { UUID } from '../types';

export class Agent extends BaseAgent {
  private model: ChatOpenAI;
  private wallet: IWallet;
  private executor!: AgentExecutor;
  private networks: NetworksConfig['networks'];
  private db: DatabaseAdapter<any> | undefined;
  private context: AgentContext = {};
  private config: AgentConfig;

  constructor(config: AgentConfig, wallet: IWallet, networks: NetworksConfig['networks']) {
    super();
    this.wallet = wallet;
    this.networks = networks;
    this.config = config;
    this.model = new ChatOpenAI({
      modelName: config.model,
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens,
    });

    this.initializeDefaultTools();
  }

  getContext(): AgentContext {
    return this.context;
  }

  async initialize() {
    await this.initializeContext();
    await this.initializeExecutor();
  }

  private initializeDefaultTools(): void {
    const defaultTools = [new GetWalletAddressTool({})];

    // Initialize default tools
    for (const tool of defaultTools) {
      this.registerTool(tool);
    }
  }

  async registerTool(tool: ITool): Promise<void> {
    tool.setAgent(this);
    this.tools.push(tool.createTool());
    this.initializeExecutor();
  }

  async registerPlugin(plugin: IPlugin): Promise<void> {
    const pluginName = plugin.getName();
    this.plugins.set(pluginName, plugin);

    // Register all tools from the plugin
    const tools = plugin.getTools();
    for (const tool of tools) {
      await this.registerTool(tool);
    }
    this.initializeExecutor();
  }

  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  protected async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (plugin) {
      await plugin.cleanup();
      this.plugins.delete(name);

      // Recreate tools array without this plugin's tools
      const pluginToolNames = new Set(plugin.getTools().map(t => t.getName()));
      this.tools = this.tools.filter(t => !pluginToolNames.has(t.name));

      // Reinitialize executor with updated tools
      await this.onToolsUpdated();
    }
  }

  protected async onToolsUpdated(): Promise<void> {
    await this.initializeExecutor();
  }

  private async initializeExecutor(): Promise<void> {
    this.executor = await this.createExecutor();
  }

  async registerDatabase(database: DatabaseAdapter<any> | undefined): Promise<void> {
    try {
      if (database) {
        this.db = database;
        await this.db.init();
        console.info('✓ Database initialized\n');
      }
    } catch (error) {
      console.error('Failed to connect to Postgres:', error);
      throw error; // Re-throw to handle it in the calling code
    }
  }

  async initializeContext(): Promise<AgentContext | null> {
    if (!this.db) return null;
    const networkNames = Object.keys(this.networks);
    if (networkNames.length) {
      const defaultNetwork = networkNames[0];
      const address = await this.wallet?.getAddress(defaultNetwork);
      if (!address) throw new Error('Not found wallet address');
      // Get or create user
      const user = await this.db.createAndGetUserByAddress({ address });
      this.context.user = user;
      if (user?.id) {
        // Create default thread for this user
        const threadId = await this.db?.createThreadIfNotExists();
        this.context.threadId = threadId;
      }
      return this.context;
    }
    return null;
  }

  async resetThread(): Promise<UUID | undefined> {
    if (this.db) {
      // Create new thread
      const threadId = await this.db?.createThreadIfNotExists();
      this.context.threadId = threadId;
      return threadId;
    }
  }

  private async createExecutor(): Promise<AgentExecutor> {
    const supportedNetworkPrompt = `Available networks include: ${Object.keys(this.networks).join(
      ', ',
    )}`;

    const defaultSystemPrompt = `You are a helpful blockchain agent. You can help users interact with different blockchain networks.`;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `${this.config.systemPrompt ?? defaultSystemPrompt}\n${supportedNetworkPrompt}`],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = createOpenAIToolsAgent({
      llm: this.model,
      tools: this.getTools(),
      prompt,
    });

    return AgentExecutor.fromAgentAndTools({
      agent: await agent,
      tools: this.getTools(),
    });
  }

  async clearUserMessages(address?: string): Promise<boolean> {
    if (this.db) {
      if (address) {
        // Get user by address and clear their messages
        const user = await this.db.getUserByAddress(address);
        if (user?.id) {
          return await this.db.clearMessagesByUserId(user.id);
        }
      } else if (this.context?.user?.id) {
        // Use context user if no address provided
        return await this.db.clearMessagesByUserId(this.context.user.id);
      }
    }
    return false;
  }

  async clearThreadMessages(threadId: UUID): Promise<boolean> {
    if (this.db) {
      return await this.db.clearMessagesByThreadId(threadId);
    }
    return false;
  }

  public async execute(commandOrParams: string | AgentExecuteParams): Promise<any> {
    // Wait for executor to be initialized if it hasn't been already
    if (!this.executor) {
      await this.initializeExecutor();
    }
    if (!Object.keys(this.context).length) {
      await this.initializeContext();
    }
    let _history: any = [];
    if (this.db) {
      if (typeof commandOrParams === 'string') {
        if (this.context?.user?.id) {
          _history = await this.db?.getMessagesByUserId(this.context?.user?.id);
        }
      } else {
        if (commandOrParams?.threadId) {
          _history = await this.db?.getMessagesByThreadId(commandOrParams?.threadId);
        }
      }
    }
    const history = _history.map((message: any) =>
      message?.messageType === 'human'
        ? new HumanMessage(message?.content)
        : new AIMessage(message?.content),
    );
    let result: any;
    if (typeof commandOrParams === 'string') {
      result = await this.executor.invoke({
        input: commandOrParams,
        chat_history: history,
      });
    } else {
      const messages: BaseMessage[] = commandOrParams.history ?? [];
      result = await this.executor.invoke({
        input: commandOrParams.input,
        chat_history: history,
      });
    }
    this.db?.createMessage(
      {
        content: typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input,
        userId: this.context?.user?.id,
        messageType: 'human',
      },
      this.context?.threadId,
    );
    this.db?.createMessage(
      {
        content: result.output,
        userId: this.context?.user?.id,
        messageType: 'ai',
      },
      this.context?.threadId,
    );
    return result.output;
  }

  public getWallet(): IWallet {
    return this.wallet;
  }

  public getNetworks(): NetworksConfig['networks'] {
    return this.networks;
  }
}
