'use strict';
const { EventEmitter } = require('node:events');
const protocol = require('../protocol');

class SteamTransport extends EventEmitter {
  constructor({ project, appId = 480, client, steamworks, packetRouter, lobbyType, maxMembers = 2 } = {}) {
    super();
    this.project = protocol.validateProject(project);
    this.maxMembers = validateMaxMembers(maxMembers);
    this.lobbyType = lobbyType;
    this.api = steamworks || require('steamworks.js');
    this.client = client || this.api.init(appId);
    if (!this.client.apps.isSubscribedApp(appId)) throw new Error('STEAM_APP_NOT_AVAILABLE');
    this.selfId = this.client.localplayer.getSteamId().steamId64.toString();
    this.handles = [];
    this.room = null;
    this.hostId = null;
    this.members = [];
    const cb = this.api.SteamCallback;
    this.register(cb.P2PSessionRequest, ({ remote }) => {
      const id = remote.toString();
      if (this.room && this.memberIds().includes(id)) this.client.networking.acceptP2PSession(remote);
    });
    this.register(cb.P2PSessionConnectFail, e => this.emit('fault', { code: 'STEAM_P2P_FAILED', message: String(e.error) }));
    this.register(cb.LobbyChatUpdate, () => this.refreshMembers());
    this.register(cb.SteamServersDisconnected, () => this.emit('fault', { code: 'STEAM_DISCONNECTED', message: 'Steam disconnected' }));
    this.packetRouter = packetRouter;
    if (packetRouter) packetRouter.add(this);
    else this.timer = setInterval(() => this.poll(), 10);
    this.rosterTimer = setInterval(() => this.refreshMembers(), 1000);
  }
  register(type, fn) { this.handles.push(this.client.callback.register(type, fn)); }
  memberIds() { return this.room ? this.room.getMembers().map(m => m.steamId64.toString()) : []; }
  info() { return { room: this.room?.id.toString() || null, selfId: this.selfId, hostId: this.hostId, members: this.members, maxMembers: this.maxMembers, transport: 'steam' }; }
  async createRoom({ maxMembers = this.maxMembers } = {}) {
    const capacity = validateMaxMembers(maxMembers);
    this.leave();
    this.room = await this.client.matchmaking.createLobby(this.lobbyType ?? this.client.matchmaking.LobbyType.FriendsOnly, capacity);
    this.maxMembers = capacity;
    this.room.setData('project_id', this.project);
    this.room.setData('protocol_version', String(protocol.VERSION));
    this.room.setData('max_members', String(capacity));
    this.hostId = this.selfId;
    this.refreshMembers();
    return this.info();
  }
  async joinRoom(code) {
    if (!/^\d{15,21}$/.test(String(code))) throw new Error('INVALID_ROOM');
    this.leave();
    const room = await this.client.matchmaking.joinLobby(BigInt(code));
    // Lobby data is populated by the asynchronous join result. Reject shared-AppID rooms from other projects.
    if (room.getData('project_id') !== this.project || room.getData('protocol_version') !== String(protocol.VERSION)) {
      room.leave(); throw new Error('PROTOCOL_MISMATCH');
    }
    this.room = room;
    const declaredCapacity = room.getData('max_members');
    try { this.maxMembers = validateMaxMembers(declaredCapacity ? Number(declaredCapacity) : 2); }
    catch (_) { room.leave(); this.room = null; throw new Error('PROTOCOL_MISMATCH'); }
    this.hostId = room.getOwner().steamId64.toString();
    this.refreshMembers();
    return this.info();
  }
  refreshMembers() {
    if (!this.room) return;
    const members = this.memberIds();
    if (this.room.getOwner().steamId64.toString() !== this.hostId || !members.includes(this.hostId)) {
      this.leave(); this.emit('closed', { reason: 'HOST_LEFT' }); return;
    }
    if (JSON.stringify(members) !== JSON.stringify(this.members)) {
      this.members = members; this.emit('members', this.info());
    }
  }
  send(target, data) {
    if (!this.room || !this.memberIds().includes(target)) throw new Error('NOT_A_ROOM_MEMBER');
    const bytes = protocol.encode(this.project, this.room.id.toString(), data);
    if (!this.client.networking.sendP2PPacket(BigInt(target), this.client.networking.SendType.Reliable, bytes)) throw new Error('STEAM_SEND_FAILED');
    return bytes.length;
  }
  poll() {
    try {
      // Bound work per tick so a flood cannot starve the local HTTP/WS bridge.
      for (let count = 0; count < 128; count++) {
        const size = this.client.networking.isP2PPacketAvailable();
        if (!size) break;
        const packet = this.client.networking.readP2PPacket(size);
        this.receivePacket(packet, size);
      }
    } catch (e) { this.emit('fault', { code: 'INVALID_PACKET', message: e.message }); }
  }
  receivePacket(packet, size) {
    if (!this.room || size > protocol.MAX_PACKET_BYTES) return;
    const from = packet.steamId.steamId64.toString();
    if (!this.memberIds().includes(from)) return;
    if (this.selfId !== this.hostId && from !== this.hostId) return;
    const data = protocol.decode(Buffer.from(packet.data), this.project, this.room.id.toString());
    this.emit('packet', { from, data });
  }
  leave() { if (this.room) this.room.leave(); this.room = null; this.hostId = null; this.members = []; }
  close() {
    this.leave(); clearInterval(this.timer); clearInterval(this.rosterTimer);
    this.packetRouter?.delete(this);
    for (const handle of this.handles) handle?.disconnect();
    this.handles = []; this.removeAllListeners();
  }
}

function validateMaxMembers(value) {
  if (!Number.isInteger(value) || value < 2 || value > 16) throw new Error('INVALID_MAX_MEMBERS');
  return value;
}

// steamworks.js exposes a single legacy packet queue. Two lobby transports on
// one native client must share its reader, or one will discard the other's data.
class SteamPacketRouter {
  constructor(client) { this.client = client; this.transports = new Set(); this.timer = setInterval(() => this.poll(), 10); }
  add(transport) { this.transports.add(transport); }
  delete(transport) { this.transports.delete(transport); }
  poll() {
    for (let count = 0; count < 128; count++) {
      let packet, size;
      try {
        size = this.client.networking.isP2PPacketAvailable(); if (!size) break;
        packet = this.client.networking.readP2PPacket(size);
        if (size > protocol.MAX_PACKET_BYTES) continue;
        const envelope = JSON.parse(Buffer.from(packet.data).toString('utf8'));
        const target = [...this.transports].find(t => t.project === envelope.project && t.info().room === envelope.room);
        if (target) { try { target.receivePacket(packet, size); } catch (e) { target.emit('fault', { code:'INVALID_PACKET', message:e.message }); } }
      } catch (_) { /* Ignore malformed or unrelated shared-AppID packets. */ }
    }
  }
  close() { clearInterval(this.timer); this.transports.clear(); }
}
module.exports = { SteamTransport, SteamPacketRouter };
