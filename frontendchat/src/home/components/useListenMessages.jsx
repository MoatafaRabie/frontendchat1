import { useEffect } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";

const useListenMessages = () => {
    const { socket } = useSocketContext();
    const { setMessages } = useConversation();

    useEffect(() => {
        if (!socket) return;

        socket.on("newmessages", (newMessage) => {
            console.log("🔥 Socket signal received:", newMessage);
            
            setMessages((prev) => [...prev, newMessage]);
        });

        return () => socket.off("newmessages");
    }, [socket, setMessages]); 
};

export default useListenMessages;