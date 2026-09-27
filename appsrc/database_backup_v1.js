'use strict';

const crypto = require('crypto');

const FORMAT = 'FVMarket database backup';
const VERSION = 1;

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function checksum(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function createBackup(data, exportedAt = new Date().toISOString()) {
  const state = clone(data);
  return { format: FORMAT, version: VERSION, exportedAt, checksum: checksum(state), data: state };
}

function parseBackup(payload) {
  const backup = payload?.backup || payload;
  if (!plainObject(backup) || backup.format !== FORMAT || Number(backup.version) !== VERSION || !plainObject(backup.data)) {
    throw new Error('El archivo no es una copia válida de FVMarket.');
  }
  if (typeof backup.checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(backup.checksum) || checksum(backup.data) !== backup.checksum) {
    throw new Error('La comprobación de integridad de la copia no es válida.');
  }
  const state = clone(backup.data);
  for (const key of ['users', 'products', 'orders', 'quotes']) {
    if (!Array.isArray(state[key])) throw new Error('La copia no contiene una estructura de datos completa.');
  }
  if (!plainObject(state.settings)) throw new Error('La copia no contiene la configuración de FVMarket.');
  return state;
}

function preserveAdministrators(state, currentUsers = []) {
  const next = clone(state);
  next.users = Array.isArray(next.users) ? next.users : [];
  for (const admin of currentUsers.filter(user => user?.role === 'admin' && user.id)) {
    const index = next.users.findIndex(user => user?.id === admin.id);
    if (index >= 0) next.users[index] = { ...next.users[index], ...clone(admin), role: 'admin' };
    else next.users.unshift(clone(admin));
  }
  return next;
}

function initialState(seedState, currentUsers = []) {
  const next = clone(seedState);
  next.users = currentUsers.filter(user => user?.role === 'admin' && user.id).map(clone);
  return next;
}

module.exports = { FORMAT, VERSION, createBackup, parseBackup, preserveAdministrators, initialState };
