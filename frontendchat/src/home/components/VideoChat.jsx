import { useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";

const VideoChat = ({ visible, onClose, initialIncoming = null }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const { authUser } = useAuth();

  const [callState, setCallState] = useState("idle");
  const [incoming, setIncoming] = useState(null);

  const constraints = {
    video: true,
    audio: false,
  };

  const createPeerConnection = (targetId) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },

        // TURN SERVERS
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    });

    // ICE STATE
    pc.oniceconnectionstatechange = () => {
      console.log("ICE STATE:", pc.iceConnectionState);
    };

    // ICE CANDIDATES
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE Candidate");

        sendSignal("ice", {
          to: targetId,
          candidate: event.candidate,
        });
      }
    };

    // RECEIVE REMOTE STREAM
    pc.ontrack = (event) => {
      console.log("Remote Track Received");

      const remoteStream = event.streams[0];

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;

        remoteVideoRef.current
          .play()
          .catch((err) => console.log("Autoplay error:", err));
      }
    };

    return pc;
  };

  const sendSignal = async (type, body = {}) => {
    const fromId =
      body?.from || authUser?._id || socket?.id || null;

    const payload = {
      ...body,
      from: fromId,
    };

    if (!socket) return;

    switch (type) {
      case "call":
        socket.emit("call-user", {
          to: payload.to,
          offer: payload.offer,
          from: payload.from,
        });
        break;

      case "answer":
        socket.emit("answer-call", {
          to: payload.to,
          answer: payload.answer,
          from: payload.from,
        });
        break;

      case "ice":
        socket.emit("ice-candidate", {
          to: payload.to,
          candidate: payload.candidate,
          from: payload.from,
        });
        break;

      case "end":
        socket.emit("end-call", {
          to: payload.to,
          from: payload.from,
        });
        break;

      default:
        break;
    }
  };

  const otherId = () => selectedConversation?._id;

  // START CALL
  const startCall = async () => {
    try {
      const to = otherId();

      if (!to) return;

      // GET CAMERA
      const stream = await navigator.mediaDevices.getUserMedia(
        constraints
      );

      localStreamRef.current = stream;

      // SHOW LOCAL VIDEO
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // CREATE PEER
      const pc = createPeerConnection(to);

      pcRef.current = pc;

      // ADD TRACKS
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // CREATE OFFER
      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      // SEND OFFER
      await sendSignal("call", {
        to,
        offer: pc.localDescription,
      });

      setCallState("calling");
    } catch (err) {
      console.error("Start Call Error:", err);
    }
  };

  // ACCEPT CALL
  const acceptIncoming = async (inc = null) => {
    try {
      const data = inc || incoming;

      if (!data) return;

      const from = data.from;

      let offer = data.offer || data;

      if (offer.offer) {
        offer = offer.offer;
      }

      const pc = createPeerConnection(from);

      pcRef.current = pc;

      // SET REMOTE OFFER
      await pc.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      // CREATE ANSWER
      const answer = await pc.createAnswer();

      await pc.setLocalDescription(answer);

      // SEND ANSWER
      await sendSignal("answer", {
        to: from,
        answer: pc.localDescription,
      });

      setIncoming(null);
      setCallState("in-call");
    } catch (err) {
      console.error("Accept Call Error:", err);
    }
  };

  // END CALL
  const endCall = () => {
    try {
      pcRef.current?.close();
    } catch (e) {}

    try {
      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    } catch (e) {}

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    const to =
      selectedConversation?._id || incoming?.from;

    if (to) {
      sendSignal("end", { to });
    }

    pcRef.current = null;
    localStreamRef.current = null;

    setIncoming(null);
    setCallState("idle");

    onClose && onClose();
  };

  useEffect(() => {
    if (!socket || !visible) return;

    // INCOMING CALL
    const handleIncoming = ({ from, offer }) => {
      console.log("Incoming Call");

      const data = { from, offer };

      setIncoming(data);

      setCallState("ringing");

      // AUTO ACCEPT
      acceptIncoming(data);
    };

    // CALL ANSWERED
    const handleAnswered = async ({ answer }) => {
      try {
        await pcRef.current?.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        setCallState("in-call");
      } catch (err) {
        console.error(err);
      }
    };

    // RECEIVE ICE
    const handleRemoteIce = async ({ candidate }) => {
      try {
        if (candidate && pcRef.current) {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }
      } catch (err) {
        console.error("ICE Error:", err);
      }
    };

    socket.on("incoming-call", handleIncoming);
    socket.on("call-answered", handleAnswered);
    socket.on("ice-candidate", handleRemoteIce);
    socket.on("call-ended", endCall);

    if (initialIncoming) {
      setIncoming(initialIncoming);
      setCallState("ringing");
    }

    return () => {
      socket.off("incoming-call", handleIncoming);
      socket.off("call-answered", handleAnswered);
      socket.off("ice-candidate", handleRemoteIce);
      socket.off("call-ended", endCall);

      try {
        pcRef.current?.close();
      } catch (e) {}
    };
  }, [socket, visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-gray-900 p-4 rounded-md w-[90%] max-w-3xl">

        <div className="flex gap-4">

          {(callState === "calling" ||
            (callState === "in-call" &&
              localStreamRef.current)) ? (
            <>
              {/* LOCAL VIDEO */}
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-1/2 rounded bg-black"
                style={{ objectFit: "cover" }}
              />

              {/* REMOTE VIDEO */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-1/2 rounded bg-black"
                style={{ objectFit: "cover" }}
              />
            </>
          ) : (
            <>
              {/* REMOTE VIDEO ONLY */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full rounded bg-black"
                style={{ objectFit: "cover" }}
              />
            </>
          )}
        </div>

        <div className="mt-3">

          {callState === "idle" && (
            <div className="flex justify-end">
              <button
                onClick={startCall}
                className="px-3 py-1 bg-sky-600 text-white rounded"
              >
                Start Call
              </button>
            </div>
          )}

          {callState === "calling" && (
            <div className="flex justify-between items-center">
              <span className="text-white">
                Calling...
              </span>

              <button
                onClick={endCall}
                className="px-3 py-1 bg-red-600 rounded"
              >
                Cancel
              </button>
            </div>
          )}

          {callState === "ringing" && incoming && (
            <div className="flex justify-between items-center">
              <span className="text-white">
                Incoming Call
              </span>

              <div className="flex gap-2">
                <button
                  onClick={() => acceptIncoming()}
                  className="px-3 py-1 bg-green-600 rounded"
                >
                  Accept
                </button>

                <button
                  onClick={endCall}
                  className="px-3 py-1 bg-red-600 rounded"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {callState === "in-call" && (
            <div className="flex justify-end">
              <button
                onClick={endCall}
                className="px-3 py-1 bg-red-600 rounded"
              >
                End
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
