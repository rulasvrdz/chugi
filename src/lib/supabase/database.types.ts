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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          id?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          business_id: string
          created_at: string
          geofence_radius_m: number
          id: string
          lat: number
          lng: number
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          geofence_radius_m?: number
          id?: string
          lat: number
          lng: number
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          geofence_radius_m?: number
          id?: string
          lat?: number
          lng?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      nfc_tags: {
        Row: {
          business_id: string
          created_at: string
          id: string
          key_ref: string
          last_counter: number
          location_id: string
          status: Database["public"]["Enums"]["tag_status"]
          uid: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          key_ref: string
          last_counter?: number
          location_id: string
          status?: Database["public"]["Enums"]["tag_status"]
          uid: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          key_ref?: string
          last_counter?: number
          location_id?: string
          status?: Database["public"]["Enums"]["tag_status"]
          uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfc_tags_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfc_tags_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          business_id: string
          code_hash: string
          created_at: string
          enrollment_id: string
          expires_at: string
          id: string
          redeemed_at: string | null
          redeemed_by: string | null
          stamp_program_id: string
          status: Database["public"]["Enums"]["redemption_status"]
        }
        Insert: {
          business_id: string
          code_hash: string
          created_at?: string
          enrollment_id: string
          expires_at: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          stamp_program_id: string
          status?: Database["public"]["Enums"]["redemption_status"]
        }
        Update: {
          business_id?: string
          code_hash?: string
          created_at?: string
          enrollment_id?: string
          expires_at?: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          stamp_program_id?: string
          status?: Database["public"]["Enums"]["redemption_status"]
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_stamp_program_id_fkey"
            columns: ["stamp_program_id"]
            isOneToOne: false
            referencedRelation: "stamp_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      stamp_programs: {
        Row: {
          business_id: string
          created_at: string
          id: string
          reward_description: string
          stamp_ttl_days: number
          stamps_required: number
          status: Database["public"]["Enums"]["program_status"]
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          reward_description: string
          stamp_ttl_days: number
          stamps_required: number
          status?: Database["public"]["Enums"]["program_status"]
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          reward_description?: string
          stamp_ttl_days?: number
          stamps_required?: number
          status?: Database["public"]["Enums"]["program_status"]
        }
        Relationships: [
          {
            foreignKeyName: "stamp_programs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          business_id: string
          captured_at: string
          created_at: string
          enrollment_id: string
          expires_at: string
          id: string
          lat: number | null
          lng: number | null
          location_id: string
          redemption_id: string | null
          sdm_counter: number
          stamp_program_id: string
          status: Database["public"]["Enums"]["visit_status"]
          synced_at: string | null
          tag_id: string
        }
        Insert: {
          business_id: string
          captured_at: string
          created_at?: string
          enrollment_id: string
          expires_at: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_id: string
          redemption_id?: string | null
          sdm_counter: number
          stamp_program_id: string
          status?: Database["public"]["Enums"]["visit_status"]
          synced_at?: string | null
          tag_id: string
        }
        Update: {
          business_id?: string
          captured_at?: string
          created_at?: string
          enrollment_id?: string
          expires_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_id?: string
          redemption_id?: string | null
          sdm_counter?: number
          stamp_program_id?: string
          status?: Database["public"]["Enums"]["visit_status"]
          synced_at?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_stamp_program_id_fkey"
            columns: ["stamp_program_id"]
            isOneToOne: false
            referencedRelation: "stamp_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "nfc_tags"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_redemption: {
        Args: { p_code: string; p_redemption_id: string }
        Returns: boolean
      }
      is_manager_of: { Args: { p_business_id: string }; Returns: boolean }
      is_member_of: { Args: { p_business_id: string }; Returns: boolean }
      request_redemption: {
        Args: { p_enrollment_id: string }
        Returns: {
          code: string
          expires_at: string
          redemption_id: string
        }[]
      }
    }
    Enums: {
      member_role: "owner" | "manager" | "staff"
      program_status: "active" | "inactive"
      redemption_status: "pending" | "redeemed" | "expired"
      tag_status: "active" | "revoked"
      visit_status: "pending_sync" | "confirmed" | "rejected" | "duplicate"
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
    Enums: {
      member_role: ["owner", "manager", "staff"],
      program_status: ["active", "inactive"],
      redemption_status: ["pending", "redeemed", "expired"],
      tag_status: ["active", "revoked"],
      visit_status: ["pending_sync", "confirmed", "rejected", "duplicate"],
    },
  },
} as const
