export function setToken(token) {
  localStorage.setItem('token', token);
}
export function getToken() {
  return localStorage.getItem('token');
}
export function clearToken() {
  localStorage.removeItem('token');
}
export function isLoggedIn() {
  return !!getToken();
}
