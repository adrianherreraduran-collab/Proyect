'use strict';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
// Apply only the fields changed since the request read its snapshot. This keeps
// unrelated orders, reviews and settings written during an external API call.
function mergeState(base, incoming, current) {
  if (same(base, incoming)) return current;
  if (Array.isArray(base) && Array.isArray(incoming) && Array.isArray(current) && [...base, ...incoming, ...current].every(item => object(item) && item.id)) {
    const baseMap = new Map(base.map(item => [item.id, item]));
    const nextMap = new Map(incoming.map(item => [item.id, item]));
    const currentMap = new Map(current.map(item => [item.id, item]));
    const ids = [...new Set([...incoming.map(item => item.id), ...current.map(item => item.id)])];
    return ids.filter(id => !(baseMap.has(id) && !nextMap.has(id)) && !(baseMap.has(id) && !currentMap.has(id))).map(id => {
      if (!nextMap.has(id)) return currentMap.get(id);
      return mergeState(baseMap.get(id), nextMap.get(id), currentMap.get(id));
    });
  }
  if (object(base) && object(incoming) && object(current)) {
    const result = { ...current };
    for (const key of new Set([...Object.keys(base), ...Object.keys(incoming)])) {
      if (same(base[key], incoming[key])) continue;
      if (!(key in incoming)) delete result[key];
      else result[key] = mergeState(base[key], incoming[key], current[key]);
    }
    return result;
  }
  return incoming;
}
module.exports = { mergeState };
