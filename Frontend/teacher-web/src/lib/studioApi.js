import { api } from "./api.js";

// One function per route in docs/API_CONTRACT.md ("Course Studio"). Nothing here is invented.
const enc = encodeURIComponent;

export const studioApi = {
  // courses
  listCourses: () => api.get("/teacher/courses"),
  createCourse: (body) => api.post("/teacher/courses", body),
  getCourse: (id) => api.get(`/teacher/courses/${enc(id)}`),
  updateCourse: (id, body) => api.patch(`/teacher/courses/${enc(id)}`, body),
  publishCourse: (id) => api.post(`/teacher/courses/${enc(id)}/publish`),
  unpublishCourse: (id) => api.post(`/teacher/courses/${enc(id)}/unpublish`),
  deleteCourse: (id) => api.del(`/teacher/courses/${enc(id)}`),
  courseStats: (id) => api.get(`/teacher/courses/${enc(id)}/stats`),
  courseClasses: (id) => api.get(`/teacher/courses/${enc(id)}/classes`),
  giveToClass: (id, classId) => api.put(`/teacher/courses/${enc(id)}/classes/${enc(classId)}`),
  takeFromClass: (id, classId) => api.del(`/teacher/courses/${enc(id)}/classes/${enc(classId)}`),

  // chapters (modules)
  createModule: (courseId, body) => api.post(`/teacher/courses/${enc(courseId)}/modules`, body),
  reorderModules: (courseId, ids) => api.put(`/teacher/courses/${enc(courseId)}/modules/order`, { ids }),
  updateModule: (id, body) => api.patch(`/teacher/modules/${enc(id)}`, body),
  deleteModule: (id) => api.del(`/teacher/modules/${enc(id)}`),

  // lessons
  createLesson: (moduleId, body) => api.post(`/teacher/modules/${enc(moduleId)}/lessons`, body),
  reorderLessons: (moduleId, ids) => api.put(`/teacher/modules/${enc(moduleId)}/lessons/order`, { ids }),
  updateLesson: (id, body) => api.patch(`/teacher/lessons/${enc(id)}`, body),
  deleteLesson: (id) => api.del(`/teacher/lessons/${enc(id)}`),

  // activities
  listActivities: (lessonId) => api.get(`/teacher/lessons/${enc(lessonId)}/activities`),
  createActivity: (lessonId, body) => api.post(`/teacher/lessons/${enc(lessonId)}/activities`, body),
  reorderActivities: (lessonId, ids) => api.put(`/teacher/lessons/${enc(lessonId)}/activities/order`, { ids }),
  updateActivity: (id, body) => api.patch(`/teacher/activities/${enc(id)}`, body),
  deleteActivity: (id) => api.del(`/teacher/activities/${enc(id)}`),
};
