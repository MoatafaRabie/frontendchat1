import { useEffect, useRef, useState } from "react";
import useConversation from "../../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";
import Video from 'twilio-video';

// Minimal, clean VideoChat component
const VideoChat = ({ visible, onClose }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const roomRef = useRef(null);
  const localTrackRef = useRef(null);
  const { authUser } = useAuth();
  const { selectedConversation } = useConversation();
  const [callState, setCallState] = useState('idle');

  const API_BASE =  'https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app';
  const signalingBase = API_BASE.replace(/\/$/, '');

  const getTokenForRoom = async (roomName, identity) => {
    try {
      const resp = await fetch(`${signalingBase}/api/twilio/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity, room: roomName })
      });
      if (!resp.ok) return null;
      const { token } = await resp.json();
      return token;
    } catch (e) { console.error('getTokenForRoom failed', e); return null; }
  };

  const attachTrackToEl = (track, el) => {
    if (!track || !el) return;
    try {
      if (typeof track.attach === 'function') {
        try { track.attach(el); } catch (e) {}
        if (!el.srcObject && track.mediaStreamTrack) el.srcObject = new MediaStream([track.mediaStreamTrack]);
      } else if (track.mediaStreamTrack) {
        el.srcObject = new MediaStream([track.mediaStreamTrack]);
      }
    } catch (e) { console.warn('attachTrackToEl failed', e); }
    try { el.autoplay = true; el.playsInline = true; el.muted = true; el.play && el.play().catch(()=>{}); } catch(e){}
  };

  const otherId = () => selectedConversation?._id;

  const handleParticipant = (participant) => {
    try { console.debug('[VideoChat] handleParticipant', participant.identity); } catch(e){}
    participant.tracks.forEach(publication => {
      try { console.debug('[VideoChat] publication', { trackSid: publication.trackSid, kind: publication.kind, isSubscribed: publication.isSubscribed }); } catch(e){}
      if (publication.isSubscribed && publication.track) attachTrackToEl(publication.track, remoteVideoRef.current);
      publication.on && publication.on('subscribed', t => { console.debug('[VideoChat] publication.subscribed', { kind: t.kind }); attachTrackToEl(t, remoteVideoRef.current); });
      publication.on && publication.on('unsubscribed', t => console.debug('[VideoChat] publication.unsubscribed', t && t.kind));
    });
    participant.on && participant.on('trackSubscribed', t => { console.debug('[VideoChat] participant.trackSubscribed', { kind: t.kind }); attachTrackToEl(t, remoteVideoRef.current); });
  };

  // Start call and publish local video (will request camera)
  const startCallWithCamera = async () => {
    const to = otherId(); if (!to) return;
    const roomName = `room-${to}`;
    const identity = `${authUser?._id || 'guest'}-${Math.random().toString(36).slice(2,8)}`;
    try {
      const token = await getTokenForRoom(roomName, identity);
      if (!token) throw new Error('no token');
      // stop existing local track
      try {
        if (localTrackRef.current) {
          try { localTrackRef.current.stop(); } catch (e) {}
          try { localTrackRef.current.detach && localTrackRef.current.detach().forEach(el => el.remove()); } catch(e){}
          localTrackRef.current = null;
        }
      } catch (e) {}
      let localTrack;
      try {
        localTrack = await Video.createLocalVideoTrack();
      } catch (err) {
        console.warn('[VideoChat] createLocalVideoTrack failed', err);
        if (err && err.name === 'NotReadableError') {
          console.warn('[VideoChat] Camera appears busy (Device in use). Close other apps/tabs using the camera and try again.');
          return;
        }
        throw err;
      }
      localTrackRef.current = localTrack;
      if (localVideoRef.current) try { localTrack.attach(localVideoRef.current); } catch (e) { try { localVideoRef.current.srcObject = new MediaStream([localTrack.mediaStreamTrack]); } catch(e){} }
      const room = await Video.connect(token, { name: roomName });
      roomRef.current = room;
      try { window.__vc_room = room; } catch(e){}
      console.debug('[VideoChat] room connected (caller)', { name: room.name, local: room.localParticipant && room.localParticipant.identity });
      setCallState('in-call');
      room.participants.forEach(handleParticipant);
      room.on('participantConnected', participant => { console.debug('[VideoChat] participantConnected', participant.identity); handleParticipant(participant); participant.on && participant.on('trackSubscribed', t => console.debug('[VideoChat] participant.trackSubscribed (event)', t && t.kind)); });
      room.on('reconnecting', () => console.debug('[VideoChat] room reconnecting'));
      room.on('reconnected', () => console.debug('[VideoChat] room reconnected'));
      room.on('disconnected', () => endCall());
    } catch (e) { console.error('startCallWithCamera failed', e); }
  };

  // Start call without opening local camera (no local tracks published)
  const startCallNoCamera = async () => {
    const to = otherId(); if (!to) return;
    const roomName = `room-${to}`;
    const identity = `${authUser?._id || 'guest'}-${Math.random().toString(36).slice(2,8)}`;
    try {
      const token = await getTokenForRoom(roomName, identity);
      if (!token) throw new Error('no token');
      // connect without creating local tracks
      const room = await Video.connect(token, { name: roomName });
      roomRef.current = room;
      try { window.__vc_room = room; } catch(e){}
      console.debug('[VideoChat] room connected (no-camera)', { name: room.name, local: room.localParticipant && room.localParticipant.identity });
      setCallState('in-call');
      room.participants.forEach(handleParticipant);
      room.on('participantConnected', participant => { console.debug('[VideoChat] participantConnected', participant.identity); handleParticipant(participant); participant.on && participant.on('trackSubscribed', t => console.debug('[VideoChat] participant.trackSubscribed (event)', t && t.kind)); });
      room.on('reconnecting', () => console.debug('[VideoChat] room reconnecting'));
      room.on('reconnected', () => console.debug('[VideoChat] room reconnected'));
      room.on('disconnected', () => endCall());
    } catch (e) { console.error('startCallNoCamera failed', e); }
  };

  const joinAsViewer = async () => {
    const from = otherId(); if (!from) return;
    const roomName = `room-${from}`;
    const identity = `${authUser?._id || 'guest'}-${Math.random().toString(36).slice(2,8)}`;
    try {
      const token = await getTokenForRoom(roomName, identity);
      if (!token) throw new Error('no token');
      const room = await Video.connect(token, { name: roomName });
      roomRef.current = room;
      try { window.__vc_room = room; } catch(e){}
      console.debug('[VideoChat] room connected (viewer)', { name: room.name, local: room.localParticipant && room.localParticipant.identity });
      setCallState('in-call');
      room.participants.forEach(handleParticipant);
      room.on('participantConnected', participant => { console.debug('[VideoChat] participantConnected', participant.identity); handleParticipant(participant); participant.on && participant.on('trackSubscribed', t => console.debug('[VideoChat] participant.trackSubscribed (event)', t && t.kind)); });
      room.on('reconnecting', () => console.debug('[VideoChat] room reconnecting'));
      room.on('reconnected', () => console.debug('[VideoChat] room reconnected'));
      room.on('disconnected', () => endCall());
    } catch (e) { console.error('joinAsViewer failed', e); }
  };

  const endCall = () => {
    try { if (roomRef.current) roomRef.current.disconnect(); } catch (e) {}
    try { if (localTrackRef.current) { try { localTrackRef.current.stop(); } catch(e){}; try { localTrackRef.current.detach && localTrackRef.current.detach().forEach(el => el.remove()); } catch(e){} } } catch (e) {}
    roomRef.current = null; localTrackRef.current = null;
    if (localVideoRef.current) try { localVideoRef.current.srcObject = null; } catch(e){}
    if (remoteVideoRef.current) try { remoteVideoRef.current.srcObject = null; } catch(e){}
    setCallState('idle'); onClose && onClose();
  };

  useEffect(() => { return () => { endCall(); }; }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-gray-900 p-4 rounded-md w-[90%] max-w-3xl">
        <div className="flex gap-4">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-1/2 rounded bg-black" style={{objectFit: 'cover'}} />
          <video ref={remoteVideoRef} autoPlay playsInline className="w-1/2 rounded bg-black" style={{objectFit: 'cover'}} />
        </div>
        <div className="mt-3" style={{display: 'flex', justifyContent: 'flex-end', gap: 8}}>
          {callState === 'idle' && (
            <>
              <button onClick={startCallNoCamera} className="px-2 py-1 bg-sky-600 text-white rounded">Start Call (No Camera)</button>
              <button onClick={startCallWithCamera} className="px-2 py-1 bg-indigo-600 text-white rounded">Start Call (With Camera)</button>
              <button onClick={joinAsViewer} className="px-2 py-1 bg-green-600 text-white rounded">Join as Viewer</button>
            </>
          )}
          {callState === 'in-call' && (
            <button onClick={endCall} className="px-3 py-1 bg-red-600 rounded">End</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoChat;

