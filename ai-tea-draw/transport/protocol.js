'use strict';
const MAX_PACKET_BYTES = 768 * 1024;
const VERSION = 1;
function validateProject(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(value)) throw new Error('INVALID_PROJECT');
  return value;
}
function encode(project, room, data) {
  const buffer = Buffer.from(JSON.stringify({ version: VERSION, project, room, data }));
  if (buffer.length > MAX_PACKET_BYTES) throw new Error('PACKET_TOO_LARGE');
  return buffer;
}
function decode(buffer, project, room) {
  if (buffer.length > MAX_PACKET_BYTES) throw new Error('PACKET_TOO_LARGE');
  const value = JSON.parse(buffer.toString('utf8'));
  if (value.version !== VERSION || value.project !== project || value.room !== room) throw new Error('PROTOCOL_MISMATCH');
  if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) throw new Error('INVALID_MESSAGE');
  return value.data;
}
module.exports = { VERSION, MAX_PACKET_BYTES, validateProject, encode, decode };
