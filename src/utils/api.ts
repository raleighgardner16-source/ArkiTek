import axios from 'axios'
import { API_URL, API_PREFIX } from './config'
import { useStore } from '../store/useStore'

const api = axios.create({
  baseURL: `${API_URL}${API_PREFIX}`,
})

api.interceptors.request.use((config) => {
  const token = useStore.getState().authToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const store = useStore.getState()
      if (store.currentUser) {
        store.clearCurrentUser()
        window.location.href = '/signin'
      }
    }
    return Promise.reject(error)
  }
)

export default api

/**
 * Returns the auth headers object for use with raw fetch() calls (e.g., SSE streaming).
 */
export const getAuthHeaders = (): Record<string, string> => {
  const token = useStore.getState().authToken
  return token ? { Authorization: `Bearer ${token}` } : {}
}
