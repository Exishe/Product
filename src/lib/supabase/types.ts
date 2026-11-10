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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_actions: {
        Row: {
          approved_by: string | null
          conversation_id: string
          created_at: string
          executed_at: string | null
          id: string
          input: Json
          restaurant_id: string
          result: Json | null
          status: string
          tool: string
        }
        Insert: {
          approved_by?: string | null
          conversation_id: string
          created_at?: string
          executed_at?: string | null
          id?: string
          input: Json
          restaurant_id: string
          result?: Json | null
          status?: string
          tool: string
        }
        Update: {
          approved_by?: string | null
          conversation_id?: string
          created_at?: string
          executed_at?: string | null
          id?: string
          input?: Json
          restaurant_id?: string
          result?: Json | null
          status?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_restaurant_id_conversation_id_fkey"
            columns: ["restaurant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          member_id: string
          restaurant_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          restaurant_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          restaurant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_restaurant_id_member_id_fkey"
            columns: ["restaurant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string
          id: number
          input_tokens: number | null
          output_tokens: number | null
          restaurant_id: string
          role: string
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string
          id?: never
          input_tokens?: number | null
          output_tokens?: number | null
          restaurant_id: string
          role: string
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string
          id?: never
          input_tokens?: number | null
          output_tokens?: number | null
          restaurant_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_restaurant_id_conversation_id_fkey"
            columns: ["restaurant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      areas: {
        Row: {
          id: string
          location_id: string
          name: string
          restaurant_id: string
          sort: number
        }
        Insert: {
          id?: string
          location_id: string
          name: string
          restaurant_id: string
          sort?: number
        }
        Update: {
          id?: string
          location_id?: string
          name?: string
          restaurant_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "areas_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          actor_user_id: string | null
          created_at: string
          data: Json
          entity: string
          entity_id: string | null
          id: number
          location_id: string | null
          restaurant_id: string | null
        }
        Insert: {
          action: string
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          actor_user_id?: string | null
          created_at?: string
          data?: Json
          entity: string
          entity_id?: string | null
          id?: never
          location_id?: string | null
          restaurant_id?: string | null
        }
        Update: {
          action?: string
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          actor_user_id?: string | null
          created_at?: string
          data?: Json
          entity?: string
          entity_id?: string | null
          id?: never
          location_id?: string | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_discounts: {
        Row: {
          amount: number
          applied_by: string
          bill_id: string
          created_at: string
          discount_id: string | null
          id: string
          reason: string | null
          restaurant_id: string
        }
        Insert: {
          amount: number
          applied_by: string
          bill_id: string
          created_at?: string
          discount_id?: string | null
          id?: string
          reason?: string | null
          restaurant_id: string
        }
        Update: {
          amount?: number
          applied_by?: string
          bill_id?: string
          created_at?: string
          discount_id?: string | null
          id?: string
          reason?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_discounts_restaurant_id_bill_id_fkey"
            columns: ["restaurant_id", "bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "bill_discounts_restaurant_id_discount_id_fkey"
            columns: ["restaurant_id", "discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          amount: number
          bill_id: string
          id: string
          order_item_id: string
          quantity: number
          restaurant_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          id?: string
          order_item_id: string
          quantity: number
          restaurant_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          id?: string
          order_item_id?: string
          quantity?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_restaurant_id_bill_id_fkey"
            columns: ["restaurant_id", "bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "bill_lines_restaurant_id_order_item_id_fkey"
            columns: ["restaurant_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      bills: {
        Row: {
          business_date: string
          closed_at: string | null
          closed_by: string | null
          discount_total: number
          id: string
          idempotency_key: string
          location_id: string
          number: number
          opened_at: string
          restaurant_id: string
          service_charge: number
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          table_session_id: string | null
          total: number
        }
        Insert: {
          business_date: string
          closed_at?: string | null
          closed_by?: string | null
          discount_total?: number
          id?: string
          idempotency_key: string
          location_id: string
          number: number
          opened_at?: string
          restaurant_id: string
          service_charge?: number
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          table_session_id?: string | null
          total?: number
        }
        Update: {
          business_date?: string
          closed_at?: string | null
          closed_by?: string | null
          discount_total?: number
          id?: string
          idempotency_key?: string
          location_id?: string
          number?: number
          opened_at?: string
          restaurant_id?: string
          service_charge?: number
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          table_session_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "bills_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "bills_restaurant_id_table_session_id_fkey"
            columns: ["restaurant_id", "table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          kind: string
          reason: string
          restaurant_id: string
          shift_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          kind: string
          reason: string
          restaurant_id: string
          shift_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          reason?: string
          restaurant_id?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_restaurant_id_shift_id_fkey"
            columns: ["restaurant_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image_path: string | null
          is_active: boolean
          menu_id: string
          prep_area_id: string | null
          restaurant_id: string
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          menu_id: string
          prep_area_id?: string | null
          restaurant_id: string
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          menu_id?: string
          prep_area_id?: string | null
          restaurant_id?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_menu_id_fkey"
            columns: ["restaurant_id", "menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "categories_restaurant_id_prep_area_id_fkey"
            columns: ["restaurant_id", "prep_area_id"]
            isOneToOne: false
            referencedRelation: "prep_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      category_translations: {
        Row: {
          category_id: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          restaurant_id: string
          reviewed_at: string | null
          source: Database["public"]["Enums"]["translation_source"]
          updated_at: string
        }
        Insert: {
          category_id: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          restaurant_id: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Update: {
          category_id?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          name?: string
          restaurant_id?: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_translations_restaurant_id_category_id_fkey"
            columns: ["restaurant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          locale: Database["public"]["Enums"]["app_locale"]
          marketing_opt_in: boolean
          name: string | null
          phone: string | null
          restaurant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
          restaurant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
          restaurant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          eta_minutes: number
          fee: number
          id: string
          is_active: boolean
          location_id: string
          min_order: number
          name: string
          polygon: Json
          restaurant_id: string
        }
        Insert: {
          eta_minutes?: number
          fee?: number
          id?: string
          is_active?: boolean
          location_id: string
          min_order?: number
          name: string
          polygon: Json
          restaurant_id: string
        }
        Update: {
          eta_minutes?: number
          fee?: number
          id?: string
          is_active?: boolean
          location_id?: string
          min_order?: number
          name?: string
          polygon?: Json
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      device_pairings: {
        Row: {
          code_hash: string
          consumed_at: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          label: string
          location_id: string
          member_id: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          label: string
          location_id: string
          member_id?: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          label?: string
          location_id?: string
          member_id?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "device_pairings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_pairings_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      discounts: {
        Row: {
          id: string
          is_active: boolean
          kind: string
          min_role: Database["public"]["Enums"]["member_role"]
          name: string
          restaurant_id: string
          value: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          kind: string
          min_role?: Database["public"]["Enums"]["member_role"]
          name: string
          restaurant_id: string
          value: number
        }
        Update: {
          id?: string
          is_active?: boolean
          kind?: string
          min_role?: Database["public"]["Enums"]["member_role"]
          name?: string
          restaurant_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          locale: Database["public"]["Enums"]["app_locale"]
          location_id: string
          qr_version: number
          restaurant_id: string
          revoked_at: string | null
          table_id: string
          table_session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          location_id: string
          qr_version: number
          restaurant_id: string
          revoked_at?: string | null
          table_id: string
          table_session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          location_id?: string
          qr_version?: number
          restaurant_id?: string
          revoked_at?: string | null
          table_id?: string
          table_session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_sessions_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "guest_sessions_restaurant_id_table_id_fkey"
            columns: ["restaurant_id", "table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "guest_sessions_restaurant_id_table_session_id_fkey"
            columns: ["restaurant_id", "table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      ingredients: {
        Row: {
          cost_per_unit: number
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          unit: string
        }
        Insert: {
          cost_per_unit?: number
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          unit: string
        }
        Update: {
          cost_per_unit?: number
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          location_id: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          invited_by: string
          location_id?: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          location_id?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      item_modifier_groups: {
        Row: {
          group_id: string
          item_id: string
          restaurant_id: string
          sort: number
        }
        Insert: {
          group_id: string
          item_id: string
          restaurant_id: string
          sort?: number
        }
        Update: {
          group_id?: string
          item_id?: string
          restaurant_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_modifier_groups_restaurant_id_group_id_fkey"
            columns: ["restaurant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "item_modifier_groups_restaurant_id_item_id_fkey"
            columns: ["restaurant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      item_translations: {
        Row: {
          description: string | null
          item_id: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          restaurant_id: string
          reviewed_at: string | null
          source: Database["public"]["Enums"]["translation_source"]
          updated_at: string
        }
        Insert: {
          description?: string | null
          item_id: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          restaurant_id: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Update: {
          description?: string | null
          item_id?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          name?: string
          restaurant_id?: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_translations_restaurant_id_item_id_fkey"
            columns: ["restaurant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      items: {
        Row: {
          allergens: string[]
          category_id: string
          created_at: string
          id: string
          image_blurhash: string | null
          image_path: string | null
          is_active: boolean
          portion_amount: number | null
          portion_unit: string | null
          prep_area_id: string | null
          price: number
          restaurant_id: string
          sort: number
          tags: string[]
          updated_at: string
        }
        Insert: {
          allergens?: string[]
          category_id: string
          created_at?: string
          id?: string
          image_blurhash?: string | null
          image_path?: string | null
          is_active?: boolean
          portion_amount?: number | null
          portion_unit?: string | null
          prep_area_id?: string | null
          price: number
          restaurant_id: string
          sort?: number
          tags?: string[]
          updated_at?: string
        }
        Update: {
          allergens?: string[]
          category_id?: string
          created_at?: string
          id?: string
          image_blurhash?: string | null
          image_path?: string | null
          is_active?: boolean
          portion_amount?: number | null
          portion_unit?: string | null
          prep_area_id?: string | null
          price?: number
          restaurant_id?: string
          sort?: number
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_restaurant_id_category_id_fkey"
            columns: ["restaurant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "items_restaurant_id_prep_area_id_fkey"
            columns: ["restaurant_id", "prep_area_id"]
            isOneToOne: false
            referencedRelation: "prep_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      kitchen_ticket_items: {
        Row: {
          order_item_id: string
          quantity: number
          restaurant_id: string
          ticket_id: string
        }
        Insert: {
          order_item_id: string
          quantity: number
          restaurant_id: string
          ticket_id: string
        }
        Update: {
          order_item_id?: string
          quantity?: number
          restaurant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_ticket_items_restaurant_id_order_item_id_fkey"
            columns: ["restaurant_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "kitchen_ticket_items_restaurant_id_ticket_id_fkey"
            columns: ["restaurant_id", "ticket_id"]
            isOneToOne: false
            referencedRelation: "kitchen_tickets"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      kitchen_tickets: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          cancelled_at: string | null
          created_at: string
          first_seen_at: string | null
          id: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          location_id: string
          number: number
          order_id: string
          ready_at: string | null
          restaurant_id: string
          served_at: string | null
          started_at: string | null
          station_id: string
          status: Database["public"]["Enums"]["ticket_status"]
          updated_at: string
          voids_ticket_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          cancelled_at?: string | null
          created_at?: string
          first_seen_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ticket_kind"]
          location_id: string
          number: number
          order_id: string
          ready_at?: string | null
          restaurant_id: string
          served_at?: string | null
          started_at?: string | null
          station_id: string
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
          voids_ticket_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          cancelled_at?: string | null
          created_at?: string
          first_seen_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ticket_kind"]
          location_id?: string
          number?: number
          order_id?: string
          ready_at?: string | null
          restaurant_id?: string
          served_at?: string | null
          started_at?: string | null
          station_id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
          voids_ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_tickets_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "kitchen_tickets_restaurant_id_order_id_fkey"
            columns: ["restaurant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "kitchen_tickets_restaurant_id_station_id_fkey"
            columns: ["restaurant_id", "station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "kitchen_tickets_restaurant_id_voids_ticket_id_fkey"
            columns: ["restaurant_id", "voids_ticket_id"]
            isOneToOne: false
            referencedRelation: "kitchen_tickets"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      location_counters: {
        Row: {
          business_date: string
          kind: string
          last_value: number
          location_id: string
        }
        Insert: {
          business_date: string
          kind: string
          last_value: number
          location_id: string
        }
        Update: {
          business_date?: string
          kind?: string
          last_value?: number
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_counters_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_hours: {
        Row: {
          closes: string
          location_id: string
          opens: string
          restaurant_id: string
          weekday: number
        }
        Insert: {
          closes: string
          location_id: string
          opens: string
          restaurant_id: string
          weekday: number
        }
        Update: {
          closes?: string
          location_id?: string
          opens?: string
          restaurant_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "location_hours_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          business_day_starts: string
          created_at: string
          expected_wait_minutes: number | null
          guest_locales: Database["public"]["Enums"]["app_locale"][]
          id: string
          kitchen_busy_until: string | null
          kitchen_locale: Database["public"]["Enums"]["app_locale"]
          max_auto_accept_total: number
          name: string
          phone: string | null
          published_menu_version_id: string | null
          qr_ordering_enabled: boolean
          require_acceptance: boolean
          restaurant_id: string
          slug: string
          status: Database["public"]["Enums"]["record_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_day_starts?: string
          created_at?: string
          expected_wait_minutes?: number | null
          guest_locales?: Database["public"]["Enums"]["app_locale"][]
          id?: string
          kitchen_busy_until?: string | null
          kitchen_locale?: Database["public"]["Enums"]["app_locale"]
          max_auto_accept_total?: number
          name: string
          phone?: string | null
          published_menu_version_id?: string | null
          qr_ordering_enabled?: boolean
          require_acceptance?: boolean
          restaurant_id: string
          slug: string
          status?: Database["public"]["Enums"]["record_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_day_starts?: string
          created_at?: string
          expected_wait_minutes?: number | null
          guest_locales?: Database["public"]["Enums"]["app_locale"][]
          id?: string
          kitchen_busy_until?: string | null
          kitchen_locale?: Database["public"]["Enums"]["app_locale"]
          max_auto_accept_total?: number
          name?: string
          phone?: string | null
          published_menu_version_id?: string | null
          qr_ordering_enabled?: boolean
          require_acceptance?: boolean
          restaurant_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["record_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_restaurant_id_published_menu_version_id_fkey"
            columns: ["restaurant_id", "published_menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          balance: number
          customer_id: string
          id: string
          restaurant_id: string
        }
        Insert: {
          balance?: number
          customer_id: string
          id?: string
          restaurant_id: string
        }
        Update: {
          balance?: number
          customer_id?: string
          id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_restaurant_id_customer_id_fkey"
            columns: ["restaurant_id", "customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          account_id: string
          created_at: string
          delta: number
          id: number
          idempotency_key: string
          order_id: string | null
          reason: string
          restaurant_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          delta: number
          id?: never
          idempotency_key: string
          order_id?: string | null
          reason: string
          restaurant_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          delta?: number
          id?: never
          idempotency_key?: string
          order_id?: string | null
          reason?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_restaurant_id_account_id_fkey"
            columns: ["restaurant_id", "account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          id: string
          is_active: boolean
          kind: string
          restaurant_id: string
          rules: Json
        }
        Insert: {
          id?: string
          is_active?: boolean
          kind: string
          restaurant_id: string
          rules: Json
        }
        Update: {
          id?: string
          is_active?: boolean
          kind?: string
          restaurant_id?: string
          rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_locations: {
        Row: {
          location_id: string
          member_id: string
          restaurant_id: string
        }
        Insert: {
          location_id: string
          member_id: string
          restaurant_id: string
        }
        Update: {
          location_id?: string
          member_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_locations_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "member_locations_restaurant_id_member_id_fkey"
            columns: ["restaurant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      members: {
        Row: {
          all_locations: boolean
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["member_kind"]
          last_seen_at: string | null
          locale: Database["public"]["Enums"]["app_locale"]
          pin_hash: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          all_locations?: boolean
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["member_kind"]
          last_seen_at?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          pin_hash?: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          all_locations?: boolean
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["member_kind"]
          last_seen_at?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          pin_hash?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_import_images: {
        Row: {
          created_at: string
          height: number | null
          id: string
          import_id: string
          page: number
          restaurant_id: string
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          import_id: string
          page?: number
          restaurant_id: string
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          import_id?: string
          page?: number
          restaurant_id?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_import_images_restaurant_id_import_id_fkey"
            columns: ["restaurant_id", "import_id"]
            isOneToOne: false
            referencedRelation: "menu_imports"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      menu_imports: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          created_by: string
          draft: Json | null
          error: string | null
          id: string
          input_tokens: number | null
          menu_id: string | null
          model: string | null
          output_tokens: number | null
          restaurant_id: string
          source_locale: Database["public"]["Enums"]["app_locale"] | null
          status: Database["public"]["Enums"]["menu_import_status"]
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by: string
          draft?: Json | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          menu_id?: string | null
          model?: string | null
          output_tokens?: number | null
          restaurant_id: string
          source_locale?: Database["public"]["Enums"]["app_locale"] | null
          status?: Database["public"]["Enums"]["menu_import_status"]
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string
          draft?: Json | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          menu_id?: string | null
          model?: string | null
          output_tokens?: number | null
          restaurant_id?: string
          source_locale?: Database["public"]["Enums"]["app_locale"] | null
          status?: Database["public"]["Enums"]["menu_import_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_imports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_imports_restaurant_id_menu_id_fkey"
            columns: ["restaurant_id", "menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      menu_locations: {
        Row: {
          location_id: string
          menu_id: string
          restaurant_id: string
        }
        Insert: {
          location_id: string
          menu_id: string
          restaurant_id: string
        }
        Update: {
          location_id?: string
          menu_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_locations_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "menu_locations_restaurant_id_menu_id_fkey"
            columns: ["restaurant_id", "menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      menu_translations: {
        Row: {
          locale: Database["public"]["Enums"]["app_locale"]
          menu_id: string
          name: string
          restaurant_id: string
          reviewed_at: string | null
          source: Database["public"]["Enums"]["translation_source"]
          updated_at: string
        }
        Insert: {
          locale: Database["public"]["Enums"]["app_locale"]
          menu_id: string
          name: string
          restaurant_id: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Update: {
          locale?: Database["public"]["Enums"]["app_locale"]
          menu_id?: string
          name?: string
          restaurant_id?: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_translations_restaurant_id_menu_id_fkey"
            columns: ["restaurant_id", "menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      menu_versions: {
        Row: {
          id: string
          item_count: number
          location_id: string
          published_at: string
          published_by: string | null
          restaurant_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          id?: string
          item_count: number
          location_id: string
          published_at?: string
          published_by?: string | null
          restaurant_id: string
          snapshot: Json
          version: number
        }
        Update: {
          id?: string
          item_count?: number
          location_id?: string
          published_at?: string
          published_by?: string | null
          restaurant_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_versions_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          id: string
          internal_name: string
          is_active: boolean
          restaurant_id: string
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_name: string
          is_active?: boolean
          restaurant_id: string
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_name?: string
          is_active?: boolean
          restaurant_id?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_group_translations: {
        Row: {
          group_id: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          restaurant_id: string
          reviewed_at: string | null
          source: Database["public"]["Enums"]["translation_source"]
          updated_at: string
        }
        Insert: {
          group_id: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          restaurant_id: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Update: {
          group_id?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          name?: string
          restaurant_id?: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_group_translations_restaurant_id_group_id_fkey"
            columns: ["restaurant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          id: string
          max_select: number
          min_select: number
          restaurant_id: string
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          restaurant_id: string
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          restaurant_id?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_translations: {
        Row: {
          locale: Database["public"]["Enums"]["app_locale"]
          modifier_id: string
          name: string
          restaurant_id: string
          reviewed_at: string | null
          source: Database["public"]["Enums"]["translation_source"]
          updated_at: string
        }
        Insert: {
          locale: Database["public"]["Enums"]["app_locale"]
          modifier_id: string
          name: string
          restaurant_id: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Update: {
          locale?: Database["public"]["Enums"]["app_locale"]
          modifier_id?: string
          name?: string
          restaurant_id?: string
          reviewed_at?: string | null
          source?: Database["public"]["Enums"]["translation_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_translations_restaurant_id_modifier_id_fkey"
            columns: ["restaurant_id", "modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      modifiers: {
        Row: {
          group_id: string
          id: string
          is_active: boolean
          is_default: boolean
          price_delta: number
          restaurant_id: string
          sort: number
        }
        Insert: {
          group_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          price_delta?: number
          restaurant_id: string
          sort?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          price_delta?: number
          restaurant_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_restaurant_id_group_id_fkey"
            columns: ["restaurant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          created_at: string
          created_by: string | null
          events: string[]
          id: string
          is_active: boolean
          kind: string
          locale: Database["public"]["Enums"]["app_locale"]
          location_id: string | null
          restaurant_id: string
          telegram_chat_id: number
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          kind?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          location_id?: string | null
          restaurant_id: string
          telegram_chat_id: number
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          kind?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          location_id?: string | null
          restaurant_id?: string
          telegram_chat_id?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_channels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_channels_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          channel_id: string
          created_at: string
          dedupe_key: string
          event: string
          id: number
          last_error: string | null
          next_attempt_at: string
          payload: Json
          restaurant_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
        }
        Insert: {
          attempts?: number
          channel_id: string
          created_at?: string
          dedupe_key: string
          event: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          restaurant_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
        }
        Update: {
          attempts?: number
          channel_id?: string
          created_at?: string
          dedupe_key?: string
          event?: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          restaurant_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_restaurant_id_channel_id_fkey"
            columns: ["restaurant_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "notification_outbox_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_deliveries: {
        Row: {
          address: string
          address_details: string | null
          customer_id: string | null
          eta: string | null
          fee: number
          order_id: string
          phone: string
          restaurant_id: string
          status: string
          zone_id: string | null
        }
        Insert: {
          address: string
          address_details?: string | null
          customer_id?: string | null
          eta?: string | null
          fee?: number
          order_id: string
          phone: string
          restaurant_id: string
          status?: string
          zone_id?: string | null
        }
        Update: {
          address?: string
          address_details?: string | null
          customer_id?: string | null
          eta?: string | null
          fee?: number
          order_id?: string
          phone?: string
          restaurant_id?: string
          status?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_deliveries_restaurant_id_customer_id_fkey"
            columns: ["restaurant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "order_deliveries_restaurant_id_order_id_fkey"
            columns: ["restaurant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "order_deliveries_restaurant_id_zone_id_fkey"
            columns: ["restaurant_id", "zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      order_item_modifiers: {
        Row: {
          id: string
          modifier_id: string | null
          name_i18n: Json
          order_id: string
          order_item_id: string
          price_delta: number
          restaurant_id: string
        }
        Insert: {
          id?: string
          modifier_id?: string | null
          name_i18n: Json
          order_id: string
          order_item_id: string
          price_delta: number
          restaurant_id: string
        }
        Update: {
          id?: string
          modifier_id?: string | null
          name_i18n?: Json
          order_id?: string
          order_item_id?: string
          price_delta?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_restaurant_id_modifier_id_fkey"
            columns: ["restaurant_id", "modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "order_item_modifiers_restaurant_id_order_item_id_fkey"
            columns: ["restaurant_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancelled_quantity: number
          created_at: string
          id: string
          item_id: string | null
          line_total: number
          modifiers_total: number
          name_i18n: Json
          note: string | null
          order_id: string
          prep_area_id: string | null
          quantity: number
          restaurant_id: string
          sort: number
          station_id: string | null
          unit_price: number
        }
        Insert: {
          cancelled_quantity?: number
          created_at?: string
          id?: string
          item_id?: string | null
          line_total: number
          modifiers_total?: number
          name_i18n: Json
          note?: string | null
          order_id: string
          prep_area_id?: string | null
          quantity: number
          restaurant_id: string
          sort?: number
          station_id?: string | null
          unit_price: number
        }
        Update: {
          cancelled_quantity?: number
          created_at?: string
          id?: string
          item_id?: string | null
          line_total?: number
          modifiers_total?: number
          name_i18n?: Json
          note?: string | null
          order_id?: string
          prep_area_id?: string | null
          quantity?: number
          restaurant_id?: string
          sort?: number
          station_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_restaurant_id_item_id_fkey"
            columns: ["restaurant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_order_id_fkey"
            columns: ["restaurant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_station_id_fkey"
            columns: ["restaurant_id", "station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          actor_user_id: string | null
          created_at: string
          entity: string
          from_status: string | null
          id: number
          order_id: string
          reason: string | null
          restaurant_id: string
          ticket_id: string | null
          to_status: string
        }
        Insert: {
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          actor_user_id?: string | null
          created_at?: string
          entity: string
          from_status?: string | null
          id?: never
          order_id: string
          reason?: string | null
          restaurant_id: string
          ticket_id?: string | null
          to_status: string
        }
        Update: {
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          from_status?: string | null
          id?: never
          order_id?: string
          reason?: string | null
          restaurant_id?: string
          ticket_id?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_restaurant_id_order_id_fkey"
            columns: ["restaurant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          business_date: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_by_member: string | null
          customer_id: string | null
          fulfillment: Database["public"]["Enums"]["fulfillment"]
          guest_note: string | null
          guest_session_id: string | null
          id: string
          idempotency_key: string
          is_test: boolean
          item_count: number
          kitchen_status: Database["public"]["Enums"]["kitchen_status"]
          locale: Database["public"]["Enums"]["app_locale"]
          location_id: string
          number: number
          paid_at: string | null
          placed_at: string
          possible_duplicate_of: string | null
          ready_at: string | null
          reject_reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          request_hash: string
          restaurant_id: string
          served_at: string | null
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          table_session_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_date: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_by_member?: string | null
          customer_id?: string | null
          fulfillment?: Database["public"]["Enums"]["fulfillment"]
          guest_note?: string | null
          guest_session_id?: string | null
          id?: string
          idempotency_key: string
          is_test?: boolean
          item_count?: number
          kitchen_status?: Database["public"]["Enums"]["kitchen_status"]
          locale: Database["public"]["Enums"]["app_locale"]
          location_id: string
          number: number
          paid_at?: string | null
          placed_at?: string
          possible_duplicate_of?: string | null
          ready_at?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          request_hash: string
          restaurant_id: string
          served_at?: string | null
          source: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          table_session_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_date?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_by_member?: string | null
          customer_id?: string | null
          fulfillment?: Database["public"]["Enums"]["fulfillment"]
          guest_note?: string | null
          guest_session_id?: string | null
          id?: string
          idempotency_key?: string
          is_test?: boolean
          item_count?: number
          kitchen_status?: Database["public"]["Enums"]["kitchen_status"]
          locale?: Database["public"]["Enums"]["app_locale"]
          location_id?: string
          number?: number
          paid_at?: string | null
          placed_at?: string
          possible_duplicate_of?: string | null
          ready_at?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          request_hash?: string
          restaurant_id?: string
          served_at?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          table_session_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_possible_duplicate_fk"
            columns: ["restaurant_id", "possible_duplicate_of"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_created_by_member_fkey"
            columns: ["restaurant_id", "created_by_member"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_customer_id_fkey"
            columns: ["restaurant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_guest_session_id_fkey"
            columns: ["restaurant_id", "guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_table_id_fkey"
            columns: ["restaurant_id", "table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_table_session_id_fkey"
            columns: ["restaurant_id", "table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          created_at: string
          id: string
          payment_id: string
          provider_account_id: string
          provider_order_id: number
          provider_payment_id: string | null
          raw: Json | null
          response_code: string | null
          restaurant_id: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_id: string
          provider_account_id: string
          provider_order_id: number
          provider_payment_id?: string | null
          raw?: Json | null
          response_code?: string | null
          restaurant_id: string
          state: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_id?: string
          provider_account_id?: string
          provider_order_id?: number
          provider_payment_id?: string | null
          raw?: Json | null
          response_code?: string | null
          restaurant_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_restaurant_id_payment_id_fkey"
            columns: ["restaurant_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payment_attempts_restaurant_id_provider_account_id_fkey"
            columns: ["restaurant_id", "provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      payment_provider_accounts: {
        Row: {
          created_at: string
          credentials_secret_id: string
          id: string
          is_active: boolean
          location_id: string
          mode: string
          provider: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          credentials_secret_id: string
          id?: string
          is_active?: boolean
          location_id: string
          mode: string
          provider: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          credentials_secret_id?: string
          id?: string
          is_active?: boolean
          location_id?: string
          mode?: string
          provider?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_accounts_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bill_id: string
          confirmed_at: string | null
          created_at: string
          id: string
          location_id: string
          method: Database["public"]["Enums"]["payment_method"]
          provider: string | null
          provider_payment_id: string | null
          recorded_by: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["payment_status"]
          tip_amount: number
        }
        Insert: {
          amount: number
          bill_id: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          location_id: string
          method: Database["public"]["Enums"]["payment_method"]
          provider?: string | null
          provider_payment_id?: string | null
          recorded_by?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          tip_amount?: number
        }
        Update: {
          amount?: number
          bill_id?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          location_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          provider?: string | null
          provider_payment_id?: string | null
          recorded_by?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          tip_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_restaurant_id_bill_id_fkey"
            columns: ["restaurant_id", "bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prep_areas: {
        Row: {
          id: string
          name: string
          restaurant_id: string
          sort: number
        }
        Insert: {
          id?: string
          name: string
          restaurant_id: string
          sort?: number
        }
        Update: {
          id?: string
          name?: string
          restaurant_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "prep_areas_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          printed_at: string | null
          printer_id: string
          ref_id: string | null
          restaurant_id: string
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          printed_at?: string | null
          printer_id: string
          ref_id?: string | null
          restaurant_id: string
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          printed_at?: string | null
          printer_id?: string
          ref_id?: string | null
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_restaurant_id_printer_id_fkey"
            columns: ["restaurant_id", "printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      printers: {
        Row: {
          address: string | null
          connection: string
          id: string
          is_active: boolean
          location_id: string
          model: string | null
          name: string
          paper_width_mm: number
          prints: string[]
          restaurant_id: string
          station_id: string | null
        }
        Insert: {
          address?: string | null
          connection: string
          id?: string
          is_active?: boolean
          location_id: string
          model?: string | null
          name: string
          paper_width_mm?: number
          prints?: string[]
          restaurant_id: string
          station_id?: string | null
        }
        Update: {
          address?: string | null
          connection?: string
          id?: string
          is_active?: boolean
          location_id?: string
          model?: string | null
          name?: string
          paper_width_mm?: number
          prints?: string[]
          restaurant_id?: string
          station_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "printers_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "printers_restaurant_id_station_id_fkey"
            columns: ["restaurant_id", "station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      recipe_lines: {
        Row: {
          id: string
          ingredient_id: string
          item_id: string | null
          modifier_id: string | null
          quantity: number
          restaurant_id: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          item_id?: string | null
          modifier_id?: string | null
          quantity: number
          restaurant_id: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          item_id?: string | null
          modifier_id?: string | null
          quantity?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_lines_restaurant_id_ingredient_id_fkey"
            columns: ["restaurant_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "recipe_lines_restaurant_id_item_id_fkey"
            columns: ["restaurant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "recipe_lines_restaurant_id_modifier_id_fkey"
            columns: ["restaurant_id", "modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      restaurants: {
        Row: {
          brand_color: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_locale: Database["public"]["Enums"]["app_locale"]
          id: string
          logo_path: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["record_status"]
          tax_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_locale?: Database["public"]["Enums"]["app_locale"]
          id?: string
          logo_path?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["record_status"]
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_locale?: Database["public"]["Enums"]["app_locale"]
          id?: string
          logo_path?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["record_status"]
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_requests: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          guest_session_id: string | null
          id: string
          kind: Database["public"]["Enums"]["service_request_kind"]
          location_id: string
          payment_preference: string | null
          resolved_at: string | null
          resolved_by: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["service_request_status"]
          table_id: string
          table_session_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          guest_session_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["service_request_kind"]
          location_id: string
          payment_preference?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["service_request_status"]
          table_id: string
          table_session_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          guest_session_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["service_request_kind"]
          location_id?: string
          payment_preference?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["service_request_status"]
          table_id?: string
          table_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_restaurant_id_guest_session_id_fkey"
            columns: ["restaurant_id", "guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "service_requests_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "service_requests_restaurant_id_table_id_fkey"
            columns: ["restaurant_id", "table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      shifts: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          expected_cash: number | null
          id: string
          location_id: string
          note: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          restaurant_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          location_id: string
          note?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          restaurant_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          location_id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      station_prep_areas: {
        Row: {
          location_id: string
          prep_area_id: string
          restaurant_id: string
          station_id: string
        }
        Insert: {
          location_id: string
          prep_area_id: string
          restaurant_id: string
          station_id: string
        }
        Update: {
          location_id?: string
          prep_area_id?: string
          restaurant_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_prep_areas_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "station_prep_areas_restaurant_id_prep_area_id_fkey"
            columns: ["restaurant_id", "prep_area_id"]
            isOneToOne: false
            referencedRelation: "prep_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "station_prep_areas_restaurant_id_station_id_fkey"
            columns: ["restaurant_id", "station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      stations: {
        Row: {
          id: string
          is_default: boolean
          location_id: string
          name: string
          restaurant_id: string
          sort: number
        }
        Insert: {
          id?: string
          is_default?: boolean
          location_id: string
          name: string
          restaurant_id: string
          sort?: number
        }
        Update: {
          id?: string
          is_default?: boolean
          location_id?: string
          name?: string
          restaurant_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "stations_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: number
          ingredient_id: string
          location_id: string
          order_item_id: string | null
          reason: string
          restaurant_id: string
          supplier_id: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: never
          ingredient_id: string
          location_id: string
          order_item_id?: string | null
          reason: string
          restaurant_id: string
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: never
          ingredient_id?: string
          location_id?: string
          order_item_id?: string | null
          reason?: string
          restaurant_id?: string
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_restaurant_id_ingredient_id_fkey"
            columns: ["restaurant_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_restaurant_id_supplier_id_fkey"
            columns: ["restaurant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      stop_list: {
        Row: {
          created_at: string
          created_by: string | null
          item_id: string
          location_id: string
          restaurant_id: string
          until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          item_id: string
          location_id: string
          restaurant_id: string
          until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          item_id?: string
          location_id?: string
          restaurant_id?: string
          until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stop_list_restaurant_id_item_id_fkey"
            columns: ["restaurant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "stop_list_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_reason: string | null
          canceled_at: string | null
          converted_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          location_id: string
          notes: string | null
          plan: string
          price_amd: number
          restaurant_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          canceled_at?: string | null
          converted_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          location_id: string
          notes?: string | null
          plan: string
          price_amd: number
          restaurant_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          canceled_at?: string | null
          converted_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          plan?: string
          price_amd?: number
          restaurant_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      suppliers: {
        Row: {
          id: string
          name: string
          note: string | null
          phone: string | null
          restaurant_id: string
        }
        Insert: {
          id?: string
          name: string
          note?: string | null
          phone?: string | null
          restaurant_id: string
        }
        Update: {
          id?: string
          name?: string
          note?: string | null
          phone?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          guest_count: number | null
          id: string
          location_id: string
          opened_at: string
          opened_by: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["table_session_status"]
          table_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          guest_count?: number | null
          id?: string
          location_id: string
          opened_at?: string
          opened_by?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          guest_count?: number | null
          id?: string
          location_id?: string
          opened_at?: string
          opened_by?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "table_sessions_restaurant_id_table_id_fkey"
            columns: ["restaurant_id", "table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      tables: {
        Row: {
          area_id: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          location_id: string
          pos_x: number | null
          pos_y: number | null
          qr_version: number
          restaurant_id: string
          seats: number
          shape: string
          sort: number
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          location_id: string
          pos_x?: number | null
          pos_y?: number | null
          qr_version?: number
          restaurant_id: string
          seats?: number
          shape?: string
          sort?: number
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          location_id?: string
          pos_x?: number | null
          pos_y?: number | null
          qr_version?: number
          restaurant_id?: string
          seats?: number
          shape?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_restaurant_id_area_id_fkey"
            columns: ["restaurant_id", "area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "tables_restaurant_id_location_id_fkey"
            columns: ["restaurant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      telegram_link_codes: {
        Row: {
          code_hash: string
          consumed_at: string | null
          created_by: string
          expires_at: string
          location_id: string | null
          restaurant_id: string
        }
        Insert: {
          code_hash: string
          consumed_at?: string | null
          created_by: string
          expires_at: string
          location_id?: string | null
          restaurant_id: string
        }
        Update: {
          code_hash?: string
          consumed_at?: string | null
          created_by?: string
          expires_at?: string
          location_id?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      order_display_status: {
        Args: { o: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: string
      }
    }
    Enums: {
      actor_kind: "member" | "guest" | "system" | "platform_admin"
      app_locale: "hy" | "ru" | "en"
      bill_status: "open" | "paid" | "void"
      fulfillment: "dine_in" | "takeaway" | "delivery"
      kitchen_status: "pending" | "cooking" | "ready" | "served"
      member_kind: "person" | "device"
      member_role: "owner" | "manager" | "waiter" | "kitchen" | "cashier"
      menu_import_status:
        | "uploaded"
        | "processing"
        | "needs_review"
        | "applied"
        | "failed"
        | "discarded"
      order_source: "qr" | "waiter" | "kiosk" | "online"
      order_status: "placed" | "accepted" | "rejected" | "cancelled"
      outbox_status: "pending" | "sent" | "failed" | "dead"
      payment_method:
        | "cash"
        | "card_terminal"
        | "online_card"
        | "idram"
        | "telcell"
        | "other"
      payment_status:
        | "pending"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "refunded"
      record_status: "active" | "suspended" | "closed"
      service_request_kind: "call_waiter" | "bring_bill"
      service_request_status: "open" | "acknowledged" | "resolved"
      subscription_status: "trialing" | "active" | "past_due" | "canceled"
      table_session_status: "open" | "closed" | "void" | "waiting"
      ticket_kind: "order" | "void"
      ticket_status: "new" | "cooking" | "ready" | "served" | "cancelled"
      translation_source: "owner" | "ai" | "import"
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
      actor_kind: ["member", "guest", "system", "platform_admin"],
      app_locale: ["hy", "ru", "en"],
      bill_status: ["open", "paid", "void"],
      fulfillment: ["dine_in", "takeaway", "delivery"],
      kitchen_status: ["pending", "cooking", "ready", "served"],
      member_kind: ["person", "device"],
      member_role: ["owner", "manager", "waiter", "kitchen", "cashier"],
      menu_import_status: [
        "uploaded",
        "processing",
        "needs_review",
        "applied",
        "failed",
        "discarded",
      ],
      order_source: ["qr", "waiter", "kiosk", "online"],
      order_status: ["placed", "accepted", "rejected", "cancelled"],
      outbox_status: ["pending", "sent", "failed", "dead"],
      payment_method: [
        "cash",
        "card_terminal",
        "online_card",
        "idram",
        "telcell",
        "other",
      ],
      payment_status: [
        "pending",
        "succeeded",
        "failed",
        "cancelled",
        "refunded",
      ],
      record_status: ["active", "suspended", "closed"],
      service_request_kind: ["call_waiter", "bring_bill"],
      service_request_status: ["open", "acknowledged", "resolved"],
      subscription_status: ["trialing", "active", "past_due", "canceled"],
      table_session_status: ["open", "closed", "void", "waiting"],
      ticket_kind: ["order", "void"],
      ticket_status: ["new", "cooking", "ready", "served", "cancelled"],
      translation_source: ["owner", "ai", "import"],
    },
  },
} as const
