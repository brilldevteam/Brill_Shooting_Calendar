export const statuses = [
  "Draft",
  "Pending Approval",
  "Confirmed",
  "Rejected",
  "Reschedule Requested",
  "Cancelled On Time",
  "Late Cancellation",
  "Completed",
  "No Show",
  "Urgent Shoot",
] as const;
export type BookingStatus = (typeof statuses)[number];
export type Role = "client" | "admin" | "super_admin";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export interface Profile {
  id: string;
  organization_id: string | null;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  status: string;
}
export interface Organization {
  id: string;
  name: string;
  status: string;
}
export interface Rules {
  timezone: string;
  working_days: number[];
  lead_time_days: number;
  cancellation_window_hours: number;
  pending_blocks: boolean;
  day_start: number;
  day_end: number;
  allow_future_usage: boolean;
  allow_carry_forward: boolean;
  max_advance_sessions: number | null;
  advance_policy: "numeric" | "unlimited" | "approval";
  carry_forward_expiry_months: number;
}
export interface Contract {
  id: string;
  organization_id: string;
  start_date: string;
  end_date: string;
  monthly_allowance: number;
  total_entitlement: number;
  lead_time_days: number | null;
  cancellation_window_hours: number | null;
  allow_future_usage: boolean;
  max_advance_sessions: number | null;
  advance_policy: "numeric" | "unlimited" | "approval";
  allow_carry_forward: boolean;
  carry_forward_expiry_months: number;
  status: string;
}
export interface Booking {
  id: string;
  organization_id: string;
  contract_id: string;
  created_by: string;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  location: string;
  subject: string;
  topics: string;
  expected_reels: number;
  script_ready: boolean;
  content_plan_ready: boolean;
  equipment_requirements: string;
  additional_notes: string;
  shoot_type: string;
  resource_id: string | null;
  urgent: boolean;
  cancellation_deadline: string | null;
  allocation_month: string | null;
  session_source: string | null;
  proposed_start: string | null;
  proposed_end: string | null;
  change_reason: string | null;
  late_change: boolean;
  created_at: string;
  approved_at: string | null;
  shooting_log_id: string | null;
}
export interface Allocation {
  id: string;
  contract_id: string;
  month: string;
  original_allocation: number;
  carry_forward_received: number;
  advance_sessions_used: number;
  normal_sessions_used: number;
  remaining: number;
}
export interface Ledger {
  id: string;
  organization_id: string;
  contract_id: string;
  booking_id: string | null;
  allocation_month: string;
  session_source: string;
  transaction_type: string;
  quantity: number;
  balance_before: number;
  balance_after: number;
  reason: string;
  created_at: string;
}
export interface Audit {
  id: string;
  booking_id: string | null;
  action: string;
  actor_user_id: string | null;
  old_values: Json;
  new_values: Json;
  metadata: Json;
  created_at: string;
}
export interface Notice {
  id: string;
  booking_id: string | null;
  recipient_user_id: string | null;
  channel: string;
  event_type: string;
  status: string;
  failure_reason: string | null;
  attempts: number;
  created_at: string;
  payload: Record<string, Json>;
}
export interface Block {
  id: string;
  start_at: string;
  end_at: string;
  block_type: string;
  reason: string;
  resource_id: string | null;
}
export interface BusySlot {
  start_at: string;
  end_at: string;
  resource_id: string | null;
}
export interface Resource {
  id: string;
  name: string;
  kind: string;
  active: boolean;
}
export interface BookingFile {
  id: string;
  booking_id: string;
  file_name: string;
  storage_path: string;
  file_type: string;
  category: string;
  uploaded_at: string;
}
export interface CarryForward {
  id: string;
  contract_id: string;
  source_month: string;
  target_month: string;
  original_amount: number;
  amount: number;
  used: number;
  expires_at: string;
}
export interface Template {
  id: string;
  event_type: string;
  channel: string;
  subject: string;
  body: string;
  enabled: boolean;
}
export interface ShootingLog {
  id: string;
  booking_id: string;
  organization_id: string;
  payload: Record<string, Json>;
  status: string;
  actual_start: string | null;
  actual_end: string | null;
  production_notes: string;
  post_shoot_confirmed: boolean;
  failure_reason: string | null;
}
export interface ContractBalance {
  contract_id: string;
  total_remaining: number;
  future_used: number;
  confirmed_upcoming: number;
}
export interface PortalData {
  preview?: boolean;
  balances: ContractBalance[];
  profile: Profile;
  profiles: Profile[];
  organizations: Organization[];
  contracts: Contract[];
  bookings: Booking[];
  allocations: Allocation[];
  ledger: Ledger[];
  audits: Audit[];
  notifications: Notice[];
  blocks: Block[];
  busy: BusySlot[];
  resources: Resource[];
  files: BookingFile[];
  carry: CarryForward[];
  templates: Template[];
  logs: ShootingLog[];
  rules: Rules;
}
