import { useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";
import { useAuth } from "../../context/AuthContext";
import Video from "twilio-video";

const VideoChat = ({ visible, onClose }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const roomRef = useRef(null);
  const localTrackRef = useRef(null);

  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const { authUser } = useAuth();

  const [callState, setCallState] = useState("idle");

  const API_BASE ="https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app";

  const signalingBase = API_BASE.replace(/\/$/, "");

  const otherId = () => selectedConversation?._id;

  // =========================
  // Attach Remote Video
  // =========================
  const safeAttachTrack = async (track) => {
    try {
      if (!track || track.kind !== "video") return;

      const el = remoteVideoRef.current;

      if (!el) {
        console.warn("Remote video element missing");
        return;
      }

      console.log("[VideoChat] attaching video");

      // تنظيف أي فيديو قديم
      if (el.srcObject) {
        try {
          el.srcObject.getTracks().forEach((t) => t.stop());
        } catch (e) {}
      }

      // Twilio Attach
      const attachedElement = track.attach();

      if (attachedElement.srcObject) {
        el.srcObject = attachedElement.srcObject;
      } else if (track.mediaStreamTrack) {
        const stream = new MediaStream([track.mediaStreamTrack]);
        el.srcObject = stream;
      }

      el.autoplay = true;
      el.playsInline = true;

      // مهم جدًا
      el.muted = false;

      await el.play();

      console.log("REMOTE VIDEO PLAYING", {
        width: el.videoWidth,
        height: el.videoHeight,
        readyState: el.readyState,
      });
    } catch (err) {
      console.error("safeAttachTrack error:", err);
    }
  };

  // =========================
  // Signaling
  // =========================
  const sendSignal = (event, data) => {
    if (!socket) return;

    socket.emit(event, data);
  };

  // =========================
  // Start Call
  // =========================
  const startCall = async () => {
    try {
      const to = otherId();

      if (!to) return;

      const roomName = `room-${to}`;

      // Get Twilio Token
      const response = await fetch(
        `${signalingBase}/api/twilio/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            identity: authUser?._id,
            room: roomName,
          }),
        }
      );

      const data = await response.json();

      // إنشاء local video
      const localTrack = await Video.createLocalVideoTrack();

      localTrackRef.current = localTrack;

      // عرض فيديو الكاميرا
      if (localVideoRef.current) {
        const localMedia = localTrack.attach();

        if (localMedia.srcObject) {
          localVideoRef.current.srcObject =
            localMedia.srcObject;
        } else {
          localVideoRef.current.srcObject =
            new MediaStream([localTrack.mediaStreamTrack]);
        }

        localVideoRef.current.muted = true;

        await localVideoRef.current.play();
      }

      // الاتصال بالغرفة
      const room = await Video.connect(data.token, {
        name: roomName,
        tracks: [localTrack],
        audio: false,
      });

      roomRef.current = room;

      console.log("Connected To Room");

      // إرسال إشعار للطرف التاني
      sendSignal("call-user", {
        to,
        room: roomName,
        from: authUser?._id,
      });

      // استقبال المشاركين الحاليين
      room.participants.forEach((participant) => {
        participant.tracks.forEach((publication) => {
          if (
            publication.isSubscribed &&
            publication.track.kind === "video"
          ) {
            safeAttachTrack(publication.track);
          }

          publication.on("subscribed", (track) => {
            if (track.kind === "video") {
              safeAttachTrack(track);
            }
          });
        });

        participant.on("trackSubscribed", (track) => {
          if (track.kind === "video") {
            safeAttachTrack(track);
          }
        });
      });

      // Participant جديد
      room.on("participantConnected", (participant) => {
        console.log("Participant Connected");

        participant.on("trackSubscribed", (track) => {
          if (track.kind === "video") {
            safeAttachTrack(track);
          }
        });
      });

      setCallState("in-call");
    } catch (err) {
      console.error("Start Call Error:", err);
    }
  };

  // =========================
  // Accept Call
  // =========================
  const acceptCall = async ({ room }) => {
    try {
      const response = await fetch(
        `${signalingBase}/api/twilio/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            identity: authUser?._id,
            room,
          }),
        }
      );

      const data = await response.json();

      // Viewer Only
      const roomObj = await Video.connect(data.token, {
        name: room,
        audio: false,
        video: false,
      });

      roomRef.current = roomObj;

      console.log("Viewer Joined Room");

      // Existing Participants
      roomObj.participants.forEach((participant) => {
        participant.tracks.forEach((publication) => {
          if (
            publication.isSubscribed &&
            publication.track.kind === "video"
          ) {
            safeAttachTrack(publication.track);
          }

          publication.on("subscribed", (track) => {
            if (track.kind === "video") {
              safeAttachTrack(track);
            }
          });
        });

        participant.on("trackSubscribed", (track) => {
          if (track.kind === "video") {
            safeAttachTrack(track);
          }
        });
      });

      // New Participant
      roomObj.on("participantConnected", (participant) => {
        participant.on("trackSubscribed", (track) => {
          if (track.kind === "video") {
            safeAttachTrack(track);
          }
        });
      });

      setCallState("in-call");
    } catch (err) {
      console.error("Accept Call Error:", err);
    }
  };

  // =========================
  // End Call
  // =========================
  const endCall = () => {
    try {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }

      if (localTrackRef.current) {
        localTrackRef.current.stop();
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }

      setCallState("idle");

      onClose?.();
    } catch (err) {
      console.error("End Call Error:", err);
    }
  };

  // =========================
  // Socket Events
  // =========================
  useEffect(() => {
    if (!socket || !visible) return;

    const handleIncomingCall = async (data) => {
      console.log("Incoming Call", data);

      await acceptCall(data);
    };

    socket.on("incoming-call", handleIncomingCall);

    return () => {
      socket.off("incoming-call", handleIncomingCall);
    };
  }, [socket, visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center">
      <div className="bg-gray-900 p-4 rounded-lg w-[90%] max-w-4xl">

        <div className="flex gap-4">

          {/* Local Video */}
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-1/2 rounded bg-black"
            style={{ objectFit: "cover" }}
          />

          {/* Remote Video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-1/2 rounded bg-black"
            style={{ objectFit: "cover" }}
          />
        </div>

        <div className="flex justify-end mt-4 gap-2">

          {callState === "idle" && (
            <button
              onClick={startCall}
              className="px-4 py-2 bg-sky-600 rounded text-white"
            >
              Start Call
            </button>
          )}

          {callState === "in-call" && (
            <button
              onClick={endCall}
              className="px-4 py-2 bg-red-600 rounded text-white"
            >
              End Call
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
