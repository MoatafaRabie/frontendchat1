import { useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../context/SocketContext"; 
import { useAuth } from "../../context/AuthContext";
import useConversation from "../../Zustans/useConversation";

import useListenMessages from "./useListenMessages"; 
import axios from "axios";

const Messages = () => {
    const { messages, setMessages, selectedConversation } = useConversation();
    const { socket } = useSocketContext();
    const { authUser } = useAuth();
    const [videoUrls, setVideoUrls] = useState({});
    const lastMessageRef = useRef(null);
console.log(" msg is sent ?", messages.length);
    useListenMessages(); 

    useEffect(() => {
        if (!socket || !selectedConversation?._id) return;

        // join the conversation room on the server so this socket receives messages
        console.log("Joining conversation room:", selectedConversation._id);
        socket.emit("join", selectedConversation._id);
        socket.emit("joinRoom", selectedConversation._id);

        return () => {
            socket.emit("leave", selectedConversation._id);
            socket.emit("leaveRoom", selectedConversation._id);
        };
    }, [socket, selectedConversation?._id]);

    useEffect(() => {
        const getMessages = async () => {
            if (!selectedConversation?._id) return;
            try {
                const res = await axios.get(`https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app/api/message/${selectedConversation._id}`, {
                    withCredentials: true
                });
                setMessages(res.data);
                // join the conversation room using conversationId from messages
                try {
                    const convId = res.data && res.data.length > 0 ? res.data[0].conversationId : null;
                    if (convId && socket) {
                        socket.emit('join', convId);
                        socket.emit('joinRoom', convId);
                        console.log('Joined conversation room (from getMessages):', convId);
                    }
                } catch (e) {}
            } catch (error) {
                console.error("Error geting عاااااا messages:", error);
            }
        };
        getMessages();
    }, [selectedConversation?._id, setMessages]);

    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => {
                lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        }
    }, [messages]);

    useEffect(() => {
        return () => {
            // cleanup object URLs
            Object.values(videoUrls).forEach((u) => {
                try { URL.revokeObjectURL(u); } catch (e) {}
            });
        };
    }, [videoUrls]);

    const fetchVideo = async (messageId) => {
        if (!messageId) return;
        if (videoUrls[messageId]) return; // already fetched

        try {
            const headers = {};
            if (authUser?.token) headers['Authorization'] = `Bearer ${authUser.token}`;

            const res = await fetch(`https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app/api/message/video/${messageId}`, {
                method: 'GET',
                headers,
                credentials: 'include'
            });

            if (!res.ok) {
                console.error('Failed to fetch video:', res.statusText);
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setVideoUrls((p) => ({ ...p, [messageId]: url }));
        } catch (err) {
            console.error('Error fetching video blob:', err);
        }
    };

    return (
        <div className='px-4 flex-1 overflow-auto py-4 flex flex-col gap-4 w-full'>
            {messages.length === 0 && (
                <p className='text-center text-gray-400 mt-10'>Send a message to start the conversation!</p>
            )}

            {messages.length > 0 && messages.map((msg, index) => {
                const isFromMe = msg.senderId !== selectedConversation?._id;
                const isLastMessage = index === messages.length - 1;

                return (
                    <div 
                        key={msg._id || index} 
                        ref={isLastMessage ? lastMessageRef : null} 
                        className={`flex w-full ${isFromMe ? "justify-end" : "justify-start"}`}
                    >
                        <div className={`flex flex-col ${isFromMe ? "items-end" : "items-start"} max-w-[75%]`}>
                            <div className={`px-4 py-2 rounded-2xl text-white shadow-md w-fit break-words ${
                                isFromMe ? "bg-sky-600 rounded-tr-none" : "bg-slate-700 rounded-tl-none"
                            }`}>
                                <p className="text-sm md:text-base leading-relaxed">
                                    {msg.messages}
                                </p>
                                {(() => {
                                    const hasVideo = msg.type === 'video' || msg.video || msg.hasVideo || msg.isVideo;
                                    if (!hasVideo) return null;
                                    return (
                                        <div className="mt-2">
                                            {videoUrls[msg._id] ? (
                                                <video src={videoUrls[msg._id]} controls className="max-w-full rounded" />
                                            ) : (
                                                <button onClick={() => fetchVideo(msg._id)} className="mt-2 px-3 py-1 bg-green-600 rounded">Play Video</button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default Messages;
