/**
 * Typed API Client for Weekly Report Generator & Team Dashboard
 * Handles token attachment, response parsing, and silent 401 refresh interception.
 */

let inMemoryToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

export const setAccessToken = (token: string | null) => {
  inMemoryToken = token;
};

export const getAccessToken = (): string | null => {
  return inMemoryToken;
};

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

export class ApiError extends Error {
  statusCode: number;
  data: any;

  constructor(statusCode: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Base HTTP request wrapper with Bearer token injection and automatic 401 refresh logic.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (inMemoryToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${inMemoryToken}`;
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Ensure httpOnly cookies are sent for refresh token
  };

  const response = await fetch(url, config);

  // If unauthorized (401) and not already calling an auth route, try refreshing token
  if (
    response.status === 401 &&
    !endpoint.includes('/api/auth/login') &&
    !endpoint.includes('/api/auth/refresh') &&
    !endpoint.includes('/api/auth/register')
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshUrl = `${API_BASE_URL}/api/auth/refresh`;
        const refreshRes = await fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          const newToken = refreshData.accessToken;
          setAccessToken(newToken);
          isRefreshing = false;
          onTokenRefreshed(newToken);

          // Retry current request with new token
          headers['Authorization'] = `Bearer ${newToken}`;
          return apiRequest<T>(endpoint, { ...options, headers });
        } else {
          isRefreshing = false;
          setAccessToken(null);
          window.dispatchEvent(new CustomEvent('auth:expired'));
          throw new ApiError(401, 'Session expired. Please log in again.');
        }
      } catch (err) {
        isRefreshing = false;
        setAccessToken(null);
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new ApiError(401, 'Session expired. Please log in again.');
      }
    } else {
      // Wait for the ongoing refresh to complete
      return new Promise<T>((resolve, reject) => {
        addRefreshSubscriber(async (newToken: string) => {
          try {
            headers['Authorization'] = `Bearer ${newToken}`;
            const retryRes = await apiRequest<T>(endpoint, { ...options, headers });
            resolve(retryRes);
          } catch (retryErr) {
            reject(retryErr);
          }
        });
      });
    }
  }

  // Parse response body
  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

// -------------------------------------------------------------
// Authentication API
// -------------------------------------------------------------
export const authApi = {
  register: (payload: { email: string; password: string; role?: 'team_member' | 'manager' }) =>
    apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    apiRequest<{ user: { id: string; email: string; role: string; active: boolean }; accessToken: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  refresh: () =>
    apiRequest<{ accessToken: string }>('/api/auth/refresh', {
      method: 'POST',
    }),

  logout: () =>
    apiRequest('/api/auth/logout', {
      method: 'POST',
    }),
};

// -------------------------------------------------------------
// Reports API
// -------------------------------------------------------------
export interface TaskCompletedItem {
  task_name: string;
  priority: 'low' | 'medium' | 'high';
  planned_percent: number;
  actual_percent: number;
  status: 'not_started' | 'in_progress' | 'done' | 'blocked';
  time_planned_hours: number;
  time_spent_hours: number;
  output_deliverable?: string;
}

export interface BlockerItem {
  text: string;
  is_key_issue: boolean;
}

export interface AchievementItem {
  text: string;
  is_key_achievement: boolean;
}

export interface HoursByType {
  development?: number;
  testing?: number;
  meetings?: number;
  documentation?: number;
}

export interface ReportContentPayload {
  tasks_completed: TaskCompletedItem[];
  tasks_planned_next_week: string[];
  blockers: BlockerItem[];
  achievements: AchievementItem[];
  hours_by_type?: HoursByType;
  notes?: string;
}

export interface ReportHeader {
  id: string;
  user_id: string;
  project_id: string;
  week_start: string;
  week_end: string;
  status: 'draft' | 'submitted' | 'needs_correction' | 'approved';
  current_comment?: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    role: string;
  };
  project?: {
    id: string;
    name: string;
    description?: string;
    active: boolean;
  };
}

export interface MergedReport extends ReportHeader {
  content: ReportContentPayload;
}

export const reportsApi = {
  listReports: (params?: { page?: number; limit?: number; status?: string; project_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.project_id) query.set('project_id', params.project_id);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ data: ReportHeader[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
      `/api/reports${qs}`
    );
  },

  getReportById: (id: string) => apiRequest<MergedReport>(`/api/reports/${id}`),

  createReport: (payload: { project_id: string; week_start: string; week_end: string }) =>
    apiRequest<{ message: string; report: ReportHeader; content: any }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateReportContent: (id: string, content: ReportContentPayload) =>
    apiRequest<{ message: string; report: ReportHeader; content: any }>(`/api/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(content),
    }),

  submitReport: (id: string) =>
    apiRequest<{ message: string; report: ReportHeader }>(`/api/reports/${id}/submit`, {
      method: 'POST',
    }),

