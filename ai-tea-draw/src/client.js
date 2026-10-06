'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class TeaError extends Error {
  constructor(code, message, details) {
    super(message || code); this.name = 'TeaError'; this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const DEFAULT_SESSION = path.resolve(__dirname, '../data/session.json');
const MAX_SVG_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

async function loadSession(file = process.env.AI_TEA_SESSION || DEFAULT_SESSION) {
  let text;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 8192) throw new TeaError('INVALID_SESSION', '本机会话文件无效。');
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    if (e instanceof TeaError) throw e;
    throw new TeaError('SESSION_NOT_FOUND', '尚未启动茶绘服务，或会话文件不可读。');
  }
  let session, url;
  try { session = JSON.parse(text); url = new URL(session.url); }
  catch (_) { throw new TeaError('INVALID_SESSION', '本机会话文件格式无效。'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || !url.port || (url.pathname !== '/' && url.pathname !== '')) {
    throw new TeaError('INVALID_SESSION', '茶绘会话必须指向本机 127.0.0.1 HTTP 服务。');
  }
  if (typeof session.token !== 'string' || session.token.length < 16 || session.token.length > 512 || /[\r\n]/.test(session.token)) {
    throw new TeaError('INVALID_SESSION', '本机绘图凭据无效。');
  }
  return { url: url.origin, token: session.token, pid: session.pid, file: path.resolve(file) };
}

async function readBoundedText(file, maxBytes = MAX_SVG_BYTES) {
  if (typeof file !== 'string' || !file) throw new TeaError('INVALID_ARGUMENT', '必须提供文件路径。');
  let stat;
  try { stat = await fs.stat(file); }
  catch (_) { throw new TeaError('FILE_NOT_FOUND', '文件不存在或不可读取。'); }
  if (!stat.isFile() || stat.size > maxBytes) throw new TeaError('FILE_TOO_LARGE', `文件必须不超过 ${maxBytes} 字节。`);
  const bytes = await fs.readFile(file);
  if (bytes.length > maxBytes) throw new TeaError('FILE_TOO_LARGE', '读取时文件超出大小限制。');
  return bytes.toString('utf8');
}

class TeaClient {
  constructor({ sessionFile, timeoutMs = 20000, fetchImpl = globalThis.fetch } = {}) {
    this.sessionFile = sessionFile; this.timeoutMs = timeoutMs; this.fetchImpl = fetchImpl;
  }
  async request(endpoint, body, { signal } = {}) {
    const session = await loadSession(this.sessionFile);
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
    let response;
    try {
      response = await this.fetchImpl(`${session.url}${endpoint}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error', signal: requestSignal,
        headers: { authorization: `Bearer ${session.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (e) {
      if (requestSignal.aborted) throw new TeaError(signal?.aborted ? 'CANCELLED' : 'SERVICE_TIMEOUT', '本机操作已取消或超时。');
      throw new TeaError('SERVICE_UNAVAILABLE', '本机茶绘服务无法连接，请重新启动。');
    }
    const reader = response.body?.getReader();
    let text;
    try {
      if (reader) {
        const parts = []; let size = 0;
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.length;
          if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new TeaError('INVALID_RESPONSE', '服务响应超出限制。'); }
          parts.push(Buffer.from(chunk.value));
        }
        text = Buffer.concat(parts).toString('utf8');
      } else text = await response.text();
    } catch (e) {
      if (e instanceof TeaError) throw e;
      if (requestSignal.aborted) throw new TeaError(signal?.aborted ? 'CANCELLED' : 'SERVICE_TIMEOUT', '本机操作已取消或超时。');
      throw new TeaError('INVALID_RESPONSE', '读取本机服务响应失败。');
    }
    let value;
    try { value = JSON.parse(text); }
    catch (_) { throw new TeaError('INVALID_RESPONSE', '本机服务返回无效 JSON。'); }
    if (value?.ok === false || !response.ok) {
      const error = value?.error || {};
      throw new TeaError(typeof error.code === 'string' ? error.code : `HTTP_${response.status}`, typeof error.message === 'string' ? error.message : '茶绘操作失败。', error.details);
    }
    return value?.ok === true ? value.result : value;
  }
  state(options) { return this.request('/api/state', undefined, options); }
  command(name, args = {}, { id = randomUUID(), signal } = {}) {
    if (typeof name !== 'string' || !name || !args || typeof args !== 'object' || Array.isArray(args)) throw new TeaError('INVALID_ARGUMENT', '应用命令格式无效。');
    if (typeof id !== 'string' || !id || id.length > 128) throw new TeaError('INVALID_ARGUMENT', '幂等操作 ID 无效。');
    return this.request('/api/command', { id, name, args }, { signal });
  }
}

function errorResult(error) {
  return { ok: false, error: { code: error.code || 'INTERNAL_ERROR', message: error.message || '未知错误。', ...(error.details === undefined ? {} : { details: error.details }) } };
}

module.exports = { TeaClient, TeaError, loadSession, readBoundedText, errorResult, DEFAULT_SESSION, MAX_SVG_BYTES };
