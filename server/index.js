/* 元气骑士·深渊回响 —— P2P 联机信令服务器
   仅负责 WebRTC 信令（SDP/ICE 交换），不转发游戏数据。
   配合 SakuraFrp：创建 TCP 隧道把本端口映射到公网即可跨网联机。
   启动：npm install && npm start   （默认端口 9000） */
const { PeerServer } = require('peerjs-server');

const PORT = process.env.PORT || 9000;
const server = PeerServer({ port: PORT, path: '/yqks', allow_discovery: true });

server.on('connection', (id) => {
  console.log('[' + new Date().toISOString() + '] 客户端连接: ' + id);
});
server.on('disconnect', (id) => {
  console.log('[' + new Date().toISOString() + '] 客户端断开: ' + id);
});
server.on('error', (err) => {
  console.error('[' + new Date().toISOString() + '] 信令错误: ' + err.message);
});

console.log('==============================================');
console.log('  元气骑士 P2P 联机信令服务器已启动');
console.log('  本地端口: ' + PORT);
console.log('  使用 SakuraFrp 创建 TCP 隧道映射此端口到公网');
console.log('  游戏内联机地址填写: 公网地址:公网端口');
console.log('==============================================');
