import { useEffect, useRef, useState } from "react";
// استخدام المسارات الصحيحة بناءً على هيكل مشروعك
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";

// One-way WebRTC: caller sends video (opens camera), receiver only receives and views.
const VideoChat = ({ visible, onClose, initialIncoming = null }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const debugCanvasRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  
  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const [callState, setCallState] = useState("idle"); // idle, calling, ringing, in-call
  const [incoming, setIncoming] = useState(null); // { from, offer }

  const { authUser } = useAuth();

  const getIceServers = () => {
    const turnUrl = process.env.REACT_APP_TURN_URL;
    const turnUser = process.env.REACT_APP_TURN_USERNAME;
    const turnPass = process.env.REACT_APP_TURN_PASSWORD;
    
    // استخدام سيرفرات STUN إضافية لضمان استقرار أكبر
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    
    if (turnUrl && turnUser && turnPass) {
      servers.push({ 
        urls: turnUrl, 
        username: turnUser, 
        credential: turnPass 
      });
      console.log('[VideoChat] using TURN server:', turnUrl);
    } else {
      console.warn('[VideoChat] No TURN server credentials found. Video might fail on different networks.');
    }
    return servers;
  };

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
      const SIGNALING_URL = process.env.REACT_APP_SIGNALING_URL || (typeof window !== 'undefined' && window.location && window.location.origin) || 'https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app';
      const base = SIGNALING_URL.replace(/\/$/, '');
      const url = `${base}${endpointMap[type]}`;
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      return true;
    } catch (err) {
      console.error('HTTP signaling failed', err);
      return false;
    }
  };

  const otherId = () => selectedConversation?._id;

  const startCall = async () => {
    const to = otherId();
    if (!to) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      pcRef.current = new RTCPeerConnection({ iceServers: getIceServers() });

      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal('ice', { to, candidate: e.candidate });
        }
      };

      pcRef.current.ontrack = (e) => {
        const stream = e.streams && e.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      };

      stream.getTracks().forEach((t) => pcRef.current.addTrack(t, stream));

      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      await sendSignal('call', { to, offer: pcRef.current.localDescription });
      setCallState('calling');
    } catch (err) {
      console.error('Error starting call:', err);
    }
  };

  const acceptIncoming = async (incomingParam = null) => {
    let inc = incomingParam || incoming;
    if (inc && (inc.nativeEvent || inc.type === 'click' || inc._reactName)) inc = incoming;
    if (!inc) return;
    
    try {
      const { from } = inc;
      let offer = inc.offer || inc;
      if (offer && offer.offer) offer = offer.offer;
      if (!offer || !offer.sdp) return;
      if (!offer.type) offer = { ...offer, type: 'offer' };

      pcRef.current = new RTCPeerConnection({ iceServers: getIceServers() });

      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal('ice', { to: from, candidate: e.candidate });
        }
      };

      pcRef.current.ontrack = (e) => {
        const stream = e.streams && e.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      };

      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      await sendSignal('answer', { to: from, answer: pcRef.current.localDescription });
      
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
    pcRef.current = null;
    localStreamRef.current = null;
    
    const to = selectedConversation?._id || (incoming && incoming.from);
    if (to) sendSignal('end', { to });
    
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
      acceptIncoming(inc);
    };
    const handleAnswered = async ({ answer }) => { try { await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer)); setCallState('in-call'); } catch (e) { console.error(e); } };
    const handleRemoteIce = async ({ candidate }) => { try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error(e); } };

    socket.on('incoming-call', handleIncoming);
    socket.on('call-answered', handleAnswered);
    socket.on('ice-candidate', handleRemoteIce);
    socket.on('call-ended', endCall);

    if (initialIncoming) { setIncoming(initialIncoming); setCallState('ringing'); }

    return () => {
      socket.off('incoming-call', handleIncoming);
      socket.off('call-answered', handleAnswered);
      socket.off('ice-candidate', handleRemoteIce);
      socket.off('call-ended', endCall);
      endCall();
    };
  }, [visible, socket, selectedConversation, initialIncoming]);

  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);

  const playRingtone = () => { /* ... existing ringtone logic ... */ };
  const stopRingtone = () => { /* ... existing stop logic ... */ };

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
              <button onClick={endCall} className="px-3 py-1 bg-red-600 rounded">Cancel</button>
            </div>
          )}

          {callState === 'ringing' && incoming && (
            <div className="flex justify-between items-center">
              <span className="text-gray-200">Incoming call...</span>
              <div className="flex gap-2">
                <button onClick={() => acceptIncoming()} className="px-3 py-1 bg-green-600 rounded">Accept</button>
                <button onClick={endCall} className="px-3 py-1 bg-red-600 rounded">Decline</button>
              </div>
            </div>
          )}

          {callState === 'in-call' && (
            <div className="flex justify-end">
              <button onClick={endCall} className="px-3 py-1 bg-red-600 rounded">End</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
