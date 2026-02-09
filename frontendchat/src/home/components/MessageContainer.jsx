import { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import useConversation from "../../Zustans/useConversation";
import useListenMessages from "./useListenMessages";
import BlindInterface from "./BlindInterface"; 
import Messages from "./Messages";
import MessageInput from "./MessageInput";

const MessageContainer = () => {
const { authUser } = useAuth();
    const { selectedConversation, setSelectedConversation } = useConversation();

    useListenMessages();

    useEffect(() => {
        return () => setSelectedConversation(null);
    }, [setSelectedConversation]);

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
            </div>
            <Messages />
            <MessageInput />
        </div>
    );
};

export default MessageContainer;