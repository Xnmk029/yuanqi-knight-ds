'use strict';
const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('node:crypto');
const { MAX_PACKET_BYTES, VERSION, validateProject } = require('./protocol');

async function startHub({ port = 0, latency = 0 } = {}) {
  const server = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: MAX_PACKET_BYTES });
  const rooms = new Map(); const peers = new Map(); const timers = new Set();
  let roomSeq = 1000;
  function deliver(ws, value) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); }
  function roster(room) {
    for (const id of room.members) deliver(peers.get(id).ws, { event: 'members', result: info(peers.get(id)) });
  }
  function info(peer) {
    const room = rooms.get(peer.room);
    return { selfId: peer.id, room: peer.room || null, hostId: room?.hostId || null, members: room ? [...room.members] : [], maxMembers: room?.maxMembers || null, transport: 'mock' };
  }
  function leave(peer) {
    const room = rooms.get(peer.room); peer.room = null;
    if (!room) return;
    room.members.delete(peer.id);
    if (room.hostId === peer.id) {
      rooms.delete(room.code);
      for (const id of room.members) { const p = peers.get(id); p.room = null; deliver(p.ws, { event: 'closed', result: { reason: 'HOST_LEFT' } }); }
    } else roster(room);
  }
  server.on('connection', ws => {
    const peer = { id: randomUUID(), ws, room: null, project: null }; peers.set(peer.id, peer);
    ws.on('message', bytes => {
      let request;
      try {
        request = JSON.parse(bytes.toString()); let result;
        if (request.op === 'connect') { peer.project = validateProject(request.project); result = info(peer); }
        else if (!peer.project) throw new Error('NOT_CONNECTED');
        else if (request.op === 'create') {
          const maxMembers = request.maxMembers === undefined ? 2 : request.maxMembers;
          if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 16) throw new Error('INVALID_MAX_MEMBERS');
          leave(peer); const code = String(++roomSeq);
          const room = { code, project: peer.project, version: VERSION, hostId: peer.id, maxMembers, members: new Set([peer.id]) };
          rooms.set(code, room); peer.room = code; result = info(peer); roster(room);
        } else if (request.op === 'join') {
          const room = rooms.get(String(request.room));
          if (!room) throw new Error('ROOM_NOT_FOUND');
          if (room.project !== peer.project) throw new Error('PROTOCOL_MISMATCH');
          if (room.members.has(peer.id)) result = info(peer);
          else {
          if (room.members.size >= room.maxMembers) throw new Error('ROOM_FULL');
          leave(peer); peer.room = room.code; room.members.add(peer.id); result = info(peer); roster(room);
          }
        } else if (request.op === 'leave') { leave(peer); result = info(peer); }
        else if (request.op === 'send') {
          const room = rooms.get(peer.room); const target = peers.get(request.to);
          if (!room || !room.members.has(request.to) || !target) throw new Error('NOT_A_ROOM_MEMBER');
          if (peer.id !== room.hostId && request.to !== room.hostId) throw new Error('INVALID_DIRECTION');
          const value = { event: 'packet', result: { from: peer.id, data: request.data } };
          if (latency) { const timer = setTimeout(() => { timers.delete(timer); deliver(target.ws, value); }, latency); timers.add(timer); }
          else deliver(target.ws, value);
          result = { bytes: bytes.length };
        } else throw new Error('UNKNOWN_OPERATION');
        deliver(ws, { id: request.id, result });
      } catch (e) { deliver(ws, { id: request?.id, error: e.message }); }
    });
    ws.on('close', () => { leave(peer); peers.delete(peer.id); });
  });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return {
    url: `ws://127.0.0.1:${server.address().port}`, rooms,
    close: async () => { for (const timer of timers) clearTimeout(timer); for (const p of peers.values()) p.ws.terminate(); await new Promise(resolve => server.close(resolve)); }
  };
}
if (require.main === module) {
  startHub({ port: Number(process.argv[2]) || 19780 }).then(hub => {
    console.log(JSON.stringify({ event: 'ready', url: hub.url, transport: 'mock' }));
    process.once('SIGINT', async () => { await hub.close(); process.exit(0); });
    process.once('SIGTERM', async () => { await hub.close(); process.exit(0); });
  }).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { startHub };
