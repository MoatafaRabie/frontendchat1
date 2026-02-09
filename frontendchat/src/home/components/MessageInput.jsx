import { useState } from "react";
import { IoSend } from "react-icons/io5";
import axios from "axios";
import { useSocketContext } from "../../context/SocketContext"; 
import useConversation from "../../Zustans/useConversation"; 

const MessageInput = () => {
    const [messageText, setMessageText] = useState("");
    const [loading, setLoading] = useState(false);
    const { setMessages, selectedConversation } = useConversation();

    const handleSend = async (e) => {
        e.preventDefault();
        if (!messageText.trim() || loading) return;

        setLoading(true);
        try {
            const res = await axios.post(
                `https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app/api/message/send/${selectedConversation._id}`, 
                { messages: messageText }, 
                { withCredentials: true }
            );

            const data = res.data; 

            setMessages((prevMessages) => [...prevMessages, data]); 
            
            setMessageText(""); 
            console.log(" msg is sent and added ");
        } catch (error) {
            console.error(" Error sending message:", error);
            alert("error to sent the msg");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className='px-4 my-3' onSubmit={handleSend}>
            <div className='w-full relative'>
                <input
                    type='text'
                    className='border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white outline-none focus:border-sky-500'
                    placeholder='اكتب رسالتك...'
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                />
                <button 
                    type='submit' 
                    disabled={loading}
                    className='absolute inset-y-0 end-0 flex items-center pe-3 text-sky-500 hover:text-sky-300 disabled:text-gray-500'
                >
                    {loading ? (
                        <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                        <IoSend size={20} />
                    )}
                </button>
            </div>
        </form>
    );
};

export default MessageInput;