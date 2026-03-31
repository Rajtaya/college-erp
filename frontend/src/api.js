import axios from 'axios';

export const API_BASE = process.env.REACT_APP_API_URL || 'https://college-erp-backend-production.up.railway.app/api';
export const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

const API = axios.create({ baseURL: API_BASE });

API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

export default API;
