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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          avg_pace_s_per_km: number | null
          created_at: string
          date: string
          distance_m: number | null
          duration_s: number | null
          external_id: string | null
          id: string
          notes: string | null
          perceived_effort: number | null
          source: string
          sport: string
          user_id: string
        }
        Insert: {
          avg_pace_s_per_km?: number | null
          created_at?: string
          date: string
          distance_m?: number | null
          duration_s?: number | null
          external_id?: string | null
          id?: string
          notes?: string | null
          perceived_effort?: number | null
          source?: string
          sport: string
          user_id: string
        }
        Update: {
          avg_pace_s_per_km?: number | null
          created_at?: string
          date?: string
          distance_m?: number | null
          duration_s?: number | null
          external_id?: string | null
          id?: string
          notes?: string | null
          perceived_effort?: number | null
          source?: string
          sport?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_sport_fkey"
            columns: ["user_id", "sport"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["user_id", "slug"]
          },
        ]
      }
      body_metrics: {
        Row: {
          bio_score: number | null
          created_at: string
          date: string
          id: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          bio_score?: number | null
          created_at?: string
          date: string
          id?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          bio_score?: number | null
          created_at?: string
          date?: string
          id?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account: string | null
          amount: number
          category: string
          created_at: string
          guilty: boolean
          id: string
          note: string | null
          source: string
          source_ts: string | null
          spent_on: string
          unlabeled: boolean
          user_id: string
          wallet_category: string | null
        }
        Insert: {
          account?: string | null
          amount: number
          category: string
          created_at?: string
          guilty?: boolean
          id?: string
          note?: string | null
          source?: string
          source_ts?: string | null
          spent_on: string
          unlabeled?: boolean
          user_id?: string
          wallet_category?: string | null
        }
        Update: {
          account?: string | null
          amount?: number
          category?: string
          created_at?: string
          guilty?: boolean
          id?: string
          note?: string | null
          source?: string
          source_ts?: string | null
          spent_on?: string
          unlabeled?: boolean
          user_id?: string
          wallet_category?: string | null
        }
        Relationships: []
      }
      money_moves: {
        Row: {
          account: string
          amount: number
          created_at: string
          id: string
          kind: string
          note: string | null
          occurred_at: string
          source_ts: string | null
          to_account: string | null
          user_id: string
        }
        Insert: {
          account: string
          amount: number
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          occurred_at: string
          source_ts?: string | null
          to_account?: string | null
          user_id: string
        }
        Update: {
          account?: string
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          occurred_at?: string
          source_ts?: string | null
          to_account?: string | null
          user_id?: string
        }
        Relationships: []
      }
      spend_categories: {
        Row: {
          emoji: string
          key: string
          kind: string
          label: string
          sort: number
          user_id: string
        }
        Insert: {
          emoji?: string
          key: string
          kind?: string
          label: string
          sort?: number
          user_id: string
        }
        Update: {
          emoji?: string
          key?: string
          kind?: string
          label?: string
          sort?: number
          user_id?: string
        }
        Relationships: []
      }
      spend_month_plans: {
        Row: {
          buffer: number
          category_budgets: Json
          created_at: string
          food_budget: number
          investments: number
          month: string
          salary: number
          savings_target: number
          transport_budget: number
          user_id: string
          week_weights: Json
        }
        Insert: {
          buffer?: number
          category_budgets?: Json
          created_at?: string
          food_budget?: number
          investments?: number
          month: string
          salary?: number
          savings_target?: number
          transport_budget?: number
          user_id: string
          week_weights?: Json
        }
        Update: {
          buffer?: number
          category_budgets?: Json
          created_at?: string
          food_budget?: number
          investments?: number
          month?: string
          salary?: number
          savings_target?: number
          transport_budget?: number
          user_id?: string
          week_weights?: Json
        }
        Relationships: []
      }
      wait_list: {
        Row: {
          added_at: string
          category: string
          created_at: string
          decided_at: string | null
          decision: string
          id: string
          item: string
          price: number
          user_id: string
        }
        Insert: {
          added_at?: string
          category: string
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          item: string
          price: number
          user_id: string
        }
        Update: {
          added_at?: string
          category?: string
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          item?: string
          price?: number
          user_id?: string
        }
        Relationships: []
      }
      days: {
        Row: {
          blocker_code: string | null
          blocker_note: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          sleep_time: string | null
          user_id: string
          wake_time: string | null
        }
        Insert: {
          blocker_code?: string | null
          blocker_note?: string | null
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          sleep_time?: string | null
          user_id: string
          wake_time?: string | null
        }
        Update: {
          blocker_code?: string | null
          blocker_note?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          sleep_time?: string | null
          user_id?: string
          wake_time?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          height_cm: number | null
          id: string
          timezone: string
          wake_target: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          id: string
          timezone?: string
          wake_target?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          id?: string
          timezone?: string
          wake_target?: string
        }
        Relationships: []
      }
      spend_settings: {
        Row: {
          updated_at: string
          user_id: string
          weekly_budget: number
        }
        Insert: {
          updated_at?: string
          user_id?: string
          weekly_budget?: number
        }
        Update: {
          updated_at?: string
          user_id?: string
          weekly_budget?: number
        }
        Relationships: []
      }
      naps: {
        Row: {
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          end_time: string
          id?: string
          start_time: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: []
      }
      sports: {
        Row: {
          created_at: string
          has_distance: boolean
          label: string
          position: number
          slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_distance?: boolean
          label: string
          position?: number
          slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_distance?: boolean
          label?: string
          position?: number
          slug?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_default_sports: { Args: { target: string }; Returns: undefined }
      seed_default_spend_categories: { Args: { target: string }; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
