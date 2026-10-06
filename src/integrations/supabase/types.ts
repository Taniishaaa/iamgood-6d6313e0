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
      activity_logs: {
        Row: {
          active_minutes: number | null
          bp_diastolic: number | null
          bp_systolic: number | null
          breaths_per_min: number | null
          cadence: number | null
          calories: number | null
          created_at: string
          distance_km: number | null
          exercise_minutes: number
          exercise_type: string | null
          floors_climbed: number | null
          glucose_mg_dl: number | null
          heart_rate: number | null
          id: string
          log_date: string
          notes: string | null
          respiration_rate: number | null
          sleep_hours: number
          source: string
          spo2: number | null
          steps: number
          temperature_c: number | null
          user_id: string
        }
        Insert: {
          active_minutes?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          breaths_per_min?: number | null
          cadence?: number | null
          calories?: number | null
          created_at?: string
          distance_km?: number | null
          exercise_minutes?: number
          exercise_type?: string | null
          floors_climbed?: number | null
          glucose_mg_dl?: number | null
          heart_rate?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          respiration_rate?: number | null
          sleep_hours?: number
          source?: string
          spo2?: number | null
          steps?: number
          temperature_c?: number | null
          user_id: string
        }
        Update: {
          active_minutes?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          breaths_per_min?: number | null
          cadence?: number | null
          calories?: number | null
          created_at?: string
          distance_km?: number | null
          exercise_minutes?: number
          exercise_type?: string | null
          floors_climbed?: number | null
          glucose_mg_dl?: number | null
          heart_rate?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          respiration_rate?: number | null
          sleep_hours?: number
          source?: string
          spo2?: number | null
          steps?: number
          temperature_c?: number | null
          user_id?: string
        }
        Relationships: []
      }
      admin_2fa_codes: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_2fa_config: {
        Row: {
          created_at: string
          email: string
          id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_credentials: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          last_login_at: string | null
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          last_login_at?: string | null
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          last_login_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_login_attempts: {
        Row: {
          admin_id: string | null
          created_at: string
          id: string
          ip: string | null
          success: boolean
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          success?: boolean
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          success?: boolean
        }
        Relationships: []
      }
      admin_step_up_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_used_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      ambulance_requests: {
        Row: {
          ambulance_type: string
          channel: string
          contacts: Json
          created_at: string
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          error_message: string | null
          health_summary: string | null
          id: string
          patient_name: string | null
          payload: Json
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          response: Json | null
          source: string
          status: string
          updated_at: string
          user_id: string
          ward_user_id: string | null
        }
        Insert: {
          ambulance_type?: string
          channel?: string
          contacts?: Json
          created_at?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          error_message?: string | null
          health_summary?: string | null
          id?: string
          patient_name?: string | null
          payload?: Json
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          response?: Json | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
          ward_user_id?: string | null
        }
        Update: {
          ambulance_type?: string
          channel?: string
          contacts?: Json
          created_at?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          error_message?: string | null
          health_summary?: string | null
          id?: string
          patient_name?: string | null
          payload?: Json
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          response?: Json | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          ward_user_id?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          alarm_enabled: boolean
          alarm_sound: string
          appointment_type: string
          created_at: string
          created_by: string | null
          description: string | null
          doctor_name: string | null
          end_date: string | null
          end_time: string | null
          first_alert: string
          id: string
          location: string | null
          recurrence: string
          second_alert: string | null
          share_status: string
          shared_with_doctor: boolean
          start_date: string
          start_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alarm_enabled?: boolean
          alarm_sound?: string
          appointment_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          doctor_name?: string | null
          end_date?: string | null
          end_time?: string | null
          first_alert?: string
          id?: string
          location?: string | null
          recurrence?: string
          second_alert?: string | null
          share_status?: string
          shared_with_doctor?: boolean
          start_date: string
          start_time: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alarm_enabled?: boolean
          alarm_sound?: string
          appointment_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          doctor_name?: string | null
          end_date?: string | null
          end_time?: string | null
          first_alert?: string
          id?: string
          location?: string | null
          recurrence?: string
          second_alert?: string | null
          share_status?: string
          shared_with_doctor?: boolean
          start_date?: string
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blood_banks: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          district: string | null
          email: string | null
          geocode_status: string
          geocoded_at: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          source_sno: number | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          geocode_status?: string
          geocoded_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          source_sno?: number | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          geocode_status?: string
          geocoded_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
          source_sno?: number | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      care_journal: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          mood: string
          notes: string | null
          symptoms: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          mood: string
          notes?: string | null
          symptoms?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          mood?: string
          notes?: string | null
          symptoms?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          responded_at: string | null
          response: string | null
          scheduled_at: string
          sentiment_data: Json | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          responded_at?: string | null
          response?: string | null
          scheduled_at: string
          sentiment_data?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          responded_at?: string | null
          response?: string | null
          scheduled_at?: string
          sentiment_data?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          message: string
          phone: string | null
          responded_at: string | null
          source: string
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          message: string
          phone?: string | null
          responded_at?: string | null
          source?: string
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string
          phone?: string | null
          responded_at?: string | null
          source?: string
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          applicable_plans: string[]
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          used_count: number
        }
        Insert: {
          applicable_plans?: string[]
          code: string
          created_at?: string
          discount_type?: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          used_count?: number
        }
        Update: {
          applicable_plans?: string[]
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          used_count?: number
        }
        Relationships: []
      }
      email_alert_config: {
        Row: {
          bounce_rate_threshold: number
          complaint_rate_threshold: number
          cooldown_minutes: number
          dlq_growth_threshold: number
          dlq_total_threshold: number
          enabled: boolean
          extra_notification_emails: string
          id: number
          no_send_window_minutes: number
          rate_limit_alert_minutes: number
          stuck_queue_minutes: number
          updated_at: string
        }
        Insert: {
          bounce_rate_threshold?: number
          complaint_rate_threshold?: number
          cooldown_minutes?: number
          dlq_growth_threshold?: number
          dlq_total_threshold?: number
          enabled?: boolean
          extra_notification_emails?: string
          id?: number
          no_send_window_minutes?: number
          rate_limit_alert_minutes?: number
          stuck_queue_minutes?: number
          updated_at?: string
        }
        Update: {
          bounce_rate_threshold?: number
          complaint_rate_threshold?: number
          cooldown_minutes?: number
          dlq_growth_threshold?: number
          dlq_total_threshold?: number
          enabled?: boolean
          extra_notification_emails?: string
          id?: number
          no_send_window_minutes?: number
          rate_limit_alert_minutes?: number
          stuck_queue_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_alert_log: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          message: string
          metadata: Json
          severity: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          severity?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          severity?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emergency_share_tokens: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      encrypted_documents: {
        Row: {
          category: string
          created_at: string
          doc_type: string
          encrypted_value: string
          id: string
          iv: string
          label: string | null
          salt: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          doc_type: string
          encrypted_value: string
          id?: string
          iv: string
          label?: string | null
          salt: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          doc_type?: string
          encrypted_value?: string
          id?: string
          iv?: string
          label?: string | null
          salt?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      face_scans: {
        Row: {
          confidence: string
          created_at: string
          heart_rate: number
          id: string
          sample_count: number
          scanned_at: string
          stress_level: string
          stress_score: number
          user_id: string
        }
        Insert: {
          confidence: string
          created_at?: string
          heart_rate: number
          id?: string
          sample_count?: number
          scanned_at?: string
          stress_level: string
          stress_score: number
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          heart_rate?: number
          id?: string
          sample_count?: number
          scanned_at?: string
          stress_level?: string
          stress_score?: number
          user_id?: string
        }
        Relationships: []
      }
      guardian_pings: {
        Row: {
          created_at: string
          guardian_read: boolean
          guardian_user_id: string
          id: string
          initiated_by: string
          message: string
          read: boolean
          replied_at: string | null
          reply_message: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          guardian_read?: boolean
          guardian_user_id: string
          id?: string
          initiated_by?: string
          message: string
          read?: boolean
          replied_at?: string | null
          reply_message?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          guardian_read?: boolean
          guardian_user_id?: string
          id?: string
          initiated_by?: string
          message?: string
          read?: boolean
          replied_at?: string | null
          reply_message?: string | null
          user_id?: string
        }
        Relationships: []
      }
      guardians: {
        Row: {
          created_at: string
          guardian_email: string | null
          guardian_name: string
          guardian_phone: string
          guardian_user_id: string | null
          id: string
          install_confirmed_at: string | null
          is_primary: boolean
          is_vault_nominee: boolean
          last_reminder_at: string | null
          nominated_at: string
          nomination_expires_at: string | null
          nomination_token: string | null
          relation: string | null
          reminder_count: number
          status: string
          user_id: string
          ward_notified_unaccepted: boolean
        }
        Insert: {
          created_at?: string
          guardian_email?: string | null
          guardian_name: string
          guardian_phone: string
          guardian_user_id?: string | null
          id?: string
          install_confirmed_at?: string | null
          is_primary?: boolean
          is_vault_nominee?: boolean
          last_reminder_at?: string | null
          nominated_at?: string
          nomination_expires_at?: string | null
          nomination_token?: string | null
          relation?: string | null
          reminder_count?: number
          status?: string
          user_id: string
          ward_notified_unaccepted?: boolean
        }
        Update: {
          created_at?: string
          guardian_email?: string | null
          guardian_name?: string
          guardian_phone?: string
          guardian_user_id?: string | null
          id?: string
          install_confirmed_at?: string | null
          is_primary?: boolean
          is_vault_nominee?: boolean
          last_reminder_at?: string | null
          nominated_at?: string
          nomination_expires_at?: string | null
          nomination_token?: string | null
          relation?: string | null
          reminder_count?: number
          status?: string
          user_id?: string
          ward_notified_unaccepted?: boolean
        }
        Relationships: []
      }
      health_passport_scores: {
        Row: {
          activity: number
          checkin: number
          created_at: string
          id: string
          medications: number
          nutrition: number
          overall: number
          score_date: string
          user_id: string
          vitals: number
          wellness: number
        }
        Insert: {
          activity?: number
          checkin?: number
          created_at?: string
          id?: string
          medications?: number
          nutrition?: number
          overall?: number
          score_date?: string
          user_id: string
          vitals?: number
          wellness?: number
        }
        Update: {
          activity?: number
          checkin?: number
          created_at?: string
          id?: string
          medications?: number
          nutrition?: number
          overall?: number
          score_date?: string
          user_id?: string
          vitals?: number
          wellness?: number
        }
        Relationships: []
      }
      health_profile: {
        Row: {
          allergies: string[] | null
          blood_group: string | null
          chronic_conditions: string[] | null
          created_at: string
          current_medications: string[] | null
          emergency_notes: string | null
          family_doctor_name: string | null
          family_doctor_phone: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string[] | null
          blood_group?: string | null
          chronic_conditions?: string[] | null
          created_at?: string
          current_medications?: string[] | null
          emergency_notes?: string | null
          family_doctor_name?: string | null
          family_doctor_phone?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string[] | null
          blood_group?: string | null
          chronic_conditions?: string[] | null
          created_at?: string
          current_medications?: string[] | null
          emergency_notes?: string | null
          family_doctor_name?: string | null
          family_doctor_phone?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      healthcare_expenses: {
        Row: {
          ai_extracted: Json | null
          amount: number
          bill_image_path: string | null
          category: Database["public"]["Enums"]["healthcare_expense_category"]
          created_at: string
          created_by: string
          currency: string
          expense_date: string
          id: string
          merchant: string | null
          notes: string | null
          source: Database["public"]["Enums"]["healthcare_expense_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_extracted?: Json | null
          amount: number
          bill_image_path?: string | null
          category?: Database["public"]["Enums"]["healthcare_expense_category"]
          created_at?: string
          created_by: string
          currency?: string
          expense_date?: string
          id?: string
          merchant?: string | null
          notes?: string | null
          source?: Database["public"]["Enums"]["healthcare_expense_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_extracted?: Json | null
          amount?: number
          bill_image_path?: string | null
          category?: Database["public"]["Enums"]["healthcare_expense_category"]
          created_at?: string
          created_by?: string
          currency?: string
          expense_date?: string
          id?: string
          merchant?: string | null
          notes?: string | null
          source?: Database["public"]["Enums"]["healthcare_expense_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jan_aushadhi_products: {
        Row: {
          category: string | null
          created_at: string
          drug_code: string | null
          generic_name: string
          id: string
          mrp: number
          salt_composition: string | null
          unit_size: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          drug_code?: string | null
          generic_name: string
          id?: string
          mrp?: number
          salt_composition?: string | null
          unit_size?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          drug_code?: string | null
          generic_name?: string
          id?: string
          mrp?: number
          salt_composition?: string | null
          unit_size?: string | null
        }
        Relationships: []
      }
      jan_aushadhi_stores: {
        Row: {
          address: string | null
          created_at: string
          district: string | null
          id: string
          lat: number | null
          lon: number | null
          phone: string | null
          pincode: string | null
          state: string | null
          store_name: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          district?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_name: string
        }
        Update: {
          address?: string | null
          created_at?: string
          district?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_name?: string
        }
        Relationships: []
      }
      journey_reports: {
        Row: {
          break_duration_min: number
          created_at: string
          destination_name: string
          deviation_count: number
          ended_at: string
          id: string
          journey_id: string
          max_deviation_m: number
          origin_name: string | null
          started_at: string
          total_distance_m: number
          total_duration_min: number
          transport_mode: string | null
          user_id: string
        }
        Insert: {
          break_duration_min?: number
          created_at?: string
          destination_name: string
          deviation_count?: number
          ended_at: string
          id?: string
          journey_id: string
          max_deviation_m?: number
          origin_name?: string | null
          started_at: string
          total_distance_m?: number
          total_duration_min?: number
          transport_mode?: string | null
          user_id: string
        }
        Update: {
          break_duration_min?: number
          created_at?: string
          destination_name?: string
          deviation_count?: number
          ended_at?: string
          id?: string
          journey_id?: string
          max_deviation_m?: number
          origin_name?: string | null
          started_at?: string
          total_distance_m?: number
          total_duration_min?: number
          transport_mode?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journey_share_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          journey_id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          journey_id: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          journey_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_share_tokens_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_updates: {
        Row: {
          check_in_response: string | null
          created_at: string
          id: string
          journey_id: string
          lat: number | null
          lng: number | null
          user_id: string
        }
        Insert: {
          check_in_response?: string | null
          created_at?: string
          id?: string
          journey_id: string
          lat?: number | null
          lng?: number | null
          user_id: string
        }
        Update: {
          check_in_response?: string | null
          created_at?: string
          id?: string
          journey_id?: string
          lat?: number | null
          lng?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_updates_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journeys: {
        Row: {
          created_at: string
          destination_lat: number
          destination_lng: number
          destination_name: string
          ended_at: string | null
          estimated_duration_min: number | null
          id: string
          origin_lat: number | null
          origin_lng: number | null
          origin_name: string | null
          started_at: string | null
          status: string
          transport_mode: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_lat: number
          destination_lng: number
          destination_name: string
          ended_at?: string | null
          estimated_duration_min?: number | null
          id?: string
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          started_at?: string | null
          status?: string
          transport_mode?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          destination_lat?: number
          destination_lng?: number
          destination_name?: string
          ended_at?: string | null
          estimated_duration_min?: number | null
          id?: string
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          started_at?: string | null
          status?: string
          transport_mode?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meal_logs: {
        Row: {
          created_at: string
          id: string
          items: Json
          log_date: string
          logged_at: string
          meal_name: string
          meal_type: string
          total_calories: number
          total_carbs_g: number
          total_fats_g: number
          total_fiber_g: number
          total_protein_g: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          log_date?: string
          logged_at?: string
          meal_name: string
          meal_type?: string
          total_calories?: number
          total_carbs_g?: number
          total_fats_g?: number
          total_fiber_g?: number
          total_protein_g?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          log_date?: string
          logged_at?: string
          meal_name?: string
          meal_type?: string
          total_calories?: number
          total_carbs_g?: number
          total_fats_g?: number
          total_fiber_g?: number
          total_protein_g?: number
          user_id?: string
        }
        Relationships: []
      }
      medical_history: {
        Row: {
          advice: string | null
          created_at: string
          doctor_name: string | null
          end_date: string | null
          hospital_name: string | null
          id: string
          medications: string | null
          nature: string | null
          reason: string
          start_date: string | null
          treatment: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          advice?: string | null
          created_at?: string
          doctor_name?: string | null
          end_date?: string | null
          hospital_name?: string | null
          id?: string
          medications?: string | null
          nature?: string | null
          reason: string
          start_date?: string | null
          treatment?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          advice?: string | null
          created_at?: string
          doctor_name?: string | null
          end_date?: string | null
          hospital_name?: string | null
          id?: string
          medications?: string | null
          nature?: string | null
          reason?: string
          start_date?: string | null
          treatment?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medical_records: {
        Row: {
          created_at: string
          description: string | null
          doctor_name: string | null
          file_name: string | null
          file_url: string | null
          hospital_name: string | null
          id: string
          page_index: number
          record_date: string | null
          record_slot: string | null
          record_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          doctor_name?: string | null
          file_name?: string | null
          file_url?: string | null
          hospital_name?: string | null
          id?: string
          page_index?: number
          record_date?: string | null
          record_slot?: string | null
          record_type: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          doctor_name?: string | null
          file_name?: string | null
          file_url?: string | null
          hospital_name?: string | null
          id?: string
          page_index?: number
          record_date?: string | null
          record_slot?: string | null
          record_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medication_logs: {
        Row: {
          created_at: string
          id: string
          medication_id: string
          scheduled_at: string
          status: string
          taken_at: string | null
          user_id: string
          whatsapp_alerted_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          medication_id: string
          scheduled_at: string
          status?: string
          taken_at?: string | null
          user_id: string
          whatsapp_alerted_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          medication_id?: string
          scheduled_at?: string
          status?: string
          taken_at?: string | null
          user_id?: string
          whatsapp_alerted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_logs_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_orders: {
        Row: {
          created_at: string
          doctor_name: string | null
          hospital_name: string | null
          id: string
          items: Json
          ordered_by: string
          pharmacy_phone: string | null
          received_at: string | null
          send_method: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doctor_name?: string | null
          hospital_name?: string | null
          id?: string
          items?: Json
          ordered_by: string
          pharmacy_phone?: string | null
          received_at?: string | null
          send_method?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doctor_name?: string | null
          hospital_name?: string | null
          id?: string
          items?: Json
          ordered_by?: string
          pharmacy_phone?: string | null
          received_at?: string | null
          send_method?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          alarm_enabled: boolean
          alarm_mode: string
          created_at: string
          dosage: string
          end_date: string | null
          frequency: string
          id: string
          instructions: string | null
          low_stock_threshold: number
          name: string
          refill_reminder: boolean
          remaining_quantity: number
          schedule_days: number[] | null
          schedule_times: string[]
          start_date: string
          total_quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          alarm_enabled?: boolean
          alarm_mode?: string
          created_at?: string
          dosage?: string
          end_date?: string | null
          frequency?: string
          id?: string
          instructions?: string | null
          low_stock_threshold?: number
          name: string
          refill_reminder?: boolean
          remaining_quantity?: number
          schedule_days?: number[] | null
          schedule_times?: string[]
          start_date?: string
          total_quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          alarm_enabled?: boolean
          alarm_mode?: string
          created_at?: string
          dosage?: string
          end_date?: string | null
          frequency?: string
          id?: string
          instructions?: string | null
          low_stock_threshold?: number
          name?: string
          refill_reminder?: boolean
          remaining_quantity?: number
          schedule_days?: number[] | null
          schedule_times?: string[]
          start_date?: string
          total_quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          channel: string
          created_at: string
          guardian_id: string | null
          id: string
          metadata: Json | null
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          guardian_id?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          type: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          guardian_id?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians_ward_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          guardian_id: string | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          guardian_id?: string | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          guardian_id?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians_ward_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_personas: {
        Row: {
          activity_level: string | null
          age: number | null
          alcohol: string | null
          allergies: string[] | null
          blood_group: string | null
          created_at: string
          daily_calorie_goal: number | null
          date_of_birth: string | null
          diet_type: string
          dietary_preferences: string[] | null
          health_goals: string[] | null
          height_m: number | null
          id: string
          medical_conditions: string[] | null
          smoking: string | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          alcohol?: string | null
          allergies?: string[] | null
          blood_group?: string | null
          created_at?: string
          daily_calorie_goal?: number | null
          date_of_birth?: string | null
          diet_type?: string
          dietary_preferences?: string[] | null
          health_goals?: string[] | null
          height_m?: number | null
          id?: string
          medical_conditions?: string[] | null
          smoking?: string | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          alcohol?: string | null
          allergies?: string[] | null
          blood_group?: string | null
          created_at?: string
          daily_calorie_goal?: number | null
          date_of_birth?: string | null
          diet_type?: string
          dietary_preferences?: string[] | null
          health_goals?: string[] | null
          height_m?: number | null
          id?: string
          medical_conditions?: string[] | null
          smoking?: string | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      otp_events: {
        Row: {
          action: string
          attempts: number
          channel: string | null
          created_at: string
          delivery_status: string | null
          delivery_time: string | null
          expires_at: string | null
          failure_reason: string | null
          id: string
          otp_hash: string | null
          phone: string
          request_id: string | null
          status: string
          verified: boolean
        }
        Insert: {
          action?: string
          attempts?: number
          channel?: string | null
          created_at?: string
          delivery_status?: string | null
          delivery_time?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          otp_hash?: string | null
          phone: string
          request_id?: string | null
          status?: string
          verified?: boolean
        }
        Update: {
          action?: string
          attempts?: number
          channel?: string | null
          created_at?: string
          delivery_status?: string | null
          delivery_time?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          otp_hash?: string | null
          phone?: string
          request_id?: string | null
          status?: string
          verified?: boolean
        }
        Relationships: []
      }
      ppg_sessions: {
        Row: {
          avg_heart_rate: number | null
          created_at: string
          duration_sec: number
          id: string
          notes: string | null
          recorded_at: string
          samples: Json
          user_id: string
        }
        Insert: {
          avg_heart_rate?: number | null
          created_at?: string
          duration_sec?: number
          id?: string
          notes?: string | null
          recorded_at?: string
          samples?: Json
          user_id: string
        }
        Update: {
          avg_heart_rate?: number | null
          created_at?: string
          duration_sec?: number
          id?: string
          notes?: string | null
          recorded_at?: string
          samples?: Json
          user_id?: string
        }
        Relationships: []
      }
      premium_plus_waitlist: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          notified_at: string | null
          phone: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          notified_at?: string | null
          phone?: string | null
          source?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          notified_at?: string | null
          phone?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      privacy_requests: {
        Row: {
          created_at: string
          id: string
          legal_basis: string | null
          request_type: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          legal_basis?: string | null
          request_type: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          legal_basis?: string | null
          request_type?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          blocked_at: string | null
          blocked_reason: string | null
          blood_group: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          full_name: string | null
          gender: string | null
          height_m: number | null
          id: string
          last_active_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          trial_started_at: string | null
          updated_at: string
          weight_kg: number | null
          welcome_sent_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          full_name?: string | null
          gender?: string | null
          height_m?: number | null
          id: string
          last_active_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          trial_started_at?: string | null
          updated_at?: string
          weight_kg?: number | null
          welcome_sent_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          full_name?: string | null
          gender?: string | null
          height_m?: number | null
          id?: string
          last_active_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          trial_started_at?: string | null
          updated_at?: string
          weight_kg?: number | null
          welcome_sent_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      safe_zones: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          lat: number
          lng: number
          name: string
          radius_m: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          lat: number
          lng: number
          name: string
          radius_m?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          lat?: number
          lng?: number
          name?: string
          radius_m?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_destinations: {
        Row: {
          created_at: string
          id: string
          is_favorite: boolean
          last_used_at: string
          lat: number
          lng: number
          name: string
          place_id: string | null
          use_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string
          lat: number
          lng: number
          name: string
          place_id?: string | null
          use_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string
          lat?: number
          lng?: number
          name?: string
          place_id?: string | null
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      sos_events: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          resolved_at: string | null
          status: string
          trigger_type: string
          triggered_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          resolved_at?: string | null
          status?: string
          trigger_type?: string
          triggered_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          resolved_at?: string | null
          status?: string
          trigger_type?: string
          triggered_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sos_message_attempts: {
        Row: {
          accepted_at: string
          channel: string
          created_at: string
          delivered_at: string | null
          delivery_status: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          provider: string
          provider_status: string | null
          raw_response: Json | null
          recipient_phone: string
          request_id: string | null
          sos_event_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          channel: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          provider?: string
          provider_status?: string | null
          raw_response?: Json | null
          recipient_phone: string
          request_id?: string | null
          sos_event_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          provider?: string
          provider_status?: string | null
          raw_response?: Json | null
          recipient_phone?: string
          request_id?: string | null
          sos_event_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_message_attempts_sos_event_id_fkey"
            columns: ["sos_event_id"]
            isOneToOne: false
            referencedRelation: "sos_events"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_paise: number
          billing_cycle: string
          coupon_code: string | null
          created_at: string
          expires_at: string
          id: string
          is_trial: boolean
          plan_type: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paise?: number
          billing_cycle: string
          coupon_code?: string | null
          created_at?: string
          expires_at: string
          id?: string
          is_trial?: boolean
          plan_type: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paise?: number
          billing_cycle?: string
          coupon_code?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_trial?: boolean
          plan_type?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_facilities: {
        Row: {
          address: string | null
          created_at: string
          facility_type: string
          id: string
          lat: number
          lon: number
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          facility_type: string
          id?: string
          lat: number
          lon: number
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          facility_type?: string
          id?: string
          lat?: number
          lon?: number
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_nominee_claims: {
        Row: {
          acknowledged: boolean
          admin_reviewed_by: string | null
          certificate_number: string | null
          created_at: string
          date_of_death: string | null
          death_certificate_url: string | null
          file_hashes: Json | null
          guardian_id: string
          id: string
          id_number_last4: string | null
          id_proof_url: string | null
          id_type: string | null
          issuing_authority: string | null
          nominee_typed_name: string | null
          proof_uploaded_at: string | null
          reauth_at: string | null
          reject_reason: string | null
          rejected_at: string | null
          released_at: string | null
          selfie_url: string | null
          status: string
          updated_at: string
          user_id: string
          user_window_ends_at: string | null
          user_window_started_at: string | null
        }
        Insert: {
          acknowledged?: boolean
          admin_reviewed_by?: string | null
          certificate_number?: string | null
          created_at?: string
          date_of_death?: string | null
          death_certificate_url?: string | null
          file_hashes?: Json | null
          guardian_id: string
          id?: string
          id_number_last4?: string | null
          id_proof_url?: string | null
          id_type?: string | null
          issuing_authority?: string | null
          nominee_typed_name?: string | null
          proof_uploaded_at?: string | null
          reauth_at?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          released_at?: string | null
          selfie_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          user_window_ends_at?: string | null
          user_window_started_at?: string | null
        }
        Update: {
          acknowledged?: boolean
          admin_reviewed_by?: string | null
          certificate_number?: string | null
          created_at?: string
          date_of_death?: string | null
          death_certificate_url?: string | null
          file_hashes?: Json | null
          guardian_id?: string
          id?: string
          id_number_last4?: string | null
          id_proof_url?: string | null
          id_type?: string | null
          issuing_authority?: string | null
          nominee_typed_name?: string | null
          proof_uploaded_at?: string | null
          reauth_at?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          released_at?: string | null
          selfie_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_window_ends_at?: string | null
          user_window_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_nominee_claims_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_nominee_claims_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians_ward_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_pin_escrow: {
        Row: {
          admin_share_encrypted: string
          created_at: string
          guardian_id: string | null
          guardian_share_encrypted: string
          id: string
          pin_hash: string
          recovery_share_hint: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_share_encrypted: string
          created_at?: string
          guardian_id?: string | null
          guardian_share_encrypted: string
          id?: string
          pin_hash: string
          recovery_share_hint?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_share_encrypted?: string
          created_at?: string
          guardian_id?: string | null
          guardian_share_encrypted?: string
          id?: string
          pin_hash?: string
          recovery_share_hint?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_pin_escrow_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_pin_escrow_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians_ward_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_pins: {
        Row: {
          created_at: string
          id: string
          pin_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pin_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pin_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_release_tokens: {
        Row: {
          claim_id: string
          created_at: string
          expires_at: string
          guardian_id: string
          id: string
          otp_attempts: number
          otp_hash: string | null
          payload_encrypted: string | null
          payload_iv: string | null
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          expires_at?: string
          guardian_id: string
          id?: string
          otp_attempts?: number
          otp_hash?: string | null
          payload_encrypted?: string | null
          payload_iv?: string | null
          token?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          expires_at?: string
          guardian_id?: string
          id?: string
          otp_attempts?: number
          otp_hash?: string | null
          payload_encrypted?: string | null
          payload_iv?: string | null
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_release_tokens_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "vault_nominee_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_reminder_meta: {
        Row: {
          created_at: string
          display_label: string
          doc_id: string
          id: string
          kind: string
          next_reminder_at: string
          target_date: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_label: string
          doc_id: string
          id?: string
          kind: string
          next_reminder_at: string
          target_date?: string | null
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_label?: string
          doc_id?: string
          id?: string
          kind?: string
          next_reminder_at?: string
          target_date?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_reminder_meta_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "encrypted_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals_retention_notices: {
        Row: {
          id: string
          purge_date: string
          sent_at: string
          stage: string
          user_id: string
        }
        Insert: {
          id?: string
          purge_date: string
          sent_at?: string
          stage: string
          user_id: string
        }
        Update: {
          id?: string
          purge_date?: string
          sent_at?: string
          stage?: string
          user_id?: string
        }
        Relationships: []
      }
      wellness_logs: {
        Row: {
          created_at: string
          energy_level: number | null
          id: string
          log_date: string
          mindfulness_minutes: number | null
          mood: string
          mood_score: number
          notes: string | null
          sleep_hours: number | null
          sleep_quality: number | null
          stress_level: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          energy_level?: number | null
          id?: string
          log_date?: string
          mindfulness_minutes?: number | null
          mood?: string
          mood_score?: number
          notes?: string | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          stress_level?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          energy_level?: number | null
          id?: string
          log_date?: string
          mindfulness_minutes?: number | null
          mood?: string
          mood_score?: number
          notes?: string | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          stress_level?: number | null
          user_id?: string
        }
        Relationships: []
      }
      zone_exit_declines: {
        Row: {
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          user_id: string
          zone_id: string | null
          zone_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          user_id: string
          zone_id?: string | null
          zone_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          user_id?: string
          zone_id?: string | null
          zone_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      guardians_emergency_safe: {
        Row: {
          guardian_name: string | null
          guardian_phone: string | null
          is_primary: boolean | null
          relation: string | null
          user_id: string | null
        }
        Insert: {
          guardian_name?: string | null
          guardian_phone?: string | null
          is_primary?: boolean | null
          relation?: string | null
          user_id?: string | null
        }
        Update: {
          guardian_name?: string | null
          guardian_phone?: string | null
          is_primary?: boolean | null
          relation?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      guardians_ward_safe: {
        Row: {
          created_at: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_user_id: string | null
          id: string | null
          is_primary: boolean | null
          is_vault_nominee: boolean | null
          nominated_at: string | null
          nomination_expires_at: string | null
          relation: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_user_id?: string | null
          id?: string | null
          is_primary?: boolean | null
          is_vault_nominee?: boolean | null
          nominated_at?: string | null
          nomination_expires_at?: string | null
          relation?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_user_id?: string | null
          id?: string | null
          is_primary?: boolean | null
          is_vault_nominee?: boolean | null
          nominated_at?: string | null
          nomination_expires_at?: string | null
          relation?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_link_guardian_once: {
        Args: { p_guardian_id: string; p_user_id: string }
        Returns: string
      }
      check_guardian_nomination: { Args: { _phone: string }; Returns: boolean }
      cleanup_admin_2fa: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dispatch_sos_alert: {
        Args: { _sos_event_id: string }
        Returns: undefined
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      email_queue_stats: {
        Args: never
        Returns: {
          depth: number
          oldest_age_seconds: number
          queue_name: string
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_stale_nominations: { Args: never; Returns: number }
      expire_stale_subscriptions: { Args: never; Returns: number }
      get_email_by_phone: { Args: { _phone: string }; Returns: string }
      get_emergency_profile: { Args: { _token: string }; Returns: Json }
      get_public_journey: {
        Args: { _token: string }
        Returns: {
          current_lat: number
          current_lng: number
          destination_lat: number
          destination_lng: number
          destination_name: string
          started_at: string
          status: string
          transport_mode: string
          updated_at: string
        }[]
      }
      guardian_ward_count: {
        Args: { _guardian_email: string }
        Returns: number
      }
      guardian_ward_count_by_phone: {
        Args: { _phone: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_notification_deduped: {
        Args: {
          p_guardian_id?: string
          p_message: string
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: undefined
      }
      insert_notifications_deduped: {
        Args: { p_notifications: Json }
        Returns: undefined
      }
      invoke_edge_fn: {
        Args: { _body?: Json; _fn: string }
        Returns: undefined
      }
      is_accepted_guardian_of: { Args: { _user_id: string }; Returns: boolean }
      is_accepted_vault_nominee: {
        Args: { _guardian_id: string; _user_id: string }
        Returns: boolean
      }
      link_guardian_user_id: { Args: never; Returns: undefined }
      lookup_emergency_token: {
        Args: { _token: string }
        Returns: {
          user_id: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      purge_dlq: { Args: { dlq_name: string }; Returns: number }
      read_dlq_messages: {
        Args: { dlq_name: string; limit_count?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      remove_email_suppression: {
        Args: { email_addr: string }
        Returns: boolean
      }
      requeue_dlq_message: {
        Args: { dlq_name: string; msg_id: number }
        Returns: number
      }
      sos_dispatch_safety_net: { Args: never; Returns: number }
      vault_claim_keys_unchanged: {
        Args: { _guardian_id: string; _id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "guardian"
      healthcare_expense_category:
        | "medication"
        | "doctor_fees"
        | "insurance"
        | "diagnostics"
        | "equipment_caregiving"
        | "other"
      healthcare_expense_source: "manual" | "voice" | "bill_scan"
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
      app_role: ["admin", "moderator", "user", "guardian"],
      healthcare_expense_category: [
        "medication",
        "doctor_fees",
        "insurance",
        "diagnostics",
        "equipment_caregiving",
        "other",
      ],
      healthcare_expense_source: ["manual", "voice", "bill_scan"],
    },
  },
} as const
