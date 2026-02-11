import { useEffect, useRef } from "react";
import { useSocketContext } from "../../context/SocketContext"; 
import useConversation from "../../Zustans/useConversation";

import useListenMessages from "./useListenMessages"; 
import axios from "axios";

const Messages = () => {
    const { messages, setMessages, selectedConversation } = useConversation();
    const lastMessageRef = useRef(null);
console.log(" msg is sent ?", messages.length);
    useListenMessages(); 

    useEffect(() => {
        const getMessages = async () => {
            if (!selectedConversation?._id) return;
            try {
                const res = await axios.get(`https://backendforchat.vercel.app/api/message/${selectedConversation._id}`, {
                    withCredentials: true
                });
                setMessages(res.data);
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
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};


export default Messages;
