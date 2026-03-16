/**
 * Alert entity interface - threshold breaches and notifications
 * Based on risk.alerts table
 */

export interface RiskAlert {
  id: string;
  subject_id: string;
  composite_score_id: string | null;
  alert_type:
    | 'threshold_breach'
    | 'rapid_change'
    | 'dimension_spike'
    | 'stale_assessment';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string | null;
  details: AlertDetails;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
}

/**
 * Alert details - type-specific information
 */
export interface AlertDetails {
  // For threshold_breach
  threshold?: number;
  actual_score?: number;

  // For rapid_change
  previous_score?: number;
  current_score?: number;
  change_percent?: number;
  time_window_hours?: number;

  // For dimension_spike
  dimension_slug?: string;
  dimension_score?: number;
  dimension_previous?: number;

  // For stale_assessment
  hours_since_assessment?: number;

  // Custom fields
  [key: string]: unknown;
}

/**
 * Unacknowledged alerts view - includes subject and scope info
 */
export interface UnacknowledgedAlertView extends RiskAlert {
  subject_identifier: string;
  subject_name: string | null;
  scope_name: string;
}

export interface CreateRiskAlertData {
  subject_id: string;
  composite_score_id?: string;
  alert_type:
    | 'threshold_breach'
    | 'rapid_change'
    | 'dimension_spike'
    | 'stale_assessment';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message?: string;
  details?: AlertDetails;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateRiskAlertData {
  acknowledged_at?: string;
  acknowledged_by?: string;
}
