import { useEffect, useRef, useState } from "react";
import { connect as twilioConnect, createLocalVideoTrack } from 'twilio-video';
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";

// One-way WebRTC: caller sends video (opens camera), receiver only receives and views.
const VideoChat = ({ visible, onClose, initialIncoming = null }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const debugCanvasRef = useRef(null);
  const pcRef = useRef(null);
  const twilioRoomRef = useRef(null);
  const localStreamRef = useRef(null);
  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const [callState, setCallState] = useState("idle"); // idle, calling, ringing, in-call
  const [incoming, setIncoming] = useState(null); // { from, offer }

  const { authUser } = useAuth();
  // video-only one-way call: caller sends video, receiver only receives
  const constraints = { video: true, audio: false };

  const sendSignal = async (type, body = {}) => {
    const fromId = body?.from || authUser?._id || (socket && socket.id) || null;
    const payload = { ...body, from: fromId };
    try {
      if (socket && socket.connected) {
        switch (type) {
          case 'call':
            socket.emit('call-user', { to: payload.to, offer: payload.offer, from: payload.from });
            return true;
          case 'answer':
            socket.emit('answer-call', { to: payload.to, answer: payload.answer, from: payload.from });
            return true;
          case 'ice':
            socket.emit('ice-candidate', { to: payload.to, candidate: payload.candidate, from: payload.from });
            return true;
          case 'control':
            socket.emit('video-control', { to: payload.to, action: payload.action, from: payload.from });
            return true;
          case 'end':
            socket.emit('end-call', { to: payload.to, from: payload.from });
            return true;
          default:
            break;
        }
      }
    } catch (e) {
      console.warn('socket signaling failed, falling back to HTTP', e);
    }

    // HTTP fallback
    try {
      const endpointMap = { call: '/api/signal/call', answer: '/api/signal/answer', ice: '/api/signal/ice', end: '/api/signal/end' };
      const SIGNALING_URL = (typeof window !== 'undefined' && window.location && window.location.origin) || 'https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app';
      const base = SIGNALING_URL.replace(/\/$/, '');
      const url = `${base}${endpointMap[type]}`;
      console.warn('Using HTTP fallback to', url);
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      return true;
    } catch (err) {
      console.error('HTTP signaling failed', err);
      return false;
    }
  };

  const otherId = () => selectedConversation?._id;

  // Caller: start local camera and send offer
  const startCall = async () => {
    const to = otherId();
    if (!to) return;
    // Try Twilio Video first (server must provide token)
    try {
      const SIGNALING_URL = process.env.REACT_APP_SIGNALING_URL || '';
      const base = SIGNALING_URL.replace(/\/$/, '') || '';
      const tokenRes = await fetch((base || '') + '/api/twilio/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: authUser?._id || 'guest', room: to })
      });
      if (tokenRes.ok) {
        const { token } = await tokenRes.json();
        // create local track and connect
        const localTrack = await createLocalVideoTrack();
        localStreamRef.current = new MediaStream([localTrack.mediaStreamTrack]);
        if (localVideoRef.current) { localVideoRef.current.srcObject = localStreamRef.current; localVideoRef.current.play().catch(()=>{}); }
        const room = await twilioConnect(token, { name: to, tracks: [localTrack] });
        twilioRoomRef.current = room;
        console.log('[twilio] connected to room', room.name, room.sid);
        // attach existing participants' video
        room.participants.forEach(participant => {
          participant.tracks.forEach(publication => {
            if (publication.isSubscribed) {
              const track = publication.track;
              if (track.kind === 'video' && remoteVideoRef.current) track.attach(remoteVideoRef.current);
            }
          });
          participant.on('trackSubscribed', track => { if (track.kind === 'video' && remoteVideoRef.current) track.attach(remoteVideoRef.current); });
        });
        room.on('participantConnected', participant => {
          participant.on('trackSubscribed', track => { if (track.kind === 'video' && remoteVideoRef.current) track.attach(remoteVideoRef.current); });
        });
        setCallState('calling');
        return;
      }
    } catch (twErr) {
      console.warn('Twilio connect failed, falling back to peer-to-peer', twErr);
    }
    // Fallback: existing peer-to-peer flow
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        try {
          localVideoRef.current.play().then(() => console.log('[local video] play() succeeded')).catch((err) => console.warn('[local video] play() rejected', err));
        } catch (err) { console.warn('[local video] play() exception', err); }
        localVideoRef.current.onloadeddata = () => console.log('[local video] loadeddata', { videoWidth: localVideoRef.current.videoWidth, videoHeight: localVideoRef.current.videoHeight });
      }

      console.log('[startCall] local tracks', stream.getTracks().map(t => ({ id: t.id, kind: t.kind, enabled: t.enabled, muted: t.muted, readyState: t.readyState, settings: typeof t.getSettings === 'function' ? t.getSettings() : undefined })));
      try { setTimeout(() => snapshotLocalFrame(), 300); } catch (e) {}

      pcRef.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) { console.log('[pc] local ice candidate ->', e.candidate); sendSignal('ice', { to, candidate: e.candidate }); }
      };
      pcRef.current.ontrack = (e) => {
        const stream = e.streams && e.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      };
      stream.getTracks().forEach((t) => pcRef.current.addTrack(t, stream));
      try { stream.getTracks().forEach(t => { if (typeof t.enabled !== 'undefined') t.enabled = true; }); console.log('[startCall] ensured local tracks enabled'); } catch (e) {}
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      try { (pcRef.current.getSenders() || []).forEach(s => { if (typeof s.requestKeyFrame === 'function') { s.requestKeyFrame(); console.log('[startCall] requested keyframe on sender', s); } }); } catch (e) {}
      await sendSignal('call', { to, offer: pcRef.current.localDescription });
      setCallState('calling');
    } catch (err) { console.error('Error starting call (fallback):', err); }
  };

  // Receiver: do NOT open camera. Create peer, set remote desc, answer.
  // Helper: wait for a specific signalingState on the RTCPeerConnection
  const waitForSignalingState = (pc, desiredState, timeout = 3000) => {
    return new Promise((resolve) => {
      if (!pc) return resolve(false);
      if (pc.signalingState === desiredState) return resolve(true);
      let done = false;
      const onChange = () => {
        if (pc.signalingState === desiredState && !done) {
          done = true;
          pc.removeEventListener('signalingstatechange', onChange);
          resolve(true);
        }
      };
      pc.addEventListener('signalingstatechange', onChange);
      setTimeout(() => {
        if (!done) {
          done = true;
          try { pc.removeEventListener('signalingstatechange', onChange); } catch (e) {}
          resolve(false);
        }
      }, timeout);
    });
  };

  const acceptIncoming = async (incomingParam = null) => {
    let inc = incomingParam || incoming;
    // If this was bound directly to an onClick, React may pass the click event as first arg.
    // Detect and ignore synthetic/DOM events and fall back to the stored `incoming` payload.
    if (inc && (inc.nativeEvent || inc.type === 'click' || inc._reactName)) {
      inc = incoming;
    }
    if (!inc) return;
    try {
      const { from } = inc;
      // normalize offer payload (some signaling paths wrap it differently)
      let offer = inc.offer || inc;
      if (offer && offer.offer) offer = offer.offer;
      if (!offer || !offer.sdp) {
        console.error('acceptIncoming: missing offer.sdp, aborting', offer);
        return;
      }
      if (!offer.type) {
        console.warn('acceptIncoming: offer.type missing, defaulting to "offer"');
        offer = { ...offer, type: 'offer' };
      }
      // Try Twilio: join room instead of answering SDP
      try {
        const roomId = otherId() || from;
        const SIGNALING_URL = process.env.REACT_APP_SIGNALING_URL || '';
        const base = SIGNALING_URL.replace(/\/$/, '') || '';
        const tokenRes = await fetch((base || '') + '/api/twilio/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: authUser?._id || 'guest', room: roomId }) });
        if (tokenRes.ok) {
          const { token } = await tokenRes.json();
          // connect without publishing local tracks (receiver only)
          const room = await twilioConnect(token, { name: roomId, tracks: [] });
          twilioRoomRef.current = room;
          console.log('[twilio] connected as viewer to room', roomId);
          room.participants.forEach(participant => {
            participant.tracks.forEach(pub => { if (pub.isSubscribed && pub.track.kind === 'video' && remoteVideoRef.current) pub.track.attach(remoteVideoRef.current); });
            participant.on('trackSubscribed', track => { if (track.kind === 'video' && remoteVideoRef.current) track.attach(remoteVideoRef.current); });
          });
          room.on('participantConnected', participant => { participant.on('trackSubscribed', track => { if (track.kind === 'video' && remoteVideoRef.current) track.attach(remoteVideoRef.current); }); });
          stopRingtone(); setIncoming(null); setCallState('in-call');
          return;
        }
      } catch (twe) { console.warn('Twilio join failed, falling back to SDP answer', twe); }

      pcRef.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          console.log('[pc] remote-side local ice ->', e.candidate);
          sendSignal('ice', { to: from, candidate: e.candidate });
        }
      };

      pcRef.current.oniceconnectionstatechange = () => console.log('[pc] iceConnectionState ->', pcRef.current.iceConnectionState);
      pcRef.current.onconnectionstatechange = () => console.log('[pc] connectionState ->', pcRef.current.connectionState);

      // help debug signaling state transitions
      pcRef.current.onsignalingstatechange = () => console.log('[pc] signalingState ->', pcRef.current.signalingState);

      pcRef.current.ontrack = (e) => {
        console.log('[pc] ontrack (receiver), streams:', e.streams);
        try {
          const stream = e.streams && e.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            // try to force playback in case autoplay didn't start
            try {
              remoteVideoRef.current.play().then(() => console.log('[video] play() succeeded')).catch((err) => console.warn('[video] play() rejected', err));
            } catch (err) { console.warn('[video] play() exception', err); }
            remoteVideoRef.current.onloadeddata = () => console.log('[video] remote loadeddata', { readyState: remoteVideoRef.current.readyState, videoWidth: remoteVideoRef.current.videoWidth, videoHeight: remoteVideoRef.current.videoHeight });
            remoteVideoRef.current.onloadedmetadata = () => console.log('[video] remote loadedmetadata', { videoWidth: remoteVideoRef.current.videoWidth, videoHeight: remoteVideoRef.current.videoHeight });
            remoteVideoRef.current.onplaying = () => { console.log('[video] remote playing'); snapshotRemoteFrame(); };
            remoteVideoRef.current.onerror = (ev) => console.error('[video] remote error', ev);
            try {
              console.log('[video] remote tracks', stream.getTracks().map(t => ({ id: t.id, kind: t.kind, enabled: t.enabled, muted: t.muted, readyState: t.readyState, settings: typeof t.getSettings === 'function' ? t.getSettings() : undefined })));
            } catch (err) { console.warn('[video] track log failed', err); }
            // schedule an additional snapshot shortly after to detect black frames
            setTimeout(() => snapshotRemoteFrame(), 700);
          }
        } catch (err) { console.error('ontrack (receiver) handling failed', err); }
      };

      console.log('[acceptIncoming] remote offer type:', offer.type, 'sdp length:', offer.sdp ? offer.sdp.length : 0);
      // use plain object for setRemoteDescription (avoids some browser inconsistencies)
      await pcRef.current.setRemoteDescription(offer);
      console.log('[acceptIncoming] after setRemoteDescription signalingState:', pcRef.current.signalingState);

      // wait briefly for signaling state to settle to have-remote-offer (avoid InvalidStateError)
      const okState = await waitForSignalingState(pcRef.current, 'have-remote-offer', 3000);
      if (!okState) console.warn('[acceptIncoming] signalingState did not reach have-remote-offer, current:', pcRef.current.signalingState);

      const answer = await pcRef.current.createAnswer();
      try {
        await pcRef.current.setLocalDescription(answer);
      } catch (err) {
        console.error('[acceptIncoming] setLocalDescription failed', err, 'signalingState:', pcRef.current.signalingState);
        throw err;
      }
      await sendSignal('answer', { to: from, answer: pcRef.current.localDescription });
      // stop ringtone when answering
      stopRingtone();
      setIncoming(null);
      setCallState('in-call');
    } catch (err) {
      console.error('Error accepting call:', err);
    }
  };

  const endCall = () => {
    try { pcRef.current?.close(); } catch (e) {}
    try { if (twilioRoomRef.current) { twilioRoomRef.current.disconnect(); twilioRoomRef.current = null; } } catch (e) {}
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { if (localVideoRef.current) localVideoRef.current.srcObject = null; } catch (e) {}
    try { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null; } catch (e) {}
    pcRef.current = null;
    localStreamRef.current = null;
    // notify the other side
    const to = selectedConversation?._id || (incoming && incoming.from);
    if (to) sendSignal('end', { to });
    // stop ringtone if any
    stopRingtone();
    setIncoming(null);
    setCallState('idle');
    onClose && onClose();
  };

  useEffect(() => {
    if (!visible || !socket) return;

    const handleIncoming = ({ from, offer }) => {
      const inc = { from, offer };
      setIncoming(inc);
      setCallState('ringing');
      playRingtone();
      // auto-answer incoming calls (receiver will NOT open local camera)
      acceptIncoming(inc);
    };
    const handleAnswered = async ({ answer }) => {
      try {
        console.log('[handleAnswered] received answer, length:', answer?.sdp?.length || 0);
        await pcRef.current?.setRemoteDescription(answer);
        setCallState('in-call');
      } catch (e) { console.error('[handleAnswered] setRemoteDescription failed', e); }
    };
    const handleRemoteIce = async ({ candidate }) => { try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error(e); } };
    const handleVideoControl = async ({ from, action }) => {
      try {
        console.log('[handleVideoControl] from', from, 'action', action);
        if (action === 'request-keyframe') {
          const senders = pcRef.current?.getSenders() || [];
          senders.forEach(s => {
            try {
              if (typeof s.requestKeyFrame === 'function') { s.requestKeyFrame(); console.log('[handleVideoControl] requested keyframe on sender', s); }
              else if (s.replaceTrack && s.track) { s.replaceTrack(s.track).then(()=>console.log('[handleVideoControl] replaced track to force keyframe')).catch(()=>{}); }
            } catch (e) { console.warn('[handleVideoControl] request failed', e); }
          });
        }
      } catch (e) { console.error('[handleVideoControl] failed', e); }
    };

    socket.on('incoming-call', handleIncoming);
    socket.on('call-answered', handleAnswered);
    socket.on('ice-candidate', handleRemoteIce);
    socket.on('video-control', handleVideoControl);
    socket.on('call-ended', endCall);

    // Do not auto-start outgoing calls; user must click Start Call.
    // (This prevents the receiver's UI from opening local camera unintentionally.)

    if (initialIncoming) { setIncoming(initialIncoming); setCallState('ringing'); }

    return () => {
      socket.off('incoming-call', handleIncoming);
      socket.off('call-answered', handleAnswered);
      socket.off('ice-candidate', handleRemoteIce);
      socket.off('video-control', handleVideoControl);
      socket.off('call-ended', endCall);
      endCall();
    };
  }, [visible, socket, selectedConversation, initialIncoming]);

  // Ringtone handling using WebAudio for compatibility (no external asset required)
  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);

  const playRingtone = () => {
    try {
      if (audioCtxRef.current) return; // already playing
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      oscillatorRef.current = { osc, gain };
    } catch (e) {
      console.warn('Ringtone failed', e);
    }
  };

  const stopRingtone = () => {
    try {
      if (oscillatorRef.current) {
        oscillatorRef.current.osc.stop();
        oscillatorRef.current.osc.disconnect();
        oscillatorRef.current.gain.disconnect();
        oscillatorRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    } catch (e) {}
  };

  const snapshotRemoteFrame = () => {
    try {
      const v = remoteVideoRef.current;
      const c = debugCanvasRef.current;
      if (!v || !c) return;
      const w = v.videoWidth || 320;
      const h = v.videoHeight || 240;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, w, h);
      const px = Math.floor(w / 2);
      const py = Math.floor(h / 2);
      const data = ctx.getImageData(px, py, 1, 1).data;
      const avg = (data[0] + data[1] + data[2]) / 3;
      console.log('[video-snapshot] size', w, h, 'center RGBA', data, 'avg', avg);
      if (avg < 8) {
        console.warn('[video-snapshot] frame appears nearly black (avg<8)');
        try {
          // attempt quick rebind of srcObject to force a repaint
          const v = remoteVideoRef.current;
          if (v) {
            const s = v.srcObject;
            v.srcObject = null;
            setTimeout(() => { v.srcObject = s; try { v.play().catch(()=>{}); } catch(e){} }, 200);
          }
        } catch (e) { console.warn('rebind remote video failed', e); }
        // request a keyframe from the sender via signaling
        try {
          const target = pcRef.current && pcRef.current.remoteUser;
          if (target) {
            console.log('[video-snapshot] requesting keyframe from', target);
            sendSignal('control', { to: target, action: 'request-keyframe' });
          }
        } catch (e) { console.warn('requesting keyframe failed', e); }
      }
    } catch (e) {
      console.error('snapshotRemoteFrame failed', e);
    }
  };

  const snapshotLocalFrame = () => {
    try {
      const v = localVideoRef.current;
      const c = debugCanvasRef.current;
      if (!v || !c) return;
      const w = v.videoWidth || 320;
      const h = v.videoHeight || 240;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, w, h);
      const px = Math.floor(w / 2);
      const py = Math.floor(h / 2);
      const data = ctx.getImageData(px, py, 1, 1).data;
      const avg = (data[0] + data[1] + data[2]) / 3;
      console.log('[local-video-snapshot] size', w, h, 'center RGBA', data, 'avg', avg);
      if (avg < 8) console.warn('[local-video-snapshot] local frame appears nearly black (avg<8)');
    } catch (e) { console.error('snapshotLocalFrame failed', e); }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-gray-900 p-4 rounded-md w-[90%] max-w-3xl">
        <div className="flex gap-4">
          {(callState === 'calling' || (callState === 'in-call' && localStreamRef.current)) ? (
            <>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-1/2 rounded bg-black" style={{objectFit: 'cover'}} />
              <video ref={remoteVideoRef} autoPlay playsInline muted className="w-1/2 rounded bg-black" style={{objectFit: 'cover'}} />
            </>
          ) : (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full rounded bg-black" style={{objectFit: 'cover'}} />
              <canvas ref={debugCanvasRef} style={{display: 'none'}} />
            </>
          )}
        </div>

        <div className="mt-3">
          {callState === 'idle' && (
            <div className="flex justify-end">
              <button onClick={startCall} className="ml-2 px-2 py-1 bg-sky-600 text-white rounded">Start Call</button>
            </div>
          )}

          {callState === 'calling' && (
            <div className="flex justify-between items-center">
              <span className="text-gray-200">Calling...</span>
              <button onClick={() => { endCall(); }} className="px-3 py-1 bg-red-600 rounded">Cancel</button>
            </div>
          )}

          {callState === 'ringing' && incoming && (
            <div className="flex justify-between items-center">
              <span className="text-gray-200">Incoming call from {incoming.from}</span>
              <div className="flex gap-2">
                <button onClick={() => acceptIncoming()} className="px-3 py-1 bg-green-600 rounded">Accept</button>
                <button onClick={() => { endCall(); }} className="px-3 py-1 bg-red-600 rounded">Decline</button>
              </div>
            </div>
          )}

          {callState === 'in-call' && (
            <div className="flex justify-end">
              <button onClick={() => { endCall(); }} className="px-3 py-1 bg-red-600 rounded">End</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
