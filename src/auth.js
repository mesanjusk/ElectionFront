const USER_KEY = 'user';
const DATABASES_KEY = 'databases';
const ACTIVE_DATABASE_KEY = 'activeDatabaseId';

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getToken() {
  return localStorage.getItem('token');
}

export function setUser(user) {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse user from storage', e);
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setAvailableDatabases(databases = []) {
  if (!Array.isArray(databases) || !databases.length) {
    localStorage.removeItem(DATABASES_KEY);
    return;
  }
  localStorage.setItem(DATABASES_KEY, JSON.stringify(databases));
  const current = getActiveDatabase();
  if (!current || !databases.some((db) => db.id === current || db._id === current)) {
    const first = databases[0];
    const id = first.id || first._id;
    if (id) setActiveDatabase(id);
  }
}

export function getAvailableDatabases() {
  const raw = localStorage.getItem(DATABASES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse databases from storage', e);
    localStorage.removeItem(DATABASES_KEY);
    return [];
  }
}

export function setActiveDatabase(id) {
  if (!id) {
    localStorage.removeItem(ACTIVE_DATABASE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_DATABASE_KEY, String(id));
}

export function getActiveDatabase() {
  return localStorage.getItem(ACTIVE_DATABASE_KEY);
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(DATABASES_KEY);
  localStorage.removeItem(ACTIVE_DATABASE_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

export function isAdmin() {
  const user = getUser();
  return user?.role === 'admin';
}

export function setSession({ token, user, databases }) {
  if (token) setToken(token);
  setUser(user || null);
  setAvailableDatabases(databases || []);
}
