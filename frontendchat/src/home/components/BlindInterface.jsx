import { useEffect } from "react";
import useConversation from "../../Zustans/useConversation";

const BlindInterface = () => {
    const { messages, selectedConversation } = useConversation();

    const speak = (text) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.9; 
        window.speechSynthesis.speak(utterance);
    };

    useEffect(() => {
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            
            if (lastMessage.senderId === selectedConversation?._id) {
                speak(`رسالة جديدة من ${selectedConversation.fullName} تقول: ${lastMessage.message}`);
            }
        }
    }, [messages, selectedConversation]);

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white">
            <div className="w-64 h-64 rounded-full border-8 border-sky-500 animate-pulse flex items-center justify-center">
                <span className="text-8xl">🎙️</span>
            </div>
            <h1 className="mt-8 text-3xl font-bold italic">نظام المحادثة الصوتي نشط</h1>
        </div>
    );
};

export default BlindInterface;
