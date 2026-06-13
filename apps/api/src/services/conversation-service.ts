/**
 * Conversation Intelligence Agent service.
 * Handles chat creation, message persistence, and streaming AI responses with tools.
 */

import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createSupabaseAdmin, type Database } from '@mantleagents/db';
import { resolveModel, type ConversationModelId } from './model-router.js';
import { getActiveToolsFromGroups } from './tool-groups.js';
import { conversationTools, MAX_TOOL_CALLS_PER_TURN } from './tool-orchestrator.js';

type ConversationChatRow = Database['public']['Tables']['conversation_chats']['Row'];
type ConversationMessageRow = Database['public']['Tables']['conversation_messages']['Row'];

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getProvider() {
  const authType = process.env.GEMINI_CLI_AUTH_TYPE || 'oauth-personal';
  if (authType === 'api-key') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (apiKey) {
      return createGoogleGenerativeAI({ apiKey }) as ReturnType<typeof createGeminiProvider>;
    }
  }
  return createGeminiProvider({ authType: 'oauth-personal' });
}

const SYSTEM_PROMPT = `You are AutoClaw, an AI crypto trading intelligence agent on the MantleAgents platform. You are direct, confident, and helpful — like a senior crypto analyst.

You have access to real-time tools:
- **getCryptoPrices**: Live token prices from AVE DEX data
- **searchNews**: Latest crypto and market news via Parallel AI
- **getSocialSentiment**: X/Twitter sentiment via Grok

## HOW TO RESPOND

**For price questions** (e.g. "price of BTC", "how much is ETH"):
→ Call getCryptoPrices immediately. Give the price, 24h change, and a brief market context.

**For market outlook questions** (e.g. "will BTC go up?", "is ETH bullish?"):
→ Give a direct analysis based on current data. Use searchNews for recent catalysts. State your view clearly — "Based on current data, BTC shows bullish momentum because..." Don't hedge excessively.

**For news questions**: Call searchNews and summarize key findings.

**For general crypto questions**: Answer directly from your knowledge. Be concise.

## RULES
- Always give a concrete answer, not just "it depends"
- For price predictions: give a short-term directional view with reasoning
- Keep responses under 200 words unless detail is needed
- Format in Markdown with **bold** for key numbers and signals
- Never say "I can't predict" — instead say "Based on current data..."

You are part of an autonomous trading platform. Users trust you for real insights.`;

export interface CreateChatResult {
  id: string;
  walletAddress: string;
  title: string;
  createdAt: string;
}

export async function createChat(walletAddress: string): Promise<CreateChatResult> {
  const { data, error } = await supabaseAdmin
    .from('conversation_chats')
    .insert({
      wallet_address: walletAddress,
      title: 'New chat',
    })
    .select('id, wallet_address, title, created_at')
    .single();

  if (error) throw new Error(`Failed to create chat: ${error.message}`);
  const row = data as ConversationChatRow;

  return {
    id: row.id,
    walletAddress: row.wallet_address,
    title: row.title ?? 'New chat',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export async function getLatestChat(walletAddress: string): Promise<ConversationChatRow | null> {
  const { data, error } = await supabaseAdmin
    .from('conversation_chats')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as ConversationChatRow;
}

export async function getChat(
  chatId: string,
  walletAddress: string
): Promise<ConversationChatRow | null> {
  const { data, error } = await supabaseAdmin
    .from('conversation_chats')
    .select('*')
    .eq('id', chatId)
    .eq('wallet_address', walletAddress)
    .single();

  if (error || !data) return null;
  return data as ConversationChatRow;
}

export async function updateChatEnabledTools(
  chatId: string,
  walletAddress: string,
  enabledTools: string[]
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('conversation_chats')
    .update({ enabled_tools: enabledTools.length > 0 ? enabledTools : null, updated_at: new Date().toISOString() } as any)
    .eq('id', chatId)
    .eq('wallet_address', walletAddress);

  if (error) throw new Error(`Failed to update chat tools: ${error.message}`);
}

export async function getMessages(
  chatId: string,
  walletAddress: string
): Promise<ConversationMessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from('conversation_messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as ConversationMessageRow[];
}

function toModelMessages(rows: ConversationMessageRow[]): ModelMessage[] {
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant' || r.role === 'system')
    .map((r) => ({
      role: r.role as 'user' | 'assistant' | 'system',
      content: r.content,
    }));
}

export interface SendMessageParams {
  chatId: string;
  walletAddress: string;
  content: string;
  modelId: ConversationModelId;
  /** Tool group IDs to enable. If omitted, uses chat.enabled_tools or all. */
  enabledTools?: string[] | null;
}

export interface SendMessageStreamResult {
  response: Response;
  modelRequested: string;
  modelRouted: string;
  usedFallback: boolean;
}

export async function sendMessageStream(params: SendMessageParams): Promise<SendMessageStreamResult> {
  const { chatId, walletAddress, content, modelId, enabledTools: paramEnabledTools } = params;

  const chat = await getChat(chatId, walletAddress);
  if (!chat) throw new Error('Chat not found');

  const enabledGroups = paramEnabledTools ?? (chat as { enabled_tools?: string[] | null }).enabled_tools ?? null;
  const activeToolNames = getActiveToolsFromGroups(enabledGroups);

  const routing = resolveModel(modelId);
  const model = getProvider()(routing.routedModelId);

  const existingMessages = await getMessages(chatId, walletAddress);
  const coreMessages = toModelMessages(existingMessages);
  coreMessages.push({ role: 'user', content });

  const userMessage = await supabaseAdmin
    .from('conversation_messages')
    .insert({
      chat_id: chatId,
      wallet_address: walletAddress,
      role: 'user',
      content,
    })
    .select('id')
    .single();

  if (userMessage.error) throw new Error(`Failed to save user message: ${userMessage.error.message}`);

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: coreMessages,
    tools: conversationTools,
    activeTools:
      activeToolNames.length > 0
        ? (activeToolNames as (keyof typeof conversationTools)[])
        : undefined,
    stopWhen: stepCountIs(MAX_TOOL_CALLS_PER_TURN),
    onFinish: async ({ text }) => {
      await supabaseAdmin.from('conversation_messages').insert({
        chat_id: chatId,
        wallet_address: walletAddress,
        role: 'assistant',
        content: text ?? '',
        model_requested: routing.requestedModelId,
        model_routed: routing.routedModelId,
        tool_calls_json: [],
      });
      await supabaseAdmin
        .from('conversation_chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId)
        .eq('wallet_address', walletAddress);
    },
  });

  const response = result.toUIMessageStreamResponse({
    headers: {
      'X-Model-Requested': routing.requestedModelId,
      'X-Model-Routed': routing.routedModelId,
      'X-Model-Used-Fallback': routing.usedFallback ? 'true' : 'false',
    },
    onError: (err) => (err instanceof Error ? err.message : 'Unknown error'),
  });

  return {
    response,
    modelRequested: routing.requestedModelId,
    modelRouted: routing.routedModelId,
    usedFallback: routing.usedFallback,
  };
}
