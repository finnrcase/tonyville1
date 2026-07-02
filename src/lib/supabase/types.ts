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
      leads: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          selected_model: string | null
          selected_parcel_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          selected_model?: string | null
          selected_parcel_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          selected_model?: string | null
          selected_parcel_id?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          role?: string
        }
        Relationships: []
      }
      saved_parcels: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          parcel_address: string | null
          parcel_data: Json
          parcel_id: string
          score: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          parcel_address?: string | null
          parcel_data?: Json
          parcel_id: string
          score?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          parcel_address?: string | null
          parcel_data?: Json
          parcel_id?: string
          score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          location: string | null
          max_price: number | null
          radius: number | null
          selected_tiny_home_model: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          location?: string | null
          max_price?: number | null
          radius?: number | null
          selected_tiny_home_model?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          location?: string | null
          max_price?: number | null
          radius?: number | null
          selected_tiny_home_model?: number | null
          user_id?: string
        }
        Relationships: []
      }
      tony_tiny_home_models: {
        Row: {
          active: boolean
          base_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          minimum_lot_size: number | null
          name: string
          square_feet: number | null
          utility_requirements: Json
        }
        Insert: {
          active?: boolean
          base_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          minimum_lot_size?: number | null
          name: string
          square_feet?: number | null
          utility_requirements?: Json
        }
        Update: {
          active?: boolean
          base_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          minimum_lot_size?: number | null
          name?: string
          square_feet?: number | null
          utility_requirements?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
