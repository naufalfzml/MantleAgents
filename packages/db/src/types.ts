export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_configs: {
        Row: {
          active: boolean | null
          agent_8004_id: number | null
          agent_8004_tx_hash: string | null
          agent_type: string
          allowed_currencies: string[] | null
          blocked_currencies: string[] | null
          created_at: string | null
          custom_prompt: string | null
          daily_trade_limit: number | null
          frequency: string | null
          id: string
          last_run_at: string | null
          max_allocation_pct: number | null
          max_trade_size_pct: number | null
          next_run_at: string | null
          server_wallet_address: string | null
          server_wallet_id: string | null
          stop_loss_pct: number | null
          strategy_params: Json | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          active?: boolean | null
          agent_8004_id?: number | null
          agent_8004_tx_hash?: string | null
          agent_type?: string
          allowed_currencies?: string[] | null
          blocked_currencies?: string[] | null
          created_at?: string | null
          custom_prompt?: string | null
          daily_trade_limit?: number | null
          frequency?: string | null
          id?: string
          last_run_at?: string | null
          max_allocation_pct?: number | null
          max_trade_size_pct?: number | null
          next_run_at?: string | null
          server_wallet_address?: string | null
          server_wallet_id?: string | null
          stop_loss_pct?: number | null
          strategy_params?: Json | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          active?: boolean | null
          agent_8004_id?: number | null
          agent_8004_tx_hash?: string | null
          agent_type?: string
          allowed_currencies?: string[] | null
          blocked_currencies?: string[] | null
          created_at?: string | null
          custom_prompt?: string | null
          daily_trade_limit?: number | null
          frequency?: string | null
          id?: string
          last_run_at?: string | null
          max_allocation_pct?: number | null
          max_trade_size_pct?: number | null
          next_run_at?: string | null
          server_wallet_address?: string | null
          server_wallet_id?: string | null
          stop_loss_pct?: number | null
          strategy_params?: Json | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      agent_positions: {
        Row: {
          avg_entry_rate: number | null
          balance: number | null
          id: string
          token_address: string
          token_symbol: string
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          avg_entry_rate?: number | null
          balance?: number | null
          id?: string
          token_address: string
          token_symbol: string
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          avg_entry_rate?: number | null
          balance?: number | null
          id?: string
          token_address?: string
          token_symbol?: string
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_positions_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      agent_timeline: {
        Row: {
          amount_usd: number | null
          citations: Json | null
          confidence_pct: number | null
          created_at: string | null
          currency: string | null
          detail: Json | null
          direction: string | null
          event_type: string
          id: string
          run_id: string | null
          summary: string
          tx_hash: string | null
          wallet_address: string
        }
        Insert: {
          amount_usd?: number | null
          citations?: Json | null
          confidence_pct?: number | null
          created_at?: string | null
          currency?: string | null
          detail?: Json | null
          direction?: string | null
          event_type: string
          id?: string
          run_id?: string | null
          summary: string
          tx_hash?: string | null
          wallet_address: string
        }
        Update: {
          amount_usd?: number | null
          citations?: Json | null
          confidence_pct?: number | null
          created_at?: string | null
          currency?: string | null
          detail?: Json | null
          direction?: string | null
          event_type?: string
          id?: string
          run_id?: string | null
          summary?: string
          tx_hash?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_timeline_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          system_prompt: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          system_prompt?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          system_prompt?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_chats: {
        Row: {
          id: string
          wallet_address: string
          title: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          wallet_address: string
          title?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          wallet_address?: string
          title?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_chats_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          id: string
          chat_id: string
          wallet_address: string
          role: string
          content: string
          model_requested: string | null
          model_routed: string | null
          tool_calls_json: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          wallet_address: string
          role: string
          content: string
          model_requested?: string | null
          model_routed?: string | null
          tool_calls_json?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          wallet_address?: string
          role?: string
          content?: string
          model_requested?: string | null
          model_routed?: string | null
          tool_calls_json?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "conversation_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      fx_agent_timeline: {
        Row: {
          amount_usd: number | null
          citations: Json | null
          confidence_pct: number | null
          created_at: string | null
          currency: string | null
          detail: Json | null
          direction: string | null
          event_type: string
          id: string
          run_id: string | null
          summary: string
          tx_hash: string | null
          wallet_address: string
        }
        Insert: {
          amount_usd?: number | null
          citations?: Json | null
          confidence_pct?: number | null
          created_at?: string | null
          currency?: string | null
          detail?: Json | null
          direction?: string | null
          event_type: string
          id?: string
          run_id?: string | null
          summary: string
          tx_hash?: string | null
          wallet_address: string
        }
        Update: {
          amount_usd?: number | null
          citations?: Json | null
          confidence_pct?: number | null
          created_at?: string | null
          currency?: string | null
          detail?: Json | null
          direction?: string | null
          event_type?: string
          id?: string
          run_id?: string | null
          summary?: string
          tx_hash?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_agent_timeline_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          role: string | null
          tool_calls: Json | null
          tool_results: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          crawled_at: string | null
          id: string
          published_at: string | null
          related_tokens: string[] | null
          sentiment: string | null
          source_name: string | null
          source_url: string
          summary: string | null
          tickers: string[] | null
          title: string
        }
        Insert: {
          crawled_at?: string | null
          id?: string
          published_at?: string | null
          related_tokens?: string[] | null
          sentiment?: string | null
          source_name?: string | null
          source_url: string
          summary?: string | null
          tickers?: string[] | null
          title: string
        }
        Update: {
          crawled_at?: string | null
          id?: string
          published_at?: string | null
          related_tokens?: string[] | null
          sentiment?: string | null
          source_name?: string | null
          source_url?: string
          summary?: string | null
          tickers?: string[] | null
          title?: string
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          holdings: Json | null
          id: string
          snapshot_at: string | null
          total_value_usd: number | null
          user_id: string | null
        }
        Insert: {
          holdings?: Json | null
          id?: string
          snapshot_at?: string | null
          total_value_usd?: number | null
          user_id?: string | null
        }
        Update: {
          holdings?: Json | null
          id?: string
          snapshot_at?: string | null
          total_value_usd?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sip_configs: {
        Row: {
          allowance_tx_hash: string | null
          amount: number
          created_at: string | null
          day_of_month: number | null
          day_of_week: number | null
          frequency: string | null
          id: string
          is_active: boolean | null
          next_execution: string | null
          source_token: string
          target_token: string
          total_executions: number | null
          total_invested: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          allowance_tx_hash?: string | null
          amount: number
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          next_execution?: string | null
          source_token: string
          target_token: string
          total_executions?: number | null
          total_invested?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          allowance_tx_hash?: string | null
          amount?: number
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          next_execution?: string | null
          source_token?: string
          target_token?: string
          total_executions?: number | null
          total_invested?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sip_configs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_price_snapshots: {
        Row: {
          id: string
          price_usd: number
          snapshot_at: string | null
          token_symbol: string
        }
        Insert: {
          id?: string
          price_usd: number
          snapshot_at?: string | null
          token_symbol: string
        }
        Update: {
          id?: string
          price_usd?: number
          snapshot_at?: string | null
          token_symbol?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          created_at: string | null
          exchange_rate: number | null
          id: string
          sip_id: string | null
          source_amount: number
          source_token: string
          status: string | null
          target_amount: number
          target_token: string
          tx_hash: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          exchange_rate?: number | null
          id?: string
          sip_id?: string | null
          source_amount: number
          source_token: string
          status?: string | null
          target_amount: number
          target_token: string
          tx_hash?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          exchange_rate?: number | null
          id?: string
          sip_id?: string | null
          source_amount?: number
          source_token?: string
          status?: string | null
          target_amount?: number
          target_token?: string
          tx_hash?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_sip_id_fkey"
            columns: ["sip_id"]
            isOneToOne: false
            referencedRelation: "sip_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          auth_method: string | null
          created_at: string | null
          display_name: string | null
          id: string
          n8n_workflow_id: string | null
          onboarding_completed: boolean | null
          preferred_currencies: string[] | null
          risk_answers: Json | null
          risk_profile: string | null
          selfclaw_agent_name: string | null
          selfclaw_human_id: string | null
          selfclaw_private_key: string | null
          selfclaw_public_key: string | null
          selfclaw_session_id: string | null
          selfclaw_verified: boolean | null
          selfclaw_verified_at: string | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          auth_method?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          n8n_workflow_id?: string | null
          onboarding_completed?: boolean | null
          preferred_currencies?: string[] | null
          risk_answers?: Json | null
          risk_profile?: string | null
          selfclaw_agent_name?: string | null
          selfclaw_human_id?: string | null
          selfclaw_private_key?: string | null
          selfclaw_public_key?: string | null
          selfclaw_session_id?: string | null
          selfclaw_verified?: boolean | null
          selfclaw_verified_at?: string | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          auth_method?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          n8n_workflow_id?: string | null
          onboarding_completed?: boolean | null
          preferred_currencies?: string[] | null
          risk_answers?: Json | null
          risk_profile?: string | null
          selfclaw_agent_name?: string | null
          selfclaw_human_id?: string | null
          selfclaw_private_key?: string | null
          selfclaw_public_key?: string | null
          selfclaw_session_id?: string | null
          selfclaw_verified?: boolean | null
          selfclaw_verified_at?: string | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      yield_agent_timeline: {
        Row: {
          amount_usd: number | null
          citations: Json | null
          confidence_pct: number | null
          created_at: string | null
          currency: string | null
          detail: Json | null
          direction: string | null
          event_type: string
          id: string
          run_id: string | null
          summary: string
          tx_hash: string | null
          wallet_address: string
        }
        Insert: {
          amount_usd?: number | null
          citations?: Json | null
          confidence_pct?: number | null
          created_at?: string | null
          currency?: string | null
          detail?: Json | null
          direction?: string | null
          event_type: string
          id?: string
          run_id?: string | null
          summary: string
          tx_hash?: string | null
          wallet_address: string
        }
        Update: {
          amount_usd?: number | null
          citations?: Json | null
          confidence_pct?: number | null
          created_at?: string | null
          currency?: string | null
          detail?: Json | null
          direction?: string | null
          event_type?: string
          id?: string
          run_id?: string | null
          summary?: string
          tx_hash?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "yield_agent_timeline_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      yield_positions: {
        Row: {
          created_at: string | null
          current_apr: number | null
          deposit_amount_usd: number
          deposit_token: string
          deposited_at: string | null
          id: string
          last_checked_at: string | null
          lp_shares: number
          protocol: string
          updated_at: string | null
          vault_address: string
          wallet_address: string
        }
        Insert: {
          created_at?: string | null
          current_apr?: number | null
          deposit_amount_usd?: number
          deposit_token: string
          deposited_at?: string | null
          id?: string
          last_checked_at?: string | null
          lp_shares?: number
          protocol?: string
          updated_at?: string | null
          vault_address: string
          wallet_address: string
        }
        Update: {
          created_at?: string | null
          current_apr?: number | null
          deposit_amount_usd?: number
          deposit_token?: string
          deposited_at?: string | null
          id?: string
          last_checked_at?: string | null
          lp_shares?: number
          protocol?: string
          updated_at?: string | null
          vault_address?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "yield_positions_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      overview_cache: {
        Row: {
          cache_key: string
          payload: Record<string, unknown>
          cached_at: string
        }
        Insert: {
          cache_key: string
          payload: Record<string, unknown>
          cached_at?: string
        }
        Update: {
          cache_key?: string
          payload?: Record<string, unknown>
          cached_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_snapshots: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
