/* wrtc 可用性冒烟测试：本机两个 PeerConnection 直连，验证 DataChannel 可通信 */
const wrtc = require('@roamhq/wrtc');
(async () => {
  const a = new wrtc.RTCPeerConnection({ iceServers: [] });
  const b = new wrtc.RTCPeerConnection({ iceServers: [] });
  a.onicecandidate = e => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
  b.onicecandidate = e => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
  b.ondatachannel = e => {
    const dc = e.channel;
    dc.onmessage = ev => {
      console.log('B received:', ev.data.toString());
      dc.send('pong');
    };
  };
  const dc = a.createDataChannel('test', { ordered: true });
  dc.onopen = async () => {
    dc.send('ping');
  };
  const got = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting pong')), 8000);
    dc.onmessage = ev => { clearTimeout(t); resolve(ev.data.toString()); };
    doHandshake(a, b).catch(reject);
  });
  console.log('A received:', got);
  console.log('WRTC_SMOKE_OK');
  process.exit(0);
})().catch(e => { console.error('SMOKE_FAIL', e); process.exit(1); });

async function doHandshake(a, b) {
  const offer = await a.createOffer();
  await a.setLocalDescription(offer);
  await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer);
  await a.setRemoteDescription(answer);
}