  reviewReport: (id: string, payload: { action: 'approve' | 'request_changes'; comment?: string }) =>
    apiRequest<{ message: string; report: ReportHeader }>(`/api/reports/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getReportVersions: (id: string) =>
    apiRequest<{ versions: any[] }>(`/api/reports/${id}/versions`),

  getReportComments: (id: string) =>
    apiRequest<{ comments: any[] }>(`/api/reports/${id}/comments`),
};

// -------------------------------------------------------------
// Projects API
// -------------------------------------------------------------
export const projectsApi = {
  listProjects: (params?: { page?: number; limit?: number; active?: string | boolean; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.active !== undefined) query.set('active', String(params.active));
    if (params?.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
      `/api/projects${qs}`
    );
  },

  getProjectById: (id: string) => apiRequest<any>(`/api/projects/${id}`),

  createProject: (payload: { name: string; description?: string }) =>
    apiRequest<{ message: string; project: any }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProject: (id: string, payload: { name?: string; description?: string; active?: boolean }) =>
    apiRequest<{ message: string; project: any }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProject: (id: string) =>
    apiRequest<{ message: string; project: any }>(`/api/projects/${id}`, {
      method: 'DELETE',
    }),

  assignMember: (id: string, userId: string) =>
    apiRequest<{ message: string; membership: any }>(`/api/projects/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
};

// -------------------------------------------------------------
// Dashboard API (Manager Only)
// -------------------------------------------------------------
export interface DashboardSummary {
  total_submitted_this_week: number;
  active_members_count: number;
  compliance_rate: number;
  needs_correction_count: number;
  open_blockers_count: number;
  week_start: string;
}

export interface DashboardTrends {
  tasksTrend: { week: string; tasks_completed: number; hours_spent: number }[];
  memberStatus: { member: string; approved: number; submitted: number; needs_correction: number; draft: number }[];
  workloadByProject: { project: string; reports_count: number; total_hours: number }[];
  timeSpentByCategory: { category: string; hours: number }[];
  recentActivity: {
    id: string;
    type: string;
    comment: string;
    reviewer: string;
    author: string;
    project: string;
    report_id: string;
    timestamp: string;
  }[];
}

export const dashboardApi = {
  getSummary: (weekStart?: string) => {
    const qs = weekStart ? `?week_start=${weekStart}` : '';
    return apiRequest<DashboardSummary>(`/api/dashboard/summary${qs}`);
  },

  getReports: (params?: {
    week_start?: string;
    user_id?: string;
    project_id?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.week_start) query.set('week_start', params.week_start);
    if (params?.user_id) query.set('user_id', params.user_id);
    if (params?.project_id) query.set('project_id', params.project_id);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
      `/api/dashboard/reports${qs}`
    );
  },

  getTrends: () => apiRequest<DashboardTrends>('/api/dashboard/trends'),

  getSideBySide: (weekStart?: string, section: string = 'blockers') => {
    const query = new URLSearchParams();
    if (weekStart) query.set('week_start', weekStart);
    query.set('section', section);
    return apiRequest<{
      week_start: string;
      available_weeks: string[];
      section: string;
      members: {
        report_id: string;
        user_id: string;
        name?: string;
        email: string;
        project_name: string;
        status: string;
        data: any;
      }[];
    }>(`/api/dashboard/side-by-side?${query.toString()}`);
  },

  getAvailableWeeks: () => apiRequest<{ weeks: string[] }>('/api/dashboard/weeks'),
};

// -------------------------------------------------------------
// Users API (Manager / Admin Only)
// -------------------------------------------------------------
export const usersApi = {
  listUsers: (params?: { page?: number; limit?: number; search?: string; role?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
      `/api/users${qs}`
    );
  },

  createUser: (payload: { email: string; password?: string; role?: 'team_member' | 'manager' }) =>
    apiRequest<{ message: string; user: any }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRole: (id: string, role: 'team_member' | 'manager') =>
    apiRequest<{ message: string; user: any }>(`/api/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  updateStatus: (id: string, active: boolean) =>
    apiRequest<{ message: string; user: any }>(`/api/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    }),

  getUserStats: (id: string) => apiRequest<any>(`/api/users/${id}/stats`),
};

// -------------------------------------------------------------
// AI Assistant API (Manager Only)
// -------------------------------------------------------------
export interface AssistantQueryResponse {
  answer: string;
  reportCount: number;
  dateRange: { from: string; to: string } | null;
  filters: {
    member?: string | null;
    project?: string | null;
    status?: string | null;
  };
  provider: string;
  model?: string;
}

export const assistantApi = {
  query: (question: string) =>
    apiRequest<AssistantQueryResponse>('/api/assistant/query', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
};


