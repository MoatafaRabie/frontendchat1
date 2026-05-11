import { useEffect } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../Zustans/useConversation";

const useListenMessages = () => {
    const { socket } = useSocketContext();
    const { setMessages } = useConversation();

    useEffect(() => {
        let mounted = true;
        const handler = (newMessage) => {
            if (!mounted) return;
            console.log("Socket signal received:", newMessage);
            setMessages((prev) => {
                if (!newMessage || !newMessage._id) return prev;
                const exists = prev.some((m) => String(m._id) === String(newMessage._id));
                if (exists) return prev;
                return [...prev, newMessage];
            });
        };

        if (socket) {
            socket.on("newmessages", handler);
        }

        // SSE / window fallback
        const windowHandler = (e) => {
            if (!mounted) return;
            const newMessage = e.detail;
            console.log('Window newmessages event received:', newMessage);
            setMessages((prev) => {
                if (!newMessage || !newMessage._id) return prev;
                const exists = prev.some((m) => String(m._id) === String(newMessage._id));
                if (exists) return prev;
                return [...prev, newMessage];
            });
        };
        window.addEventListener('newmessages', windowHandler);

        return () => {
            mounted = false;
            if (socket) socket.off("newmessages", handler);
            window.removeEventListener('newmessages', windowHandler);
        };
    }, [socket, setMessages]); 
};

export default useListenMessages;
