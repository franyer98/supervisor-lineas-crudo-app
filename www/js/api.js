// api.js — Cliente HTTP hacia el backend (login, tramos, inspecciones, eventos, usuarios)
'use strict';

const API = (() => {
  const DEFAULT_BASE = 'https://supervisor-lineas-api.onrender.com';

  function getBase() { return localStorage.getItem('sl_api_base') || DEFAULT_BASE; }
  function setBase(url) { localStorage.setItem('sl_api_base', url.replace(/\/+$/, '')); }
  function getToken() { return localStorage.getItem('sl_token'); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem('sl_session') || 'null'); } catch (e) { return null; }
  }
  function setSession(tokenData) {
    localStorage.setItem('sl_token', tokenData.access_token);
    localStorage.setItem('sl_session', JSON.stringify({ role: tokenData.role, nombre: tokenData.nombre, username: tokenData.username }));
  }
  function clearSession() {
    localStorage.removeItem('sl_token');
    localStorage.removeItem('sl_session');
  }

  async function request(path, options = {}) {
    const token = getToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(getBase() + path, Object.assign({}, options, { headers }));
    } catch (e) {
      throw new Error('No se pudo conectar al servidor. Revisa tu conexión a internet.');
    }
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new CustomEvent('sl:session-expired'));
      throw new Error('Tu sesión expiró, inicia sesión de nuevo');
    }
    if (!res.ok) {
      let detail = 'Error del servidor (' + res.status + ')';
      try { const j = await res.json(); if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch (e) {}
      throw new Error(detail);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function normTramo(t) {
    if (!t) return t;
    return Object.assign({}, t, { createdAt: Date.parse(t.created_at) || Date.now() });
  }
  function normInspeccion(i) {
    if (!i) return i;
    return Object.assign({}, i, { tramoId: i.tramo_id, createdAt: Date.parse(i.created_at) || Date.now() });
  }
  function normEvento(e) {
    if (!e) return e;
    return Object.assign({}, e, {
      tramoId: e.tramo_id,
      createdAt: Date.parse(e.created_at) || Date.now(),
      closedAt: e.closed_at ? Date.parse(e.closed_at) : null,
    });
  }

  return {
    getBase, setBase, getToken, getSession, clearSession,
    isLoggedIn() { return !!getToken(); },

    async login(username, password) {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      setSession(data);
      return data;
    },
    logout() { clearSession(); },

    tramos: {
      list: async () => (await request('/tramos')).map(normTramo),
      create: async (obj) => normTramo(await request('/tramos', { method: 'POST', body: JSON.stringify(obj) })),
      update: async (id, obj) => normTramo(await request('/tramos/' + id, { method: 'PUT', body: JSON.stringify(obj) })),
      remove: (id) => request('/tramos/' + id, { method: 'DELETE' }),
    },
    inspecciones: {
      list: async () => (await request('/inspecciones')).map(normInspeccion),
      create: async (obj) => normInspeccion(await request('/inspecciones', { method: 'POST', body: JSON.stringify(Object.assign({}, obj, { tramo_id: obj.tramoId })) })),
      remove: (id) => request('/inspecciones/' + id, { method: 'DELETE' }),
    },
    eventos: {
      list: async () => (await request('/eventos')).map(normEvento),
      create: async (obj) => normEvento(await request('/eventos', { method: 'POST', body: JSON.stringify(Object.assign({}, obj, { tramo_id: obj.tramoId })) })),
      addSeguimiento: async (id, comentario) => normEvento(await request('/eventos/' + id + '/seguimiento', { method: 'POST', body: JSON.stringify({ comentario }) })),
      cerrar: async (id) => normEvento(await request('/eventos/' + id + '/cerrar', { method: 'POST' })),
      remove: (id) => request('/eventos/' + id, { method: 'DELETE' }),
    },
    users: {
      list: () => request('/users'),
      create: (obj) => request('/users', { method: 'POST', body: JSON.stringify(obj) }),
      update: (id, obj) => request('/users/' + id, { method: 'PATCH', body: JSON.stringify(obj) }),
      remove: (id) => request('/users/' + id, { method: 'DELETE' }),
    },
  };
})();
window.API = API;
