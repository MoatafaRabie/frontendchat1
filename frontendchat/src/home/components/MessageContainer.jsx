import { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import useConversation from "../../Zustans/useConversation";
import useListenMessages from "./useListenMessages";
import BlindInterface from "./BlindInterface"; 
import Messages from "./Messages";
import MessageInput from "./MessageInput";
import VideoChat from "./VideoChat";
import { useState } from "react";

const MessageContainer = () => {
    const { authUser } = useAuth();
    const { selectedConversation, setSelectedConversation } = useConversation();
    const [showVideo, setShowVideo] = useState(false);
    const [incomingCall, setIncomingCall] = useState(null);

    useEffect(() => {
        return () => setSelectedConversation(null);
    }, [setSelectedConversation]);

    useEffect(() => {
        const handler = (e) => {
            setIncomingCall(e.detail);
            setShowVideo(true);
        };
        window.addEventListener('incoming-call', handler);
        return () => window.removeEventListener('incoming-call', handler);
    }, []);

    if (!selectedConversation) {
        return (
            <div className='flex items-center justify-center w-full h-full'>
                <div className='px-4 text-center sm:text-lg md:text-xl text-gray-200 font-semibold flex flex-col items-center gap-2'>
                    <p>أهلاً بك {authUser?.fullName}</p>
                    <p>اختر محادثة للبدء</p>
                </div>
            </div>
        );
    }

    if (authUser?.role === "blind") {
        return <BlindInterface />;
    }

    return (
        <div className='flex flex-col w-full h-full'>
            <div className='bg-slate-500 px-4 py-2 mb-2'>
                <span className='label-text font-bold text-gray-900'>إلى: {selectedConversation.fullName}</span>
                <div className="float-right">
                    <button className="ml-2 px-2 py-1 bg-sky-600 text-white rounded" onClick={() => setShowVideo(true)}>Video</button>
                </div>
            </div>
            <Messages />
            <MessageInput />
            <VideoChat initialIncoming={incomingCall} visible={showVideo} onClose={() => { setShowVideo(false); setIncomingCall(null); }} />
        </div>
    );
};

export default MessageContainer;
