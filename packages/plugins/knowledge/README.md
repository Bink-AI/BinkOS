# @binkai/knowledge-plugin

A powerful knowledge base and information retrieval plugin for BinkOS that provides AI-powered access to project documentation, market insights, and blockchain ecosystem information.

## Overview

The knowledge plugin enables natural language queries about the BinkAI project, blockchain ecosystems, and DeFi markets through the BinkOS agent system. It provides intelligent information retrieval and context-aware responses using advanced language models.

## Features

- 🧠 **AI-Powered Knowledge Base**: Access to comprehensive project information

  - Project documentation
  - Protocol specifications
  - Market insights
  - Ecosystem information

- 🤖 **Intelligent Querying**: Natural language understanding and response generation
- 📚 **Extensible Knowledge**: Easy addition of new information sources
- 🔌 **Provider Architecture**: Support for multiple knowledge providers
- 🎯 **Context-Aware**: Responses tailored to specific queries and contexts

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/knowledge-plugin

# Install required peer dependencies
pnpm add @binkai/core
```

## Usage

Here's how to integrate and use the knowledge plugin with BinkOS:

```typescript
import { KnowledgePlugin } from '@binkai/knowledge-plugin';
import { BinkProvider } from '@binkai/bink-provider';

// Create and configure the knowledge plugin
const knowledgePlugin = new KnowledgePlugin();

// Initialize Bink provider with API credentials
const binkProvider = new BinkProvider({
  apiKey: process.env.BINK_API_KEY,
  baseUrl: process.env.BINK_API_URL,
});

// Initialize the plugin
await knowledgePlugin.initialize({
  providers: [binkProvider],
});

// Register with BinkOS agent
await agent.registerPlugin(knowledgePlugin);

// Execute knowledge queries through natural language
const result = await agent.execute({
  input: 'What is the purpose of the BinkAI project?',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/knowledge-example.ts](../../../examples/basic/src/knowledge-example.ts).

## Supported Knowledge Providers

Each knowledge provider can be configured separately:

### Bink Provider

```typescript
const binkProvider = new BinkProvider({
  apiKey: 'your_bink_api_key',
  baseUrl: 'your_bink_api_url',
});
```

## Configuration Options

The plugin accepts the following configuration options:

```typescript
interface KnowledgePluginConfig {
  providers: KnowledgeProvider[]; // Array of knowledge providers
}
```

## Natural Language Commands

The plugin supports various natural language queries through the BinkOS agent:

- `What is [topic/concept]?`
- `Explain how [feature/protocol] works`
- `Tell me about [project aspect]`
- `Describe the purpose of [component]`
- More query patterns supported...

## Environment Setup

Required environment variables:

```bash
OPENAI_API_KEY=your_openai_api_key
BINK_API_KEY=your_bink_api_key
BINK_API_URL=your_bink_api_url
```

## Knowledge Domains

The plugin provides information about various domains including:

- Project architecture and components
- Protocol specifications
- Market dynamics
- Blockchain ecosystems
- DeFi concepts and strategies
- Technical implementation details

## Development

```bash
# Install dependencies
pnpm install

# Build the plugin
pnpm build

# Run tests
pnpm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This package is part of the BinkOS project. All rights reserved.

## Related Packages

- [@binkai/core](../../core/README.md) - Core BinkOS functionality
- [@binkai/bink-provider](../providers/bink/README.md) - Bink knowledge provider integration
