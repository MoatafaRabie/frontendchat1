import { useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";

// WebRTC video call flow using socket.io signaling (call request, accept, ICE)
const VideoChat = ({ visible, onClose, initialIncoming = null }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const [callState, setCallState] = useState("idle"); // idle, calling, ringing, in-call
  const [incoming, setIncoming] = useState(null); // { from, offer }

  const constraints = { video: true, audio: true };
  const { authUser } = useAuth();

  const sendSignal = async (type, body) => {
    // try socket first
    try {
      if (socket && socket.connected) {
        switch (type) {
          case 'call':
            socket.emit('call-user', { to: body.to, offer: body.offer, from: body.from });
            return true;
          case 'answer':
            socket.emit('answer-call', { to: body.to, answer: body.answer, from: body.from });
            return true;
          case 'ice':
            socket.emit('ice-candidate', { to: body.to, candidate: body.candidate, from: body.from });
            return true;
          case 'end':
            socket.emit('end-call', { to: body.to, from: body.from });
            return true;
          default:
            break;
        }
      }
    } catch (e) {
      console.warn('socket signaling failed, falling back to HTTP', e);
    }

    // fallback to HTTP POST to SSE signaling endpoints
    try {
      const endpointMap = {
        call: '/api/signal/call',
        answer: '/api/signal/answer',
        ice: '/api/signal/ice',
        end: '/api/signal/end'
      };
      const url = `https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app${endpointMap[type]}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return data.ok ?? res.ok;
    } catch (err) {
      console.error('HTTP signaling failed', err);
      return false;
    }
  };

  const startLocal = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      console.error("getUserMedia failed:", err);
    }
  };

  const createPeer = (toId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal('ice', { to: toId, from: authUser?._id, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    return pc;
  };

  const otherId = () => selectedConversation?._id;

  const startCall = async () => {
    await startLocal();
    const to = otherId();
    if (!to) return;
    pcRef.current = createPeer(to);
    try {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      await sendSignal('call', { to, from: authUser?._id, offer: pcRef.current.localDescription });
      setCallState("calling");
    } catch (err) {
      console.error("createOffer failed:", err);
    }
  };

  const acceptIncoming = async () => {
    if (!incoming) return;
    await startLocal();
    pcRef.current = createPeer(incoming.from);
    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      await sendSignal('answer', { to: incoming.from, from: authUser?._id, answer: pcRef.current.localDescription });
      setIncoming(null);
      setCallState("in-call");
    } catch (err) {
      console.error("Error accepting call:", err);
    }
  };

  const endCall = () => {
    try {
      pcRef.current?.close();
    } catch (e) {}
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current = null;
    localStreamRef.current = null;
    // notify remote that call ended
    try {
      const to = selectedConversation?._id || (incoming && incoming.from);
      if (to) sendSignal('end', { to, from: authUser?._id });
    } catch (e) {}
    setIncoming(null);
    setCallState("idle");
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    if (!socket) return;

    let mounted = true;

    const handleIncoming = async ({ from, offer }) => {
      if (!mounted) return;
      setIncoming({ from, offer });
      setCallState("ringing");
    };

    const handleAnswered = async ({ from, answer }) => {
      try {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState("in-call");
      } catch (err) {
        console.error("Error handling answer:", err);
      }
    };

    const handleRemoteIce = async ({ from, candidate }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    };

    socket.on("incoming-call", handleIncoming);
    socket.on("call-answered", handleAnswered);
    socket.on("ice-candidate", handleRemoteIce);
    socket.on("call-ended", () => {
      endCall();
    });

    // auto-start when visible (caller clicked Video button)
    if (visible && selectedConversation) {
      startCall();
    }

    // if parent passed an incoming call (from global event) set it
    if (initialIncoming) {
      setIncoming(initialIncoming);
      setCallState('ringing');
    }

    return () => {
      mounted = false;
      socket.off("incoming-call", handleIncoming);
      socket.off("call-answered", handleAnswered);
      socket.off("ice-candidate", handleRemoteIce);
      socket.off("call-ended");
      endCall();
    };
  }, [visible, socket, selectedConversation, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-gray-900 p-4 rounded-md w-[90%] max-w-3xl">
        <div className="flex gap-4">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-1/2 rounded bg-black" />
          <video ref={remoteVideoRef} autoPlay playsInline className="w-1/2 rounded bg-black" />
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
              <button onClick={async () => { await sendSignal('end', { to: selectedConversation?._id, from: authUser?._id }); setCallState('idle'); }} className="px-3 py-1 bg-red-600 rounded">Cancel</button>
            </div>
          )}

          {callState === 'ringing' && incoming && (
            <div className="flex justify-between items-center">
              <span className="text-gray-200">Incoming call from {incoming.from}</span>
              <div className="flex gap-2">
                <button onClick={acceptIncoming} className="px-3 py-1 bg-green-600 rounded">Accept</button>
                <button onClick={async () => { await sendSignal('end', { to: incoming.from, from: authUser?._id }); setIncoming(null); setCallState('idle'); }} className="px-3 py-1 bg-red-600 rounded">Decline</button>
              </div>
            </div>
          )}

          {callState === 'in-call' && (
            <div className="flex justify-end">
              <button onClick={async () => { await sendSignal('end', { to: selectedConversation?._id, from: authUser?._id }); try { pcRef.current?.close(); } catch(e){} onClose(); }} className="px-3 py-1 bg-red-600 rounded">End</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
