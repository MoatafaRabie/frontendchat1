import { useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";
import Video from 'twilio-video';

// One-way WebRTC: caller sends video (opens camera), receiver only receives and views.
const VideoChat = ({ visible, onClose, initialIncoming = null }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const debugCanvasRef = useRef(null);
  const pcRef = useRef(null);
  const roomRef = useRef(null);
  const localTrackRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const pendingRemoteDescRef = useRef(null);
  const tokenCacheRef = useRef({}); // { [roomName]: { token, ts } }
  const sessionIdentityRef = useRef(null);
  const notifiedRef = useRef(false);
  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const [callState, setCallState] = useState("idle"); // idle, calling, ringing, in-call
  const [incoming, setIncoming] = useState(null); // { from, offer }

  const { authUser } = useAuth();
  const API_BASE = 'https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app';
  const signalingBase = API_BASE.replace(/\/$/, '');
  const getIceServers = () => {
    // Use a lightweight default STUN server for P2P fallback.
    // When using Twilio Rooms (the default flow in this component), Twilio
    // provides STUN/TURN servers for participants — you normally don't need
    // to configure your own TURN server. Keep this function small so the
    // P2P fallback still works in basic LAN/Internet tests.
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  };
  // video-only one-way call: caller sends video, receiver only receives
  const constraints = { video: true, audio: false };

  // Robust attach helper: try track.attach, fall back to srcObject from MediaStreamTrack, ensure play()
  const safeAttachTrack = (track) => {
    try {
      const el = remoteVideoRef.current;
      if (!track) return;
      if (!el) {
        // if element not mounted yet, retry shortly
        setTimeout(() => safeAttachTrack(track), 150);
        return;
      }
      try {
        if (typeof track.attach === 'function') track.attach(el);
      } catch (e) {
        console.warn('[VideoChat] track.attach failed', e);
      }
      // if attach didn't populate srcObject, use mediaStreamTrack as fallback
      try {
        if (!el.srcObject && track.mediaStreamTrack) {
          el.srcObject = new MediaStream([track.mediaStreamTrack]);
        }
      } catch (e) {
        console.warn('[VideoChat] srcObject fallback failed', e);
      }
      // attempt to play (autoplay may require interaction; log if rejected)
      try {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(err => console.debug('[VideoChat] remote play() rejected', err));
      } catch (e) {}
      // If after a short delay the element still has no frame, try repeated reattach attempts
      try {
        const tryReattach = async (attempt = 1, maxAttempts = 4) => {
          try {
            if (el.videoWidth && el.videoWidth > 0) return; // already showing frames
            console.warn('[VideoChat] no frames after attach, reattach attempt', attempt);
            // Prefer using the underlying MediaStreamTrack if available
            try {
              if (track && track.mediaStreamTrack && track.mediaStreamTrack.readyState === 'live') {
                try {
                  el.srcObject = new MediaStream([track.mediaStreamTrack]);
                  el.muted = true; // allow autoplay
                  const p = el.play(); if (p && typeof p.catch === 'function') p.catch(() => {});
                  console.debug('[VideoChat] set srcObject from mediaStreamTrack');
                } catch (e) { console.warn('[VideoChat] set srcObject from mediaStreamTrack failed', e); }
              }
            } catch (e) { console.warn('[VideoChat] mediaStreamTrack fallback failed', e); }

            // Some Twilio track implementations return a fresh element when attach() is called without args
            if (typeof track.attach === 'function') {
              try {
                const newEl = track.attach();
                if (newEl) {
                  try {
                    if (newEl.srcObject) {
                      el.srcObject = newEl.srcObject;
                      el.muted = true;
                      const p2 = el.play(); if (p2 && typeof p2.catch === 'function') p2.catch(()=>{});
                      console.debug('[VideoChat] reattached via newEl.srcObject');
                    }
                  } catch (e) { console.warn('[VideoChat] reattach set srcObject failed', e); }
                  try { newEl.remove(); } catch (e) {}
                }
              } catch (e) { console.warn('[VideoChat] track.attach() reattach failed', e); }
            }

            // If still no frames, schedule another attempt
            if ((!el.videoWidth || el.videoWidth === 0) && attempt < maxAttempts) {
              setTimeout(() => tryReattach(attempt + 1, maxAttempts), 400);
            } else if ((!el.videoWidth || el.videoWidth === 0)) {
              console.warn('[VideoChat] reattach exhausted, scheduling diagnostic snapshot');
              try { window.__vc_snapshot && window.__vc_snapshot(); } catch(e){}
            }
          } catch (e) { console.warn('[VideoChat] tryReattach outer', e); }
        };
        setTimeout(() => tryReattach(1, 4), 400);
      } catch (e) { console.warn('[VideoChat] schedule reattach failed', e); }
      try {
        // Helpful debug info when remote appears black
        console.debug('[VideoChat] safeAttachTrack done', {
          trackKind: track.kind,
          hasMediaStreamTrack: !!track.mediaStreamTrack,
          mediaReadyState: track.mediaStreamTrack && track.mediaStreamTrack.readyState,
          videoElementProps: { videoWidth: el.videoWidth, videoHeight: el.videoHeight, paused: el.paused, srcObject: el.srcObject }
        });
        // expose last attached track for debugging in console
        try { window.__vc_lastTrack = track; } catch (e) {}
      } catch (dbg) { console.warn('[VideoChat] safeAttachTrack debug failed', dbg); }
    } catch (outer) { console.warn('[VideoChat] safeAttachTrack outer', outer); }
  };

  // Get a cached Twilio token for a room, or fetch a new one.
  const getTokenForRoom = async (roomName, identity) => {
    try {
      const key = `${roomName}|${identity}`;
      const cache = tokenCacheRef.current[key];
      const now = Date.now();
      // reuse token for 50 minutes to avoid re-calling backend frequently
      if (cache && cache.token && (now - cache.ts) < 50 * 60 * 1000) return cache.token;
      const resp = await fetch(`${signalingBase}/api/twilio/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity, room: roomName })
      });
      if (!resp.ok) {
        console.warn('[VideoChat] token endpoint returned', resp.status);
        return null;
      }
      const { token } = await resp.json();
      tokenCacheRef.current[key] = { token, ts: Date.now() };
      return token;
    } catch (e) {
      console.error('[VideoChat] getTokenForRoom failed', e);
      return null;
    }
  };

  const sendSignal = async (type, body = {}) => {
    const fromId = body?.from || authUser?._id || (socket && socket.id) || null;
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
      const url = `${signalingBase}${endpointMap[type]}`;
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
    const roomName = `room-${to}`;
    try {
      // Attempt Twilio Video flow: obtain cached token and connect with local video track
      // ensure we have a per-session identity (avoids duplicate identity errors)
      if (!sessionIdentityRef.current) sessionIdentityRef.current = `${authUser?._id || 'guest'}-${Math.random().toString(36).slice(2,8)}`;
      const identity = sessionIdentityRef.current;
      const token = await getTokenForRoom(roomName, identity);
      if (token) {
        // avoid duplicate connect if already in a room
        if (roomRef.current && roomRef.current.state && roomRef.current.state !== 'disconnected') {
          console.debug('[VideoChat] already connected to room, skipping connect');
          return;
        }
        // will notify the callee after successful connect
        const localTrack = await Video.createLocalVideoTrack();
        localTrackRef.current = localTrack;
        if (localVideoRef.current) {
          // attach Twilio track to local video element
          try {
            localTrack.attach(localVideoRef.current);
          } catch (e) {
            // fallback: create a MediaStream from the MediaStreamTrack
            console.warn('[VideoChat] attach failed, using srcObject fallback', e);
            try {
              const ms = new MediaStream([localTrack.mediaStreamTrack]);
              localVideoRef.current.srcObject = ms;
            } catch (ex) { console.error('fallback set srcObject failed', ex); }
          }
        }
        let room;
        try {
          room = await Video.connect(token, { name: roomName, tracks: [localTrack], audio: false });
        } catch (err) {
          // handle duplicate-identity error by retrying with a fresh identity once
          try {
            if (err && err.message && err.message.toLowerCase().includes('duplicate identity')) {
              console.warn('[VideoChat] duplicate identity detected, retrying with new identity');
              sessionIdentityRef.current = `${authUser?._id || 'guest'}-${Math.random().toString(36).slice(2,8)}`;
              const newToken = await getTokenForRoom(roomName, sessionIdentityRef.current);
              if (newToken) room = await Video.connect(newToken, { name: roomName, tracks: [localTrack], audio: false });
            }
          } catch (err2) { console.error('[VideoChat] retry connect failed', err2); throw err2; }
          if (!room) throw err;
        }
        roomRef.current = room;
        try { window.__vc_room = room; } catch (e) {}
        // notify other user to join this Twilio room only after successful connect
        try {
          if (!notifiedRef.current) { await sendSignal('call', { to, room: roomName }); notifiedRef.current = true; }
        } catch (e) { console.warn('[VideoChat] failed to notify callee after connect', e); }
        setCallState('in-call');
        // Debug: log room/participant/track state to help diagnose black remote video
        try {
          console.debug('[VideoChat] connected to room', room.name, 'localParticipant', room.localParticipant.identity);
          room.localParticipant.tracks.forEach(pub => console.debug('[VideoChat] local pub', pub.trackSid, pub.track && pub.track.kind, 'isPublished', !!pub.track));
          room.participants.forEach(participant => {
            console.debug('[VideoChat] existing participant', participant.identity, participant.sid);
            participant.tracks.forEach(publication => {
              console.debug('[VideoChat] publication', publication.trackSid, 'kind', publication.kind, 'isSubscribed', publication.isSubscribed);
              if (publication.track && publication.track.mediaStreamTrack) {
                console.debug('[VideoChat] mediaStreamTrack readyState', publication.track.mediaStreamTrack.readyState);
              }
            });
          });
          // richer room lifecycle logging
          room.on('participantConnected', p => console.debug('[VideoChat] participantConnected', p.identity));
          room.on('participantDisconnected', p => console.warn('[VideoChat] participantDisconnected', p.identity));
          room.on('reconnecting', () => console.warn('[VideoChat] room reconnecting'));
          room.on('reconnected', () => console.warn('[VideoChat] room reconnected'));
          room.on('disconnected', (roomObj, error) => {
            console.warn('[VideoChat] room disconnected', error);
            try { if (error) console.error('disconnect error', error); } catch (e) {}
            try { setTimeout(() => { endCall(); }, 50); } catch (e) {}
          });
        } catch (e) { console.warn('[VideoChat] debug log error', e); }
        // attach existing participants' tracks
        room.participants.forEach(participant => {
          participant.tracks.forEach(publication => {
            if (publication.isSubscribed) {
              safeAttachTrack(publication.track);
            }
            publication.on('subscribed', track => {
              safeAttachTrack(track);
            });
            publication.on && publication.on('subscriptionFailed', (err) => console.warn('[VideoChat] subscriptionFailed', err));
          });
          participant.on('trackSubscribed', track => {
            safeAttachTrack(track);
          });
        });
        room.on('participantConnected', participant => {
          participant.on('trackSubscribed', track => {
            safeAttachTrack(track);
          });
          participant.on && participant.on('trackSubscriptionFailed', (err) => console.warn('[VideoChat] trackSubscriptionFailed', err));
        });
        // listen for local track stopped
        try { room.localParticipant && room.localParticipant.tracks.forEach(pub => pub.track && pub.track.mediaStreamTrack && pub.track.mediaStreamTrack.addEventListener && pub.track.mediaStreamTrack.addEventListener('ended', () => console.warn('[VideoChat] local mediaStreamTrack ended'))); } catch (e) {}
      } else {
        // fallback to previous P2P flow if Twilio token not available
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        pcRef.current = new RTCPeerConnection({ iceServers: getIceServers() });
        pcRef.current.onicecandidate = (e) => {
          if (e.candidate) {
            console.log('[pc] local ice candidate ->', e.candidate);
            sendSignal('ice', { to, candidate: e.candidate });
          }
        };
        pcRef.current.ontrack = (e) => {
          const stream = e.streams && e.streams[0];
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
        };
        stream.getTracks().forEach((t) => pcRef.current.addTrack(t, stream));
        // flush any buffered remote description or ICE candidates that arrived early
        try {
          if (pendingRemoteDescRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(pendingRemoteDescRef.current));
            pendingRemoteDescRef.current = null;
            setCallState('in-call');
            console.debug('[VideoChat] applied buffered remote description after pc creation');
          }
        } catch (e) { console.warn('[VideoChat] apply buffered remoteDesc failed', e); }
        try {
          if (pendingIceRef.current && pendingIceRef.current.length) {
            for (const c of pendingIceRef.current) {
              try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch (err) { console.warn('[VideoChat] flush addIceCandidate failed', err); }
            }
            pendingIceRef.current = [];
            console.debug('[VideoChat] flushed buffered ICE candidates');
          }
        } catch (e) { console.warn('[VideoChat] flush pending ICE outer failed', e); }
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        await sendSignal('call', { to, offer: pcRef.current.localDescription });
        setCallState('calling');
      }
    } catch (err) {
      console.error('Error starting call:', err);
      // cleanup local track if created and failed to connect
      try {
        if (localTrackRef.current) {
          try { localTrackRef.current.stop(); } catch (e) {}
          try { localTrackRef.current.detach && localTrackRef.current.detach().forEach(el => el.remove()); } catch (e) {}
          localTrackRef.current = null;
        }
      } catch (e) {}
    }
  };

  // Receiver: do NOT open camera. Create peer, set remote desc, answer.
  const acceptIncoming = async (incomingParam = null) => {
    let inc = incomingParam || incoming;
    // If this was bound directly to an onClick, React may pass the click event as first arg.
    // Detect and ignore synthetic/DOM events and fall back to the stored `incoming` payload.
    if (inc && (inc.nativeEvent || inc.type === 'click' || inc._reactName)) {
      inc = incoming;
    }
    if (!inc) return;
    try {
      const { from, room } = inc;
      // If the signaling payload contains a Twilio room, prefer joining the room
      const roomName = room || `room-${from}`;
      if (!sessionIdentityRef.current) sessionIdentityRef.current = `${authUser?._id || 'guest'}-${Math.random().toString(36).slice(2,8)}`;
      const identity = sessionIdentityRef.current;
      const token = await getTokenForRoom(roomName, identity);
      if (token) {
        // avoid duplicate connect
        if (roomRef.current && roomRef.current.state && roomRef.current.state !== 'disconnected') {
          console.debug('[VideoChat] already connected to room (viewer), skipping');
          stopRingtone(); setIncoming(null); setCallState('in-call'); return;
        }
        // connect as viewer (no local camera)
        let roomObj;
        try {
          roomObj = await Video.connect(token, { name: roomName, audio: false });
        } catch (err) {
          if (err && err.message && err.message.toLowerCase().includes('duplicate identity')) {
            console.warn('[VideoChat] duplicate identity for viewer, retrying with new identity');
            sessionIdentityRef.current = `${authUser?._id || 'guest'}-${Math.random().toString(36).slice(2,8)}`;
            const newToken = await getTokenForRoom(roomName, sessionIdentityRef.current);
            if (newToken) roomObj = await Video.connect(newToken, { name: roomName, audio: false });
          } else throw err;
        }
        roomRef.current = roomObj;
        try { window.__vc_room = roomObj; } catch (e) {}
        // attach existing participants' tracks
          try {
            console.debug('[VideoChat] joined room as viewer', roomObj.name, 'localParticipant', roomObj.localParticipant && roomObj.localParticipant.identity);
            roomObj.participants.forEach(participant => console.debug('[VideoChat] existing participant', participant.identity));
          } catch (e) {}
        roomObj.participants.forEach(participant => {
          participant.tracks.forEach(publication => {
            if (publication.isSubscribed) safeAttachTrack(publication.track);
            publication.on('subscribed', track => safeAttachTrack(track));
            publication.on && publication.on('subscriptionFailed', (err) => console.warn('[VideoChat] subscriptionFailed', err));
          });
          participant.on('trackSubscribed', track => safeAttachTrack(track));
        });
        roomObj.on('participantConnected', participant => {
          participant.on('trackSubscribed', track => safeAttachTrack(track));
          participant.on && participant.on('trackSubscriptionFailed', (err) => console.warn('[VideoChat] trackSubscriptionFailed', err));
        });
        roomObj.on('disconnected', () => { console.debug('[VideoChat] viewer room disconnected'); try { setTimeout(() => { endCall(); }, 50); } catch(e){} });
        stopRingtone();
        setIncoming(null);
        setCallState('in-call');
        return;
      }
      // Fallback to original P2P accept flow if Twilio token not available
      const { from: caller } = inc;
      let offer = inc.offer || inc;
      if (offer && offer.offer) offer = offer.offer;
      if (!offer || !offer.sdp) {
        console.error('acceptIncoming: missing offer.sdp, aborting', offer);
        return;
      }
      if (!offer.type) offer = { ...offer, type: 'offer' };
      pcRef.current = new RTCPeerConnection({ iceServers: getIceServers() });
      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) sendSignal('ice', { to: caller, candidate: e.candidate });
      };
      pcRef.current.ontrack = (e) => {
        const stream = e.streams && e.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      };
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      // flush any ICE candidates that arrived before pc was created
      try {
        if (pendingIceRef.current && pendingIceRef.current.length) {
          for (const c of pendingIceRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch (err) { console.warn('[VideoChat] flush addIceCandidate (accept) failed', err); }
          }
          pendingIceRef.current = [];
          console.debug('[VideoChat] flushed buffered ICE candidates (accept)');
        }
      } catch (e) { console.warn('[VideoChat] flush pending ICE (accept) outer failed', e); }
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

  const endCall = () => {
    try { pcRef.current?.close(); } catch (e) {}
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { if (localVideoRef.current) localVideoRef.current.srcObject = null; } catch (e) {}
    try { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null; } catch (e) {}
    // If using Twilio, disconnect room and detach tracks
    try {
      if (roomRef.current) {
        try { roomRef.current.disconnect(); } catch (e) {}
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
    // notify the other side
    const to = selectedConversation?._id || (incoming && incoming.from);
    if (to) sendSignal('end', { to });
    // stop ringtone if any
    stopRingtone();
    setIncoming(null);
    setCallState('idle');
    try { notifiedRef.current = false; } catch (e) {}
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
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('in-call');
        } else {
          pendingRemoteDescRef.current = answer;
          console.debug('[VideoChat] buffered remote answer until pc ready');
        }
      } catch (e) { console.error(e); }
    };

    const handleRemoteIce = async ({ candidate }) => {
      try {
        if (pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          // buffer candidate until RTCPeerConnection exists
          pendingIceRef.current.push(candidate);
          console.debug('[VideoChat] buffered remote ICE candidate (no pc yet)');
        }
      } catch (e) { console.error(e); }
    };

    socket.on('incoming-call', handleIncoming);
    socket.on('call-answered', handleAnswered);
    socket.on('ice-candidate', handleRemoteIce);
    socket.on('call-ended', endCall);

    // Do not auto-start outgoing calls; user must click Start Call.
    // (This prevents the receiver's UI from opening local camera unintentionally.)

    if (initialIncoming) { setIncoming(initialIncoming); setCallState('ringing'); }

    return () => {
      socket.off('incoming-call', handleIncoming);
      socket.off('call-answered', handleAnswered);
      socket.off('ice-candidate', handleRemoteIce);
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
      if (avg < 8) console.warn('[video-snapshot] frame appears nearly black (avg<8)');
    } catch (e) {
      console.error('snapshotRemoteFrame failed', e);
    }
  };

  // Expose snapshot helper for quick console debugging
  try { window.__vc_snapshot = snapshotRemoteFrame; } catch (e) {}

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
