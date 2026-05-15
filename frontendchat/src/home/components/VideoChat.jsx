import { useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";
import Video from 'twilio-video';

const VideoChat = ({ visible, onClose, initialIncoming = null }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const debugCanvasRef = useRef(null);
  const pcRef = useRef(null);
  const roomRef = useRef(null);
  const localTrackRef = useRef(null);
  const localStreamRef = useRef(null);
  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const [callState, setCallState] = useState("idle");
  const [incoming, setIncoming] = useState(null);
  const { authUser } = useAuth();

  const API_BASE =  'https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app';
  const signalingBase = API_BASE.replace(/\/$/, '');

  const getIceServers = () => [{ urls: 'stun:stun.l.google.com:19302' }];
  const constraints = { video: true, audio: false };

  // ─── Ringtone ────────────────────────────────────────────────────────────────
  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);

  const playRingtone = () => {
    try {
      if (audioCtxRef.current) return;
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
    } catch (e) { console.warn('Ringtone failed', e); }
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

  // ─── Attach Track ─────────────────────────────────────────────────────────────
  const safeAttachTrack = (track) => {
    try {
      const el = remoteVideoRef.current;
      if (!track) return;
      if (!el) {
        setTimeout(() => safeAttachTrack(track), 150);
        return;
      }

      // detach old tracks first to avoid stale srcObject
      try { el.srcObject = null; } catch (e) {}

      try {
        if (typeof track.attach === 'function') track.attach(el);
      } catch (e) {
        console.warn('[VideoChat] track.attach failed', e);
      }

      try {
        if (!el.srcObject && track.mediaStreamTrack) {
          el.srcObject = new MediaStream([track.mediaStreamTrack]);
        }
      } catch (e) {
        console.warn('[VideoChat] srcObject fallback failed', e);
      }

      try {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(err => console.debug('[VideoChat] remote play() rejected', err));
      } catch (e) {}

      // Reattach if no frames after 1s
      setTimeout(async () => {
        try {
          if (!el.videoWidth || el.videoWidth === 0) {
            console.warn('[VideoChat] no frames detected, attempting reattach...');
            if (typeof track.attach === 'function') {
              const newEl = track.attach();
              if (newEl && newEl.srcObject) {
                try {
                  el.srcObject = newEl.srcObject;
                  const p2 = el.play();
                  if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
                  console.debug('[VideoChat] reattached via newEl.srcObject');
                } catch (e) { console.warn('[VideoChat] reattach failed', e); }
              }
              try { newEl && newEl.remove(); } catch (e) {}
            }
          }
        } catch (e) { console.warn('[VideoChat] reattach check failed', e); }
      }, 1000);

      console.debug('[VideoChat] safeAttachTrack done', {
        trackKind: track.kind,
        readyState: track.mediaStreamTrack?.readyState,
        enabled: track.mediaStreamTrack?.enabled,
        videoWidth: el.videoWidth,
        paused: el.paused,
      });
      try { window.__vc_lastTrack = track; } catch (e) {}
    } catch (outer) { console.warn('[VideoChat] safeAttachTrack outer', outer); }
  };

  // ─── Signaling ────────────────────────────────────────────────────────────────
  const sendSignal = async (type, body = {}) => {
    const fromId = body?.from || authUser?._id || socket?.id || null;
    const payload = { ...body, from: fromId };

    try {
      if (socket && socket.connected) {
        switch (type) {
          case 'call':
            socket.emit('call-user', { to: payload.to, offer: payload.offer, from: payload.from, room: payload.room });
            return true;
          case 'answer':
            socket.emit('answer-call', { to: payload.to, answer: payload.answer, from: payload.from });
            return true;
          case 'ice':
            socket.emit('ice-candidate', { to: payload.to, candidate: payload.candidate, from: payload.from });
            return true;
          case 'end':
            socket.emit('end-call', { to: payload.to, from: payload.from });
            return true;
          default: break;
        }
      }
    } catch (e) { console.warn('socket signaling failed, falling back to HTTP', e); }

    try {
      const endpointMap = { call: '/api/signal/call', answer: '/api/signal/answer', ice: '/api/signal/ice', end: '/api/signal/end' };
      const url = `${signalingBase}${endpointMap[type]}`;
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      return true;
    } catch (err) {
      console.error('HTTP signaling failed', err);
      return false;
    }
  };

  const otherId = () => selectedConversation?._id;

  // ─── Start Call (Caller / Website) ───────────────────────────────────────────
  const startCall = async () => {
    const to = otherId();
    if (!to) return;
    const roomName = `room-${to}`;

    try {
      const resp = await fetch(`${signalingBase}/api/twilio/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: authUser?._id || 'guest', room: roomName }),
      });

      if (resp.ok) {
        const { token } = await resp.json();

        // 1. Open local camera FIRST
        const localTrack = await Video.createLocalVideoTrack();
        localTrackRef.current = localTrack;

        if (localVideoRef.current) {
          try { localTrack.attach(localVideoRef.current); }
          catch (e) {
            console.warn('[VideoChat] local attach failed, using srcObject fallback', e);
            try {
              localVideoRef.current.srcObject = new MediaStream([localTrack.mediaStreamTrack]);
            } catch (ex) { console.error('local srcObject fallback failed', ex); }
          }
        }

        // 2. Connect to room WITH the track published
        const room = await Video.connect(token, {
          name: roomName,
          tracks: [localTrack],
          audio: false,
        });
        roomRef.current = room;
        try { window.__vc_room = room; } catch (e) {}

        console.debug('[VideoChat] caller connected to room', room.name);
        console.debug('[VideoChat] localParticipant:', room.localParticipant.identity);
        room.localParticipant.tracks.forEach(pub =>
          console.debug('[VideoChat] local published track:', pub.trackSid, pub.track?.kind, 'enabled:', pub.track?.isEnabled)
        );

        // 3. THEN signal the other side to join
        await sendSignal('call', { to, room: roomName });

        setCallState('in-call');

        // Listen for remote tracks (in case receiver joins before us - unlikely but safe)
        room.participants.forEach(participant => {
          participant.tracks.forEach(publication => {
            if (publication.isSubscribed) safeAttachTrack(publication.track);
            publication.on('subscribed', track => safeAttachTrack(track));
          });
          participant.on('trackSubscribed', track => safeAttachTrack(track));
        });

        room.on('participantConnected', participant => {
          console.debug('[VideoChat] remote participant joined:', participant.identity);
          participant.on('trackSubscribed', track => safeAttachTrack(track));
          participant.tracks.forEach(publication => {
            if (publication.isSubscribed && publication.track) safeAttachTrack(publication.track);
            publication.on('subscribed', track => safeAttachTrack(track));
          });
        });

        room.on('disconnected', (_, error) =>
          console.debug('[VideoChat] room disconnected', error?.message)
        );

      } else {
        // ── P2P fallback ──
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        pcRef.current = new RTCPeerConnection({ iceServers: getIceServers() });
        pcRef.current.onicecandidate = (e) => {
          if (e.candidate) sendSignal('ice', { to, candidate: e.candidate });
        };
        pcRef.current.ontrack = (e) => {
          const stream = e.streams?.[0];
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
        };
        stream.getTracks().forEach((t) => pcRef.current.addTrack(t, stream));
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        await sendSignal('call', { to, offer: pcRef.current.localDescription });
        setCallState('calling');
      }
    } catch (err) {
      console.error('Error starting call:', err);
    }
  };

  // ─── Accept Incoming (Receiver / Raspberry Pi) ───────────────────────────────
  const acceptIncoming = async (incomingParam = null) => {
    let inc = incomingParam || incoming;

    // Guard: ignore React synthetic events passed accidentally
    if (inc && (inc.nativeEvent || inc.type === 'click' || inc._reactName)) {
      inc = incoming;
    }
    if (!inc) return;

    try {
      const { from, room } = inc;
      const roomName = room || `room-${from}`;

      const resp = await fetch(`${signalingBase}/api/twilio/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: authUser?._id || 'guest', room: roomName }),
      });

      if (resp.ok) {
        const { token } = await resp.json();

        // ✅ FIX 1: Wait for caller to publish their track before joining
        // Caller needs time to: connect → publish track → Twilio to register it
        console.debug('[VideoChat] waiting for caller to publish track...');
        await new Promise(resolve => setTimeout(resolve, 2500));

        // ✅ FIX 2: Connect as subscriber-only with explicit empty tracks array
        const roomObj = await Video.connect(token, {
          name: roomName,
          audio: false,
          video: false,
          tracks: [], // subscriber-only, no local media
        });

        roomRef.current = roomObj;
        try { window.__vc_room = roomObj; } catch (e) {}

        console.debug('[VideoChat] receiver joined room:', roomObj.name);
        console.debug('[VideoChat] existing participants:', roomObj.participants.size);

        // ✅ FIX 3: Attach tracks from participants already in room
        roomObj.participants.forEach(participant => {
          console.debug('[VideoChat] found existing participant:', participant.identity);

          participant.tracks.forEach(publication => {
            console.debug('[VideoChat] publication:', publication.kind,
              '| subscribed:', publication.isSubscribed,
              '| trackSid:', publication.trackSid
            );

            if (publication.isSubscribed && publication.track) {
              console.debug('[VideoChat] attaching existing subscribed track');
              safeAttachTrack(publication.track);
            }

            // In case track gets subscribed slightly after join
            publication.on('subscribed', track => {
              console.debug('[VideoChat] publication subscribed event:', track.kind);
              safeAttachTrack(track);
            });
          });

          participant.on('trackSubscribed', track => {
            console.debug('[VideoChat] participant trackSubscribed event:', track.kind);
            safeAttachTrack(track);
          });

          participant.on('trackPublished', publication => {
            console.debug('[VideoChat] participant trackPublished event:', publication.kind);
            publication.on('subscribed', track => safeAttachTrack(track));
          });
        });

        // ✅ FIX 4: Handle case where caller joins after us (shouldn't happen but safe)
        roomObj.on('participantConnected', participant => {
          console.debug('[VideoChat] late participantConnected:', participant.identity);

          participant.on('trackSubscribed', track => {
            console.debug('[VideoChat] late trackSubscribed:', track.kind);
            safeAttachTrack(track);
          });

          participant.on('trackPublished', publication => {
            console.debug('[VideoChat] late trackPublished:', publication.kind);
            publication.on('subscribed', track => safeAttachTrack(track));
          });

          participant.tracks.forEach(publication => {
            if (publication.isSubscribed && publication.track) safeAttachTrack(publication.track);
            publication.on('subscribed', track => safeAttachTrack(track));
          });
        });

        roomObj.on('disconnected', (_, error) =>
          console.debug('[VideoChat] receiver room disconnected', error?.message)
        );

        stopRingtone();
        setIncoming(null);
        setCallState('in-call');
        return;
      }

      // ── P2P fallback accept ──
      const { from: caller } = inc;
      let offer = inc.offer || inc;
      if (offer && offer.offer) offer = offer.offer;
      if (!offer || !offer.sdp) {
        console.error('acceptIncoming: missing offer.sdp', offer);
        return;
      }
      if (!offer.type) offer = { ...offer, type: 'offer' };

      pcRef.current = new RTCPeerConnection({ iceServers: getIceServers() });
      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) sendSignal('ice', { to: caller, candidate: e.candidate });
      };
      pcRef.current.ontrack = (e) => {
        const stream = e.streams?.[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      };
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      await sendSignal('answer', { to: caller, answer: pcRef.current.localDescription });

      stopRingtone();
      setIncoming(null);
      setCallState('in-call');
    } catch (err) {
      console.error('Error accepting call:', err);
    }
  };

  // ─── End Call ─────────────────────────────────────────────────────────────────
  const endCall = () => {
    try { pcRef.current?.close(); } catch (e) {}
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { if (localVideoRef.current) localVideoRef.current.srcObject = null; } catch (e) {}
    try { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null; } catch (e) {}

    try {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      if (localTrackRef.current) {
        try { localTrackRef.current.detach().forEach(el => el.remove()); } catch (e) {}
        try { localTrackRef.current.stop(); } catch (e) {}
        localTrackRef.current = null;
      }
    } catch (e) {}

    pcRef.current = null;
    localStreamRef.current = null;

    const to = selectedConversation?._id || incoming?.from;
    if (to) sendSignal('end', { to });

    stopRingtone();
    setIncoming(null);
    setCallState('idle');
    onClose && onClose();
  };

  // ─── Socket Events ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !socket) return;

    const handleIncoming = ({ from, offer, room }) => {
      console.debug('[VideoChat] incoming-call from:', from, 'room:', room);
      const inc = { from, offer, room };
      setIncoming(inc);
      setCallState('ringing');
      playRingtone();
      // Auto-answer: receiver doesn't open camera
      acceptIncoming(inc);
    };

    const handleAnswered = async ({ answer }) => {
      try {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('in-call');
      } catch (e) { console.error(e); }
    };

    const handleRemoteIce = async ({ candidate }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) { console.error(e); }
    };

    socket.on('incoming-call', handleIncoming);
    socket.on('call-answered', handleAnswered);
    socket.on('ice-candidate', handleRemoteIce);
    socket.on('call-ended', endCall);

    if (initialIncoming) {
      setIncoming(initialIncoming);
      setCallState('ringing');
    }

    return () => {
      socket.off('incoming-call', handleIncoming);
      socket.off('call-answered', handleAnswered);
      socket.off('ice-candidate', handleRemoteIce);
      socket.off('call-ended', endCall);
      endCall();
    };
  }, [visible, socket, selectedConversation, initialIncoming]);

  // ─── Debug Helpers ────────────────────────────────────────────────────────────
  const snapshotRemoteFrame = () => {
    try {
      const v = remoteVideoRef.current;
      const c = debugCanvasRef.current;
      if (!v || !c) return;
      const w = v.videoWidth || 320;
      const h = v.videoHeight || 240;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, w, h);
      const px = Math.floor(w / 2);
      const py = Math.floor(h / 2);
      const data = ctx.getImageData(px, py, 1, 1).data;
      const avg = (data[0] + data[1] + data[2]) / 3;
      console.log('[video-snapshot] size', w, h, 'center RGBA', data, 'avg', avg);
      if (avg < 8) console.warn('[video-snapshot] frame appears nearly black (avg<8)');
    } catch (e) { console.error('snapshotRemoteFrame failed', e); }
  };
  try { window.__vc_snapshot = snapshotRemoteFrame; } catch (e) {}

  if (!visible) return null;

  // ─── UI ───────────────────────────────────────────────────────────────────────
  const isCallerInCall = callState === 'calling' || (callState === 'in-call' && localStreamRef.current);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-gray-900 p-4 rounded-md w-[90%] max-w-3xl">
        <div className="flex gap-4">
          {isCallerInCall ? (
            <>
              <video ref={localVideoRef} autoPlay muted playsInline
                className="w-1/2 rounded bg-black" style={{ objectFit: 'cover' }} />
              <video ref={remoteVideoRef} autoPlay playsInline muted
                className="w-1/2 rounded bg-black" style={{ objectFit: 'cover' }} />
            </>
          ) : (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline muted
                className="w-full rounded bg-black" style={{ objectFit: 'cover' }} />
              <canvas ref={debugCanvasRef} style={{ display: 'none' }} />
            </>
          )}
        </div>

        <div className="mt-3">
          {callState === 'idle' && (
            <div className="flex justify-end">
              <button onClick={startCall}
                className="ml-2 px-2 py-1 bg-sky-600 text-white rounded">
                Start Call
              </button>
            </div>
          )}

          {callState === 'calling' && (
            <div className="flex justify-between items-center">
              <span className="text-gray-200">Calling...</span>
              <button onClick={endCall} className="px-3 py-1 bg-red-600 rounded text-white">
                Cancel
              </button>
            </div>
          )}

          {callState === 'ringing' && incoming && (
            <div className="flex justify-between items-center">
              <span className="text-gray-200">Incoming call from {incoming.from}</span>
              <div className="flex gap-2">
                <button onClick={() => acceptIncoming()}
                  className="px-3 py-1 bg-green-600 rounded text-white">Accept</button>
                <button onClick={endCall}
                  className="px-3 py-1 bg-red-600 rounded text-white">Decline</button>
              </div>
            </div>
          )}

          {callState === 'in-call' && (
            <div className="flex justify-end">
              <button onClick={endCall}
                className="px-3 py-1 bg-red-600 rounded text-white">End</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
