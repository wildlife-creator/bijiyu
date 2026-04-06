Connecting to db 5432
v0.96.1: Pulling from supabase/postgres-meta
3aa96371cb05: Pulling fs layer
649294d53040: Pulling fs layer
b1f4bffa7894: Pulling fs layer
eb04ef52de3a: Pulling fs layer
7f0469884eb9: Pulling fs layer
19351e083594: Pulling fs layer
036bd28688ee: Pulling fs layer
9b590c83e93c: Pulling fs layer
1061a5258f4e: Pulling fs layer
4f6e2095427e: Pulling fs layer
7f0469884eb9: Already exists
3aa96371cb05: Download complete
19351e083594: Download complete
649294d53040: Download complete
036bd28688ee: Download complete
1061a5258f4e: Download complete
b1f4bffa7894: Download complete
d8cd7fa11bac: Download complete
4f6e2095427e: Download complete
eb04ef52de3a: Download complete
eb04ef52de3a: Pull complete
3aa96371cb05: Pull complete
9b590c83e93c: Download complete
9b590c83e93c: Pull complete
649294d53040: Pull complete
1061a5258f4e: Pull complete
7f0469884eb9: Pull complete
b1f4bffa7894: Pull complete
4f6e2095427e: Pull complete
19351e083594: Pull complete
036bd28688ee: Pull complete
Digest: sha256:2559d20aaa50f2eb86a6cb2e5af4e847e87139673bc214b4655c126d96c160b2
Status: Downloaded newer image for public.ecr.aws/supabase/postgres-meta:v0.96.1
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      applications: {
        Row: {
          applicant_id: string
          client_notes: string | null
          created_at: string
          first_work_date: string | null
          headcount: number | null
          id: string
          job_id: string
          message: string | null
          preferred_first_work_date: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          working_type: string | null
        }
        Insert: {
          applicant_id: string
          client_notes?: string | null
          created_at?: string
          first_work_date?: string | null
          headcount?: number | null
          id?: string
          job_id: string
          message?: string | null
          preferred_first_work_date?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          working_type?: string | null
        }
        Update: {
          applicant_id?: string
          client_notes?: string | null
          created_at?: string
          first_work_date?: string | null
          headcount?: number | null
          id?: string
          job_id?: string
          message?: string | null
          preferred_first_work_date?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          working_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      available_schedules: {
        Row: {
          created_at: string
          end_date: string
          id: string
          note: string | null
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          note?: string | null
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          note?: string | null
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "available_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          admin_memo: string | null
          created_at: string
          display_name: string | null
          employee_scale: number | null
          id: string
          image_url: string | null
          is_compensation_5000: boolean
          is_compensation_9800: boolean
          is_urgent_option: boolean
          message: string | null
          recruit_area: string[] | null
          recruit_job_types: string[] | null
          updated_at: string
          user_id: string
          working_way: string | null
        }
        Insert: {
          admin_memo?: string | null
          created_at?: string
          display_name?: string | null
          employee_scale?: number | null
          id?: string
          image_url?: string | null
          is_compensation_5000?: boolean
          is_compensation_9800?: boolean
          is_urgent_option?: boolean
          message?: string | null
          recruit_area?: string[] | null
          recruit_job_types?: string[] | null
          updated_at?: string
          user_id: string
          working_way?: string | null
        }
        Update: {
          admin_memo?: string | null
          created_at?: string
          display_name?: string | null
          employee_scale?: number | null
          id?: string
          image_url?: string | null
          is_compensation_5000?: boolean
          is_compensation_9800?: boolean
          is_urgent_option?: boolean
          message?: string | null
          recruit_area?: string[] | null
          recruit_job_types?: string[] | null
          updated_at?: string
          user_id?: string
          working_way?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reviews: {
        Row: {
          application_id: string
          comment: string | null
          created_at: string
          id: string
          operating_status: string | null
          rating_again: string | null
          reviewee_id: string
          reviewer_id: string
          status_supplement: string | null
        }
        Insert: {
          application_id: string
          comment?: string | null
          created_at?: string
          id?: string
          operating_status?: string | null
          rating_again?: string | null
          reviewee_id: string
          reviewer_id: string
          status_supplement?: string | null
        }
        Update: {
          application_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          operating_status?: string | null
          rating_again?: string | null
          reviewee_id?: string
          reviewer_id?: string
          status_supplement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          contact_types: string[]
          content: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
        }
        Insert: {
          contact_types: string[]
          content: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
        }
        Update: {
          contact_types?: string[]
          content?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verifications: {
        Row: {
          ccus_worker_id: string | null
          created_at: string
          document_type: string
          document_url_1: string
          document_url_2: string | null
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["verification_status"]
          user_id: string
        }
        Insert: {
          ccus_worker_id?: string | null
          created_at?: string
          document_type: string
          document_url_1: string
          document_url_2?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          user_id: string
        }
        Update: {
          ccus_worker_id?: string | null
          created_at?: string
          document_type?: string
          document_url_1?: string
          document_url_2?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_images: {
        Row: {
          created_at: string
          id: string
          image_type: string
          image_url: string
          job_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_type: string
          image_url: string
          job_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_type?: string
          image_url?: string
          job_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_images_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          etc_message: string | null
          experience_years: string | null
          headcount: number | null
          id: string
          is_urgent: boolean
          items: string | null
          location: string | null
          nationality_language: string | null
          organization_id: string | null
          owner_id: string
          owner_message: string | null
          prefecture: string | null
          project_details: string | null
          recruit_end_date: string | null
          recruit_start_date: string | null
          required_skills: string | null
          reward_lower: number | null
          reward_upper: number | null
          schedule_detail: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          trade_type: string | null
          updated_at: string
          work_end_date: string | null
          work_hours: string | null
          work_start_date: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          etc_message?: string | null
          experience_years?: string | null
          headcount?: number | null
          id?: string
          is_urgent?: boolean
          items?: string | null
          location?: string | null
          nationality_language?: string | null
          organization_id?: string | null
          owner_id: string
          owner_message?: string | null
          prefecture?: string | null
          project_details?: string | null
          recruit_end_date?: string | null
          recruit_start_date?: string | null
          required_skills?: string | null
          reward_lower?: number | null
          reward_upper?: number | null
          schedule_detail?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          trade_type?: string | null
          updated_at?: string
          work_end_date?: string | null
          work_hours?: string | null
          work_start_date?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          etc_message?: string | null
          experience_years?: string | null
          headcount?: number | null
          id?: string
          is_urgent?: boolean
          items?: string | null
          location?: string | null
          nationality_language?: string | null
          organization_id?: string | null
          owner_id?: string
          owner_message?: string | null
          prefecture?: string | null
          project_details?: string | null
          recruit_end_date?: string | null
          recruit_start_date?: string | null
          required_skills?: string | null
          reward_lower?: number | null
          reward_upper?: number | null
          schedule_detail?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          trade_type?: string | null
          updated_at?: string
          work_end_date?: string | null
          work_hours?: string | null
          work_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string
          id: string
          participant_1_id: string
          participant_2_id: string
          thread_type: Database["public"]["Enums"]["thread_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_1_id: string
          participant_2_id: string
          thread_type?: Database["public"]["Enums"]["thread_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_1_id?: string
          participant_2_id?: string
          thread_type?: Database["public"]["Enums"]["thread_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_participant_1_id_fkey"
            columns: ["participant_1_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_participant_2_id_fkey"
            columns: ["participant_2_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          image_url: string | null
          is_proxy: boolean
          is_scout: boolean
          job_id: string | null
          proxy_sender_id: string | null
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_proxy?: boolean
          is_scout?: boolean
          job_id?: string | null
          proxy_sender_id?: string | null
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_proxy?: boolean
          is_scout?: boolean
          job_id?: string | null
          proxy_sender_id?: string | null
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_proxy_sender_id_fkey"
            columns: ["proxy_sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      option_subscriptions: {
        Row: {
          client_profile_id: string | null
          created_at: string
          end_date: string | null
          id: string
          job_id: string | null
          option_type: string
          payment_type: Database["public"]["Enums"]["option_payment_type"]
          start_date: string
          status: Database["public"]["Enums"]["option_status"]
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_profile_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          job_id?: string | null
          option_type: string
          payment_type: Database["public"]["Enums"]["option_payment_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["option_status"]
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_profile_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          job_id?: string | null
          option_type?: string
          payment_type?: Database["public"]["Enums"]["option_payment_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["option_status"]
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_subscriptions_client_profile_fk"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_subscriptions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          is_proxy_account: boolean
          org_role: Database["public"]["Enums"]["org_role"]
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_proxy_account?: boolean
          org_role: Database["public"]["Enums"]["org_role"]
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_proxy_account?: boolean
          org_role?: Database["public"]["Enums"]["org_role"]
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          memo: string | null
          organization_id: string | null
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          memo?: string | null
          organization_id?: string | null
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          memo?: string | null
          organization_id?: string | null
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          processed_at: string | null
          status: Database["public"]["Enums"]["webhook_status"]
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["webhook_status"]
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["webhook_status"]
          stripe_event_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          past_due_since: string | null
          plan_type: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          past_due_since?: string | null
          plan_type: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          past_due_since?: string | null
          plan_type?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_available_areas: {
        Row: {
          created_at: string
          id: string
          prefecture: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prefecture: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prefecture?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_available_areas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_qualifications: {
        Row: {
          created_at: string
          id: string
          qualification_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          qualification_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          qualification_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_qualifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reviews: {
        Row: {
          application_id: string
          comment: string | null
          created_at: string
          id: string
          operating_status: string | null
          rating_again: string | null
          rating_follows_instructions: string | null
          rating_has_tools: string | null
          rating_punctual: string | null
          rating_quality: string | null
          rating_speed: string | null
          reviewee_id: string
          reviewer_id: string
          status_supplement: string | null
        }
        Insert: {
          application_id: string
          comment?: string | null
          created_at?: string
          id?: string
          operating_status?: string | null
          rating_again?: string | null
          rating_follows_instructions?: string | null
          rating_has_tools?: string | null
          rating_punctual?: string | null
          rating_quality?: string | null
          rating_speed?: string | null
          reviewee_id: string
          reviewer_id: string
          status_supplement?: string | null
        }
        Update: {
          application_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          operating_status?: string | null
          rating_again?: string | null
          rating_follows_instructions?: string | null
          rating_has_tools?: string | null
          rating_punctual?: string | null
          rating_quality?: string | null
          rating_speed?: string | null
          reviewee_id?: string
          reviewer_id?: string
          status_supplement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_skills: {
        Row: {
          created_at: string
          experience_years: number | null
          id: string
          trade_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          experience_years?: number | null
          id?: string
          trade_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          experience_years?: number | null
          id?: string
          trade_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          ccus_verified: boolean
          ccus_worker_id: string | null
          company_name: string | null
          created_at: string
          deleted_at: string | null
          email: string
          first_name: string | null
          gender: string | null
          id: string
          identity_verified: boolean
          is_active: boolean
          last_name: string | null
          prefecture: string | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          ccus_verified?: boolean
          ccus_worker_id?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          first_name?: string | null
          gender?: string | null
          id: string
          identity_verified?: boolean
          is_active?: boolean
          last_name?: string | null
          prefecture?: string | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          ccus_verified?: boolean
          ccus_worker_id?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          first_name?: string | null
          gender?: string | null
          id?: string
          identity_verified?: boolean
          is_active?: boolean
          last_name?: string | null
          prefecture?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_registration: {
        Args: {
          p_areas?: string[]
          p_birth_date: string
          p_company_name?: string
          p_first_name: string
          p_gender: string
          p_last_name: string
          p_prefecture: string
          p_skills?: Json
          p_user_id: string
        }
        Returns: undefined
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_paid_user: { Args: { uid: string }; Returns: boolean }
      is_same_org: { Args: { org_id: string; uid: string }; Returns: boolean }
      update_profile: {
        Args: {
          p_areas?: string[]
          p_bio?: string
          p_company_name?: string
          p_first_name: string
          p_gender: string
          p_last_name: string
          p_prefecture: string
          p_qualifications?: string[]
          p_skills?: Json
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      application_status:
        | "applied"
        | "accepted"
        | "rejected"
        | "completed"
        | "cancelled"
        | "lost"
      job_status: "draft" | "open" | "closed"
      option_payment_type: "one_time" | "subscription"
      option_status: "active" | "expired" | "cancelled"
      org_role: "owner" | "admin" | "staff"
      subscription_status: "active" | "past_due" | "cancelled"
      thread_type: "message" | "scout"
      user_role: "contractor" | "client" | "staff" | "admin"
      verification_status: "pending" | "approved" | "rejected"
      webhook_status: "processing" | "completed" | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      application_status: [
        "applied",
        "accepted",
        "rejected",
        "completed",
        "cancelled",
        "lost",
      ],
      job_status: ["draft", "open", "closed"],
      option_payment_type: ["one_time", "subscription"],
      option_status: ["active", "expired", "cancelled"],
      org_role: ["owner", "admin", "staff"],
      subscription_status: ["active", "past_due", "cancelled"],
      thread_type: ["message", "scout"],
      user_role: ["contractor", "client", "staff", "admin"],
      verification_status: ["pending", "approved", "rejected"],
      webhook_status: ["processing", "completed", "failed"],
    },
  },
} as const

