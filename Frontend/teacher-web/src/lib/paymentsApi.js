import { api } from "./api.js";

// One function per route in docs/API_CONTRACT.md ("Selling courses"). Nothing here is invented.
const enc = encodeURIComponent;

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const paymentsApi = {
  listRequests: (params = {}) => api.get(`/teacher/payment-requests${query(params)}`),
  proof: (id) => api.blob(`/teacher/payment-requests/${enc(id)}/proof`),
  approve: (id) => api.post(`/teacher/payment-requests/${enc(id)}/approve`),
  reject: (id, note) => api.post(`/teacher/payment-requests/${enc(id)}/reject`, { note: note || null }),
  courseAccess: (courseId) => api.get(`/teacher/courses/${enc(courseId)}/access`),
  revoke: (courseId, studentId) => api.del(`/teacher/courses/${enc(courseId)}/access/${enc(studentId)}`),
};

export const adminApi = {
  people: (params = {}) => api.get(`/admin/people${query(params)}`),
  person: (id) => api.get(`/admin/people/${enc(id)}`),
  updatePerson: (id, body) => api.patch(`/admin/people/${enc(id)}`, body),
  setOwner: (courseId, ownerId) => api.put(`/admin/courses/${enc(courseId)}/owner`, { owner_id: ownerId }),
  grant: (courseId, studentId, accessDays) =>
    api.put(`/admin/courses/${enc(courseId)}/access/${enc(studentId)}`, { access_days: accessDays }),
  setPassword: (id, password) => api.put(`/admin/people/${enc(id)}/password`, { password }),
  grantPro: (id, accessDays) => api.put(`/admin/people/${enc(id)}/pro`, { access_days: accessDays }),
  revokePro: (id) => api.del(`/admin/people/${enc(id)}/pro`),
  plans: () => api.get("/admin/plans"),
  createPlan: (body) => api.post("/admin/plans", body),
  updatePlan: (id, body) => api.patch(`/admin/plans/${enc(id)}`, body),
};
